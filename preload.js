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
    startPlay: (accountId) => ipcRenderer.invoke('start-play', { accountId }),

    getActivityLog: () => ipcRenderer.invoke('get-activity-log'),
    getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
    saveUserProfile: (profile) => ipcRenderer.invoke('save-user-profile', profile),

    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    onSwitchState: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('switch-state', listener);
        return () => ipcRenderer.removeListener('switch-state', listener);
    }
}));
