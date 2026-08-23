const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

test('todos los IDs usados por el renderer existen en el HTML', () => {
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
    const referencedIds = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]));
    const missing = [...referencedIds].filter((id) => !htmlIds.has(id));
    assert.deepEqual(missing, []);
});

test('no existen IDs duplicados', () => {
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, []);
});

test('la interfaz no carga fuentes ni scripts remotos y declara CSP', () => {
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /https?:\/\//);
});

test('el renderer inicia operaciones únicamente mediante accountId', () => {
    assert.match(js, /rendererApi\.startPlay\(account\.id/);
    assert.doesNotMatch(js, /encryptedPassword/);
});

test('el renderer no colisiona con la API expuesta por contextBridge', () => {
    assert.match(js, /^const rendererApi = window\.api \|\| null;/m);
    assert.doesNotMatch(js, /^const api\s*=/m);
});

test('los botones de inicio de juego permanecen activos y no bloquean la cuenta activa', () => {
    assert.doesNotMatch(js, /disabled data-current="true"/);
    assert.match(js, /refreshRuntimeStatus/);
});

test('el renderer incluye soporte de multi-perfiles y avatares personalizados', () => {
    assert.match(html, /id="profileDropdown"/);
    assert.match(html, /id="profilesModal"/);
    assert.match(html, /id="accCustomAvatar"/);
    assert.match(js, /selectProfile/);
    assert.match(js, /setupCustomAvatarUploader/);
});

test('el renderer incluye soporte de estilos visuales y paleta de colores', () => {
    assert.match(html, /id="themesModal"/);
    assert.match(html, /id="settingsStyleCards"/);
    assert.match(html, /id="settingsColorSwatches"/);
    assert.match(js, /applyStyle/);
    assert.match(js, /applyColor/);
});

