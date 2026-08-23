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
        profileId: String(account?.profileId || 'default'),
        displayName: String(account?.displayName || account?.username || `Cuenta ${index + 1}`).slice(0, 60),
        game: account?.game === 'lol' ? 'league_of_legends' : (account?.game || 'valorant'),
        region: String(account?.region || 'EU').toUpperCase(),
        username: String(account?.username || '').slice(0, 80),
        encryptedPassword: typeof account?.encryptedPassword === 'string' ? account.encryptedPassword : '',
        riotId: String(account?.riotId || '').slice(0, 80),
        rank: String(account?.rank || '').slice(0, 40),
        level: String(account?.level || '').slice(0, 40),
        avatarAgent: String(account?.avatarAgent || (account?.game === 'lol' ? 'Ahri' : 'Jett')).slice(0, 40),
        customAvatar: typeof account?.customAvatar === 'string' ? account.customAvatar : '',
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
            profile: path.join(dataDir, 'profile.json'),
            profiles: path.join(dataDir, 'profiles.json')
        };
        this.cache = {
            accounts: null,
            settings: null,
            activity: null,
            profile: null,
            profilesData: null
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
        if (!fs.existsSync(this.paths.profiles)) {
            const legacyProfile = readJson(this.paths.profile, null);
            const defaultName = (legacyProfile && (legacyProfile.username || legacyProfile.profile?.username)) || 'Principal';
            this.saveProfilesData({
                activeProfileId: 'default',
                profiles: [{
                    id: 'default',
                    name: String(defaultName).trim() || 'Principal',
                    createdAt: Math.floor(Date.now() / 1000)
                }]
            });
        }
    }

    loadAccounts() {
        if (this.cache.accounts) return this.cache.accounts;
        const data = readJson(this.paths.accounts, { schemaVersion: SCHEMA_VERSION, accounts: [] });
        const rows = Array.isArray(data) ? data : data.accounts;
        this.cache.accounts = Array.isArray(rows) ? rows.map(normalizeStoredAccount) : [];
        return this.cache.accounts;
    }

    saveAccounts(accounts) {
        this.cache.accounts = accounts;
        atomicWriteJson(this.paths.accounts, { schemaVersion: SCHEMA_VERSION, accounts });
    }

    loadPublicAccounts() {
        return this.loadAccounts().map((acc) => {
            const { encryptedPassword, ...publicAccount } = acc;
            return { ...publicAccount, hasPassword: Boolean(encryptedPassword) };
        });
    }

    loadSettings() {
        if (this.cache.settings) return this.cache.settings;
        const data = readJson(this.paths.settings, { schemaVersion: SCHEMA_VERSION, settings: this.defaults });
        this.cache.settings = { ...this.defaults, ...(data.settings || data) };
        return this.cache.settings;
    }

    saveSettings(settings) {
        this.cache.settings = settings;
        atomicWriteJson(this.paths.settings, { schemaVersion: SCHEMA_VERSION, settings });
    }

    loadActivity() {
        if (this.cache.activity) return this.cache.activity;
        const data = readJson(this.paths.activity, { schemaVersion: SCHEMA_VERSION, entries: [] });
        const rows = Array.isArray(data) ? data : data.entries;
        this.cache.activity = Array.isArray(rows) ? rows : [];
        return this.cache.activity;
    }

    saveActivity(entries) {
        this.cache.activity = entries.slice(0, 50);
        atomicWriteJson(this.paths.activity, { schemaVersion: SCHEMA_VERSION, entries: this.cache.activity });
    }

    loadProfile() {
        if (this.cache.profile) return this.cache.profile;
        const data = readJson(this.paths.profile, { schemaVersion: SCHEMA_VERSION, profile: {} });
        this.cache.profile = data.profile || data;
        return this.cache.profile;
    }

    saveProfile(profile) {
        this.cache.profile = profile;
        atomicWriteJson(this.paths.profile, { schemaVersion: SCHEMA_VERSION, profile });
    }

    loadProfilesData() {
        if (this.cache.profilesData) return this.cache.profilesData;
        const data = readJson(this.paths.profiles, {
            schemaVersion: SCHEMA_VERSION,
            activeProfileId: 'default',
            profiles: [{ id: 'default', name: 'Principal', createdAt: Math.floor(Date.now() / 1000) }]
        });
        const profiles = Array.isArray(data.profiles) && data.profiles.length > 0
            ? data.profiles
            : [{ id: 'default', name: 'Principal', createdAt: Math.floor(Date.now() / 1000) }];
        const activeProfileId = profiles.some((p) => p.id === data.activeProfileId)
            ? data.activeProfileId
            : profiles[0].id;
        this.cache.profilesData = { activeProfileId, profiles };
        return this.cache.profilesData;
    }

    saveProfilesData(data) {
        this.cache.profilesData = data;
        atomicWriteJson(this.paths.profiles, {
            schemaVersion: SCHEMA_VERSION,
            activeProfileId: data.activeProfileId || 'default',
            profiles: data.profiles || []
        });
    }

    loadProfiles() {
        return this.loadProfilesData().profiles;
    }

    getActiveProfileId() {
        return this.loadProfilesData().activeProfileId;
    }

    setActiveProfileId(id) {
        const data = this.loadProfilesData();
        if (data.profiles.some((p) => p.id === id)) {
            data.activeProfileId = id;
            this.saveProfilesData(data);
            return data;
        }
        return data;
    }

    saveProfileItem(profileInput) {
        const data = this.loadProfilesData();
        const existingIndex = profileInput.id ? data.profiles.findIndex((p) => p.id === profileInput.id) : -1;
        const now = Math.floor(Date.now() / 1000);
        const profile = {
            id: existingIndex >= 0 ? data.profiles[existingIndex].id : (profileInput.id || crypto.randomUUID()),
            name: String(profileInput.name || 'Nuevo Perfil').trim().slice(0, 40),
            createdAt: existingIndex >= 0 ? data.profiles[existingIndex].createdAt : now
        };
        if (existingIndex >= 0) {
            data.profiles[existingIndex] = profile;
        } else {
            data.profiles.push(profile);
            data.activeProfileId = profile.id;
        }
        this.saveProfilesData(data);
        return data;
    }

    deleteProfileItem(id) {
        const data = this.loadProfilesData();
        if (data.profiles.length <= 1) {
            throw new Error('No se puede eliminar el único perfil.');
        }
        const remaining = data.profiles.filter((p) => p.id !== id);
        if (remaining.length === data.profiles.length) return data;
        
        const fallbackProfileId = remaining[0].id;
        if (data.activeProfileId === id) {
            data.activeProfileId = fallbackProfileId;
        }
        data.profiles = remaining;
        this.saveProfilesData(data);

        // Reassign any accounts from deleted profile to the fallback profile
        const accounts = this.loadAccounts();
        let changed = false;
        for (const account of accounts) {
            if (account.profileId === id) {
                account.profileId = fallbackProfileId;
                changed = true;
            }
        }
        if (changed) this.saveAccounts(accounts);

        return data;
    }
}

module.exports = {
    JsonStore,
    SCHEMA_VERSION,
    atomicWriteJson,
    normalizeStoredAccount,
    readJson
};
