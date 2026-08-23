const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

let windowRef;
const consoleErrors = [];

async function main() {
    ipcMain.handle('get-accounts', () => [{
        id: 'smoke-account', displayName: 'Operador EU', game: 'valorant', region: 'EU',
        username: 'smoke-user', riotId: 'Operador#EU', rank: 'Oro', level: '94 RR',
        avatarAgent: 'Jett', notes: '', isFavorite: true, lastUsedAt: 0, profileId: 'default'
    }]);
    ipcMain.handle('get-activity-log', () => []);
    ipcMain.handle('get-user-profile', () => ({ username: '', createdAt: 0 }));
    ipcMain.handle('get-profiles', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('save-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('delete-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('set-active-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('get-app-version', () => '1.0.1');
    ipcMain.handle('get-settings', () => ({ startWithWindows: false, minimizeToTray: true, closeOnLaunch: false, confirmSwitch: true, autoLaunchGame: true, soundEnabled: false, reducedMotion: true, initialDelayMs: 1800, charDelayMs: 15, fieldDelayMs: 200, customRiotPath: '' }));
    ipcMain.handle('get-runtime-status', () => ({ riotClientFound: true, riotSignatureValid: true, activeSession: { riotId: 'Operador#EU', region: 'EU' }, runningGame: null, encryptionAvailable: true, activeRequestId: null }));
    app.setPath('userData', path.join(app.getPath('temp'), 'remswitcher-electron-smoke'));
    await app.whenReady();
    windowRef = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true
        }
    });
    windowRef.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) consoleErrors.push(message);
    });
    await windowRef.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    await new Promise((resolve) => setTimeout(resolve, 150));

    const apiShape = await windowRef.webContents.executeJavaScript(`({
        hasApi: typeof window.api === 'object',
        hasRendererApiCollision: typeof window.rendererApi !== 'object',
        addButton: document.getElementById('btnAdd') !== null,
        accountCard: document.querySelector('.account-card') !== null,
        gameBadge: document.querySelector('.game-badge')?.textContent.includes('VALORANT'),
        currentBadge: document.querySelector('.current-badge')?.textContent === 'ACTIVA',
        themePicker: document.getElementById('themePicker') !== null,
        userPill: document.getElementById('userPill') !== null
    })`);
    await windowRef.webContents.executeJavaScript("document.querySelector('[data-tab=\\\"accounts\\\"]').click()");
    const accountsView = await windowRef.webContents.executeJavaScript("({ view: document.body.dataset.view, title: document.getElementById('pageTitle')?.textContent })");
    await windowRef.webContents.executeJavaScript("document.getElementById('btnAdd').click()");
    const accountModalOpen = await windowRef.webContents.executeJavaScript("document.getElementById('accountModal').classList.contains('active')");
    await windowRef.webContents.executeJavaScript("document.getElementById('btnCloseAccountModal').click(); document.querySelector(\"[data-tab='settings']\").click()");
    const settingsModalOpen = await windowRef.webContents.executeJavaScript("document.getElementById('settingsModal').classList.contains('active')");

    if (consoleErrors.length) throw new Error(`Errores de consola: ${consoleErrors.join(' | ')}`);
    if (!apiShape.hasApi || !apiShape.hasRendererApiCollision || !apiShape.addButton || !apiShape.accountCard || !apiShape.gameBadge || !apiShape.currentBadge || accountsView.view !== 'accounts' || !accountsView.title || !accountModalOpen || !settingsModalOpen) {
        throw new Error('El smoke test no pudo accionar la precarga o los botones del renderer.');
    }
    console.log('Electron smoke: precarga y botones OK');
}

main()
    .then(() => app.exit(0))
    .catch((error) => {
        console.error(error.message);
        app.exit(1);
    });
