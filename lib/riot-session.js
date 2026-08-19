const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

function readRiotLockfile(localAppData = process.env.LOCALAPPDATA || '') {
    const candidates = [
        path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
        path.join(localAppData, 'Riot Games', 'Riot Client', 'lockfile')
    ];
    for (const filePath of candidates) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const parts = fs.readFileSync(filePath, 'utf8').trim().split(':');
            const port = Number.parseInt(parts[2], 10);
            const password = parts[3] || '';
            if (!Number.isInteger(port) || port < 1 || port > 65535 || !password || parts.length < 4) continue;
            return { filePath, port, password };
        } catch {}
    }
    return null;
}

function requestRiotLocal(lockfile, { method = 'GET', requestPath, timeoutMs = 1500, requestImpl = https.request } = {}) {
    return new Promise((resolve) => {
        let request;
        try {
            request = requestImpl({
                hostname: '127.0.0.1',
                port: lockfile.port,
                path: requestPath,
                method,
                rejectUnauthorized: false,
                headers: { Authorization: `Basic ${Buffer.from(`riot:${lockfile.password}`).toString('base64')}` },
                timeout: timeoutMs
            }, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => { body += chunk; });
                response.on('end', () => resolve({ statusCode: response.statusCode || 0, body }));
            });
            request.on('error', () => resolve(null));
            request.on('timeout', () => { request.destroy(); resolve(null); });
            request.end();
        } catch {
            resolve(null);
        }
    });
}

async function getRiotSessionState({ localAppData, requestImpl } = {}) {
    const lockfile = readRiotLockfile(localAppData);
    if (!lockfile) return { state: 'unavailable', reason: 'NO_LOCKFILE', session: null };
    const response = await requestRiotLocal(lockfile, { requestPath: '/chat/v1/session', requestImpl });
    if (!response) return { state: 'unavailable', reason: 'NO_RESPONSE', session: null };
    if ([401, 403, 404].includes(response.statusCode)) return { state: 'logged_out', reason: 'UNAUTHENTICATED', session: null };
    if (response.statusCode < 200 || response.statusCode >= 300) return { state: 'unavailable', reason: `HTTP_${response.statusCode}`, session: null };
    try {
        const parsed = JSON.parse(response.body);
        const gameName = parsed.game_name || parsed.name || '';
        if (!gameName) return { state: 'logged_out', reason: 'EMPTY_SESSION', session: null };
        return {
            state: 'active',
            reason: 'AUTHENTICATED',
            session: {
                riotId: parsed.game_tag ? `${gameName}#${parsed.game_tag}` : gameName,
                gameName,
                tag: parsed.game_tag || '',
                region: String(parsed.region || '').toUpperCase()
            }
        };
    } catch {
        return { state: 'unavailable', reason: 'INVALID_RESPONSE', session: null };
    }
}

async function queryRiotSession(options = {}) {
    const status = await getRiotSessionState(options);
    return status.state === 'active' ? status.session : null;
}

async function waitForRiotLogout({ localAppData, requestImpl, timeoutMs = 10000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastState = 'unavailable';
    while (Date.now() <= deadline) {
        const status = await getRiotSessionState({ localAppData, requestImpl });
        lastState = status.state;
        if (status.state === 'logged_out' || status.reason === 'NO_LOCKFILE') {
            return { confirmed: true, state: status.state, reason: status.reason };
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return { confirmed: false, state: lastState, reason: 'VERIFICATION_TIMEOUT' };
}

async function logoutRiotSession({ localAppData, requestImpl, verifyTimeoutMs = 10000, verifyIntervalMs = 250 } = {}) {
    const lockfile = readRiotLockfile(localAppData);
    if (!lockfile) return { attempted: false, loggedOut: false, reason: 'NO_LOCKFILE', verification: 'not-needed' };

    let response = await requestRiotLocal(lockfile, {
        method: 'DELETE',
        requestPath: '/rso-auth/v1/authorization',
        requestImpl
    });

    if (!response || response.statusCode === 404 || response.statusCode === 405) {
        response = await requestRiotLocal(lockfile, {
            method: 'POST',
            requestPath: '/lol-login/v1/delete-rso-on-close',
            requestImpl
        });
    }

    const endpointAccepted = Boolean(response && response.statusCode >= 200 && response.statusCode < 300);
    if (!endpointAccepted) {
        return { attempted: true, loggedOut: false, statusCode: response?.statusCode || 0, verification: 'endpoint-failed' };
    }

    await requestRiotLocal(lockfile, {
        method: 'DELETE',
        requestPath: '/riot-messaging-service/v1/session',
        requestImpl
    });

    const verification = await waitForRiotLogout({
        localAppData,
        requestImpl,
        timeoutMs: verifyTimeoutMs,
        intervalMs: verifyIntervalMs
    });
    return {
        attempted: true,
        loggedOut: verification.confirmed,
        statusCode: response.statusCode,
        verification: verification.confirmed ? 'confirmed' : verification.reason
    };
}

module.exports = {
    readRiotLockfile,
    requestRiotLocal,
    getRiotSessionState,
    queryRiotSession,
    waitForRiotLogout,
    logoutRiotSession
};
