const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', Object.freeze({
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccount: (account) => ipcRenderer.invoke('save-account', account),
    deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
    toggleFavorite: (id, isFavorite) => ipcRenderer.invoke('toggle-favorite', { id, isFavorite }),

    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getRuntimeStatus: () => ipcRenderer.invoke('get-runtime-status'),
    testRiotPath: () => ipcRenderer.invoke('test-riot-path'),
    openRiotClient: () => ipcRenderer.invoke('open-riot-client'),

    importActiveSession: () => ipcRenderer.invoke('import-active-session'),
    forceCloseGames: () => ipcRenderer.invoke('force-close-games'),
    syncLiveRank: () => ipcRenderer.invoke('sync-live-rank'),
    startPlay: (accountId, targetGame) => ipcRenderer.invoke('start-play', { accountId, targetGame }),

    getActivityLog: () => ipcRenderer.invoke('get-activity-log'),
    getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
    saveUserProfile: (profile) => ipcRenderer.invoke('save-user-profile', profile),

    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    setActiveProfile: (id) => ipcRenderer.invoke('set-active-profile', id),
    onProfilesUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('profiles-updated', listener);
        return () => ipcRenderer.removeListener('profiles-updated', listener);
    },

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('update-status', listener);
        return () => ipcRenderer.removeListener('update-status', listener);
    },

    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    onGlobalShortcut: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('global-shortcut-focus', listener);
        return () => ipcRenderer.removeListener('global-shortcut-focus', listener);
    },

    onAccountsUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('accounts-updated', listener);
        return () => ipcRenderer.removeListener('accounts-updated', listener);
    },

    onSwitchState: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('switch-state', listener);
        return () => ipcRenderer.removeListener('switch-state', listener);
    }
}));
