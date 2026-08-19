const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runBridge } = require('../lib/bridge-runner');
const { OperationGate } = require('../lib/operation-gate');
const { launchDetached } = require('../lib/process-launcher');
const { queryRiotSession, logoutRiotSession } = require('../lib/riot-session');

function simulatedBridge(handler, capture = {}) {
    return (command, args, options) => {
        capture.command = command;
        capture.args = args;
        capture.options = options;
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = {
            end(payload) {
                capture.request = JSON.parse(payload);
                queueMicrotask(() => handler(child, capture.request));
            }
        };
        child.kill = () => queueMicrotask(() => child.emit('close', null));
        return child;
    };
}

const REQUEST = Object.freeze({
    username: 'private-user',
    password: 'never-in-argv',
    riotClientPath: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    initialDelayMs: 1800,
    charDelayMs: 15,
    fieldDelayMs: 200
});

test('el puente simulado completa el flujo y recibe secretos solo por stdin', async () => {
    const capture = {};
    const states = [];
    await runBridge({
        bridgePath: 'mock-bridge.exe',
        request: REQUEST,
        spawnImpl: simulatedBridge((child) => {
            child.stdout.write('{"state":"CredentialsSubmitted","message":"OK"}\n');
            child.emit('close', 0);
        }, capture),
        onState: (event) => states.push(event.state)
    });

    assert.deepEqual(capture.args, []);
    assert.equal(capture.request.password, REQUEST.password);
    assert.deepEqual(states, ['CredentialsSubmitted']);
});

test('el puente simulado comunica espera de MFA sin dar el flujo por completado', async () => {
    const states = [];
    await runBridge({
        bridgePath: 'mock-bridge.exe',
        request: REQUEST,
        spawnImpl: simulatedBridge((child) => {
            child.stdout.write('{"state":"WaitingForAuthentication","message":"Completa MFA"}\n');
            child.stdout.write('{"state":"CredentialsSubmitted","message":"Enviado"}\n');
            child.emit('close', 0);
        }),
        onState: (event) => states.push(event.state)
    });
    assert.deepEqual(states, ['WaitingForAuthentication', 'CredentialsSubmitted']);
});

test('el puente conserva el código recuperable de contraseña incorrecta', async () => {
    await assert.rejects(runBridge({
        bridgePath: 'mock-bridge.exe',
        request: REQUEST,
        spawnImpl: simulatedBridge((child) => {
            child.stdout.write('{"state":"Error","message":"Contraseña incorrecta","errorCode":"PASSWORD_INCORRECT"}\n');
            child.emit('close', 31);
        })
    }), (error) => error.code === 'PASSWORD_INCORRECT' && !error.message.includes(REQUEST.password));
});

test('el puente termina de forma controlada al agotar el tiempo', async () => {
    await assert.rejects(runBridge({
        bridgePath: 'mock-bridge.exe',
        request: REQUEST,
        timeoutMs: 5,
        spawnImpl: simulatedBridge(() => {})
    }), (error) => error.code === 'BRIDGE_TIMEOUT');
});

test('el bloqueo rechaza una segunda operación y libera solo la petición activa', () => {
    const gate = new OperationGate();
    assert.deepEqual(gate.begin('first'), { accepted: true, requestId: 'first' });
    assert.deepEqual(gate.begin('second'), { accepted: false, requestId: 'first', errorCode: 'SWITCH_BUSY' });
    gate.end('second');
    assert.equal(gate.activeRequestId, 'first');
    gate.end('first');
    assert.equal(gate.activeRequestId, null);
});

test('un error al iniciar el juego se devuelve como fallo recuperable', async () => {
    const spawnFailure = () => {
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit('error', new Error('missing')));
        return child;
    };
    await assert.rejects(launchDetached('missing.exe', [], spawnFailure), (error) => error.code === 'LAUNCH_FAILED');
});

function fakeRiotRequest(responses, requests) {
    return (options, callback) => {
        requests.push(options);
        const request = new EventEmitter();
        request.end = () => queueMicrotask(() => {
            const next = responses.shift() || { statusCode: 500, body: '' };
            const response = new EventEmitter();
            response.statusCode = next.statusCode;
            response.setEncoding = () => {};
            callback(response);
            if (next.body) response.emit('data', next.body);
            response.emit('end');
        });
        request.destroy = () => {};
        return request;
    };
}

test('detecta la sesión local y cierra RSO antes de reiniciar Riot', async () => {
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-riot-'));
    const configDir = path.join(localAppData, 'Riot Games', 'Riot Client', 'Config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'lockfile'), 'RiotClient:1234:51234:local-token:https');
    const requests = [];
    const requestImpl = fakeRiotRequest([
        { statusCode: 200, body: JSON.stringify({ game_name: 'Operador', game_tag: 'EUW', region: 'EUW' }) },
        { statusCode: 204, body: '' },
        { statusCode: 204, body: '' },
        { statusCode: 401, body: '' }
    ], requests);

    const session = await queryRiotSession({ localAppData, requestImpl });
    const logout = await logoutRiotSession({ localAppData, requestImpl });
    fs.rmSync(localAppData, { recursive: true, force: true });

    assert.equal(session.riotId, 'Operador#EUW');
    assert.equal(logout.loggedOut, true);
    assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
        'GET /chat/v1/session',
        'DELETE /rso-auth/v1/authorization',
        'DELETE /riot-messaging-service/v1/session',
        'GET /chat/v1/session'
    ]);
});

test('usa el endpoint de compatibilidad cuando RSO no expone DELETE', async () => {
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-riot-'));
    const configDir = path.join(localAppData, 'Riot Games', 'Riot Client', 'Config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'lockfile'), 'RiotClient:1234:51234:local-token:https');
    const requests = [];
    const logout = await logoutRiotSession({
        localAppData,
        requestImpl: fakeRiotRequest([{ statusCode: 404 }, { statusCode: 204 }, { statusCode: 204 }, { statusCode: 401 }], requests)
    });
    fs.rmSync(localAppData, { recursive: true, force: true });

    assert.equal(logout.loggedOut, true);
    assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
        'DELETE /rso-auth/v1/authorization',
        'POST /lol-login/v1/delete-rso-on-close',
        'DELETE /riot-messaging-service/v1/session',
        'GET /chat/v1/session'
    ]);
});

test('no da por cerrado el logout si la sesión sigue activa', async () => {
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-riot-'));
    const configDir = path.join(localAppData, 'Riot Games', 'Riot Client', 'Config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'lockfile'), 'RiotClient:1234:51234:local-token:https');
    const logout = await logoutRiotSession({
        localAppData,
        verifyTimeoutMs: 5,
        verifyIntervalMs: 1,
        requestImpl: fakeRiotRequest([
            { statusCode: 204 },
            { statusCode: 204 },
            { statusCode: 200, body: JSON.stringify({ game_name: 'SigueActivo', game_tag: 'EU' }) },
            { statusCode: 200, body: JSON.stringify({ game_name: 'SigueActivo', game_tag: 'EU' }) },
            { statusCode: 200, body: JSON.stringify({ game_name: 'SigueActivo', game_tag: 'EU' }) }
        ], [])
    });
    fs.rmSync(localAppData, { recursive: true, force: true });

    assert.equal(logout.loggedOut, false);
    assert.equal(logout.verification, 'VERIFICATION_TIMEOUT');
});

test('distingue cliente Riot ausente de una sesión cerrada', async () => {
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-riot-'));
    const status = await queryRiotSession({
        localAppData,
        requestImpl: () => { throw new Error('no debe llamarse'); }
    });
    const logout = await logoutRiotSession({ localAppData });
    fs.rmSync(localAppData, { recursive: true, force: true });

    assert.equal(status, null);
    assert.equal(logout.reason, 'NO_LOCKFILE');
});
