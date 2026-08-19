const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAccountInput, normalizeSettings } = require('../lib/validation');

const defaults = {
    initialDelayMs: 1800,
    charDelayMs: 15,
    fieldDelayMs: 200
};

test('normaliza el identificador antiguo de LoL', () => {
    const account = normalizeAccountInput({
        displayName: 'Main', game: 'lol', region: 'eu', username: 'player', password: 'secret'
    });
    assert.equal(account.game, 'league_of_legends');
    assert.equal(account.region, 'EU');
});

test('rechaza juegos, regiones y campos obligatorios inválidos', () => {
    assert.throws(() => normalizeAccountInput({ game: 'unknown', displayName: 'A', username: 'B' }), /Juego/);
    assert.throws(() => normalizeAccountInput({ game: 'valorant', region: 'XX', displayName: 'A', username: 'B' }), /Región/);
    assert.throws(() => normalizeAccountInput({ game: 'valorant', region: 'EU', displayName: '', username: 'B' }), /obligatorio/);
});

test('limita los tiempos de automatización a rangos seguros', () => {
    const settings = normalizeSettings({ initialDelayMs: 99999, charDelayMs: 0, fieldDelayMs: '300' }, defaults);
    assert.equal(settings.initialDelayMs, 10000);
    assert.equal(settings.charDelayMs, 1);
    assert.equal(settings.fieldDelayMs, 300);
});

test('migra autoLaunchValorant al ajuste común de juego', () => {
    assert.equal(normalizeSettings({ autoLaunchValorant: false }, defaults).autoLaunchGame, false);
});
