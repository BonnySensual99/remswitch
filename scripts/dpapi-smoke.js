const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { decryptFromCandidates } = require('../lib/legacy-safe-storage');
const { atomicWriteJson } = require('../lib/storage');

const accountDir = process.env.REMSWITCH_ACCOUNT_DIR || path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'RemSwitcher');
const keyDir = process.env.REMSWITCH_KEY_DIR || accountDir;
fs.mkdirSync(keyDir, { recursive: true });
app.setPath('userData', keyDir);

app.whenReady().then(() => {
    const filePath = path.join(accountDir, 'accounts.json');
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const accounts = Array.isArray(document.accounts) ? document.accounts : [];
    let valid = safeStorage.isEncryptionAvailable();
    let migrated = 0;
    try {
        valid = valid && accounts.every((account) => {
            if (!String(account.encryptedPassword || '').startsWith('v2:')) return false;
            const encrypted = Buffer.from(account.encryptedPassword.slice(3), 'base64');
            let value;
            try {
                value = safeStorage.decryptString(encrypted);
            } catch {
                value = decryptFromCandidates(encrypted, [
                    path.join(process.env.APPDATA || '', 'valorant-account-manager', 'Local State'),
                    path.join(process.env.APPDATA || '', 'remswitcher', 'Local State')
                ]);
                account.encryptedPassword = `v2:${safeStorage.encryptString(value).toString('base64')}`;
                migrated += 1;
            }
            return value.length > 0;
        });
    } catch { valid = false; }
    if (valid && migrated) atomicWriteJson(filePath, { schemaVersion: document.schemaVersion || 1, accounts });
    process.stdout.write(JSON.stringify({ accountsChecked: accounts.length, decryptable: valid, migrated }));
    app.quit();
});
