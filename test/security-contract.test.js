const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'bridge_main.cpp'), 'utf8');
const bridgeRunner = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bridge-runner.js'), 'utf8');
const riotSession = fs.readFileSync(path.join(__dirname, '..', 'lib', 'riot-session.js'), 'utf8');
const riotManager = fs.readFileSync(path.join(__dirname, '..', 'src', 'RiotManager.cpp'), 'utf8');

test('la contraseña no se pasa al puente como argumento', () => {
    assert.match(bridgeRunner, /spawnImpl\(bridgePath, \[\]/);
    assert.match(bridgeRunner, /child\.stdin\.end/);
    assert.doesNotMatch(main, /execFile\([^\n]+password/);
    assert.match(bridge, /argc != 1/);
    assert.match(main, /riotClientPath: riotPath/);
});

test('las cuentas públicas excluyen el blob cifrado', () => {
    assert.match(main, /const \{ encryptedPassword, \.\.\.publicAccount \}/);
    assert.match(main, /start-play/);
    assert.match(main, /accountId/);
});

test('no existe recuperación Base64 a texto plano', () => {
    assert.doesNotMatch(main, /Buffer\.from\(encryptedData, 'base64'\)\.toString\('utf8'\)/);
});

test('los dos juegos tienen comandos de lanzamiento independientes', () => {
    assert.match(main, /launch-product=valorant/);
    assert.match(main, /launch-product=league_of_legends/);
});

test('el puente comunica errores de autenticación recuperables', () => {
    assert.match(bridge, /PASSWORD_INCORRECT/);
    assert.match(bridge, /NO_LOGIN_WINDOW/);
    assert.match(bridge, /detectAuthenticationError/);
});

test('la automatización nativa identifica controles editables por UI Automation', () => {
    assert.match(riotManager, /UIA_EditControlTypeId/);
    assert.match(riotManager, /get_CurrentIsKeyboardFocusable/);
    assert.match(riotManager, /password|contraseña/);
    assert.match(riotManager, /user|usuario|email/);
});

test('el logout exige verificación posterior de la sesión', () => {
    assert.match(riotSession, /waitForRiotLogout/);
    assert.match(riotSession, /VERIFICATION_TIMEOUT/);
    assert.match(riotSession, /rso-auth\/v1\/authorization/);
});
