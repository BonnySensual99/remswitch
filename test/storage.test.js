const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore, readJson } = require('../lib/storage');

const defaults = { confirmSwitch: true, initialDelayMs: 1800, charDelayMs: 15, fieldDelayMs: 200 };

test('migra cuentas antiguas, conserva DPAPI y crea copia de seguridad', (context) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-test-'));
    context.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const legacyDir = path.join(root, 'legacy');
    const dataDir = path.join(root, 'new');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'accounts.json'), JSON.stringify([{
        id: 123, displayName: 'Main', username: 'player', encryptedPassword: 'v2:ABC', region: 'EU'
    }]));

    const store = new JsonStore({ dataDir, legacyDir, defaults });
    const accounts = store.loadAccounts();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].id, '123');
    assert.equal(accounts[0].game, 'valorant');
    assert.equal(accounts[0].encryptedPassword, 'v2:ABC');
    assert.ok(fs.existsSync(path.join(dataDir, 'legacy-accounts.backup.json')));
    assert.equal(readJson(path.join(dataDir, 'accounts.json'), {}).schemaVersion, 1);
});

test('las escrituras de cuentas dejan un documento versionado válido', (context) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remswitch-test-'));
    context.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const store = new JsonStore({ dataDir: path.join(root, 'new'), legacyDir: path.join(root, 'legacy'), defaults });
    store.saveAccounts([{ id: 'one', game: 'valorant', encryptedPassword: 'v2:ABC' }]);
    const raw = readJson(store.paths.accounts, null);
    assert.equal(raw.schemaVersion, 1);
    assert.equal(raw.accounts[0].id, 'one');
    assert.equal(fs.readdirSync(path.dirname(store.paths.accounts)).some((name) => name.includes('.tmp-')), false);
});
