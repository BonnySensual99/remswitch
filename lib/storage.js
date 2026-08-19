const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function atomicWriteJson(filePath, data) {
    ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
}

function normalizeStoredAccount(account, index = 0) {
    const now = Math.floor(Date.now() / 1000);
    const legacyId = account && account.id != null ? String(account.id) : '';
    return {
        id: legacyId || crypto.randomUUID(),
        displayName: String(account?.displayName || account?.username || `Cuenta ${index + 1}`).slice(0, 60),
        game: account?.game === 'lol' ? 'league_of_legends' : (account?.game || 'valorant'),
        region: String(account?.region || 'EU').toUpperCase(),
        username: String(account?.username || '').slice(0, 80),
        encryptedPassword: typeof account?.encryptedPassword === 'string' ? account.encryptedPassword : '',
        riotId: String(account?.riotId || '').slice(0, 80),
        rank: String(account?.rank || '').slice(0, 40),
        level: String(account?.level || '').slice(0, 40),
        avatarAgent: String(account?.avatarAgent || (account?.game === 'lol' ? 'Ahri' : 'Jett')).slice(0, 40),
        notes: String(account?.notes || '').slice(0, 500),
        isFavorite: Boolean(account?.isFavorite ?? account?.favorite),
        createdAt: Number(account?.createdAt) || now,
        lastUsedAt: Number(account?.lastUsedAt) || 0
    };
}

class JsonStore {
    constructor({ dataDir, legacyDir, defaults }) {
        this.dataDir = dataDir;
        this.legacyDir = legacyDir;
        this.defaults = defaults;
        this.paths = {
            accounts: path.join(dataDir, 'accounts.json'),
            settings: path.join(dataDir, 'settings.json'),
            activity: path.join(dataDir, 'activity.json'),
            profile: path.join(dataDir, 'profile.json')
        };
        ensureDir(dataDir);
        this.migrateLegacy();
    }

    migrateLegacy() {
        if (!fs.existsSync(this.paths.accounts)) {
            const legacyAccountsPath = path.join(this.legacyDir, 'accounts.json');
            const legacyAccounts = readJson(legacyAccountsPath, []);
            if (Array.isArray(legacyAccounts)) {
                if (fs.existsSync(legacyAccountsPath)) {
                    fs.copyFileSync(legacyAccountsPath, path.join(this.dataDir, 'legacy-accounts.backup.json'));
                }
                this.saveAccounts(legacyAccounts.map(normalizeStoredAccount));
            }
        } else {
            const current = readJson(this.paths.accounts, null);
            if (Array.isArray(current)) this.saveAccounts(current.map(normalizeStoredAccount));
        }

        if (!fs.existsSync(this.paths.settings)) {
            const legacy = readJson(path.join(this.legacyDir, 'settings.json'), {});
            this.saveSettings({ ...this.defaults, ...legacy });
        }
        if (!fs.existsSync(this.paths.activity)) this.saveActivity([]);
        if (!fs.existsSync(this.paths.profile)) {
            const legacy = readJson(path.join(this.legacyDir, 'user_profile.json'), {});
            this.saveProfile({
                username: String(legacy.username || '').slice(0, 40),
                createdAt: Number(legacy.createdAt) || Math.floor(Date.now() / 1000)
            });
        }
    }

    loadAccounts() {
        const data = readJson(this.paths.accounts, { schemaVersion: SCHEMA_VERSION, accounts: [] });
        const rows = Array.isArray(data) ? data : data.accounts;
        return Array.isArray(rows) ? rows.map(normalizeStoredAccount) : [];
    }

    saveAccounts(accounts) {
        atomicWriteJson(this.paths.accounts, { schemaVersion: SCHEMA_VERSION, accounts });
    }

    loadSettings() {
        const data = readJson(this.paths.settings, { schemaVersion: SCHEMA_VERSION, settings: this.defaults });
        return { ...this.defaults, ...(data.settings || data) };
    }

    saveSettings(settings) {
        atomicWriteJson(this.paths.settings, { schemaVersion: SCHEMA_VERSION, settings });
    }

    loadActivity() {
        const data = readJson(this.paths.activity, { schemaVersion: SCHEMA_VERSION, entries: [] });
        const rows = Array.isArray(data) ? data : data.entries;
        return Array.isArray(rows) ? rows : [];
    }

    saveActivity(entries) {
        atomicWriteJson(this.paths.activity, { schemaVersion: SCHEMA_VERSION, entries: entries.slice(0, 50) });
    }

    loadProfile() {
        const data = readJson(this.paths.profile, { schemaVersion: SCHEMA_VERSION, profile: {} });
        return data.profile || data;
    }

    saveProfile(profile) {
        atomicWriteJson(this.paths.profile, { schemaVersion: SCHEMA_VERSION, profile });
    }
}

module.exports = {
    JsonStore,
    SCHEMA_VERSION,
    atomicWriteJson,
    normalizeStoredAccount,
    readJson
};
