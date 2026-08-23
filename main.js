const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, session, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const util = require('util');
const { execFileSync, execFile } = require('child_process');
const execFileAsync = util.promisify(execFile);
const { JsonStore } = require('./lib/storage');
const { normalizeAccountInput, normalizeProfileInput, normalizeSettings } = require('./lib/validation');
const { decryptFromCandidates } = require('./lib/legacy-safe-storage');
const { runBridge } = require('./lib/bridge-runner');
const { OperationGate } = require('./lib/operation-gate');
const { launchDetached } = require('./lib/process-launcher');
const { queryRiotSession, queryLiveRankAndStats, logoutRiotSession } = require('./lib/riot-session');

const APP_DATA_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'RemSwitcher');
const LEGACY_DATA_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'ValorantAccountManager');
fs.mkdirSync(APP_DATA_DIR, { recursive: true });
app.setPath('userData', APP_DATA_DIR);

const DEFAULT_SETTINGS = Object.freeze({
    startWithWindows: false,
    minimizeToTray: true,
    autoLaunchGame: true,
    autoCloseRunningGames: true,
    autoSyncRank: true,
    globalShortcut: 'CommandOrControl+Alt+R',
    closeOnLaunch: false,
    confirmSwitch: true,
    soundEnabled: true,
    reducedMotion: false,
    initialDelayMs: 1800,
    charDelayMs: 15,
    fieldDelayMs: 200,
    autoPlayPreDelayMs: 1500,
    autoPlayTabs: 19,
    autoPlayTabDelayMs: 50,
    customRiotPath: ''
});

const GAME_ARGS = Object.freeze({
    valorant: ['--launch-product=valorant', '--launch-patchline=live'],
    league_of_legends: ['--launch-product=league_of_legends', '--launch-patchline=live']
});

const GAME_PROCESSES = Object.freeze([
    'VALORANT.exe',
    'VALORANT-Win64-Shipping.exe',
    'LeagueClient.exe',
    'LeagueClientUx.exe',
    'League of Legends.exe'
]);

const RIOT_PROCESSES = Object.freeze(['RiotClientServices.exe', 'Riot Client.exe', 'RiotClientUx.exe']);
const LOG_MAX_BYTES = 1024 * 1024;
const logPath = path.join(APP_DATA_DIR, 'app.log');

let mainWindow = null;
let tray = null;
let store = null;
const operationGate = new OperationGate();

function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(logPath) || fs.statSync(logPath).size < LOG_MAX_BYTES) return;
        const backup = `${logPath}.1`;
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        fs.renameSync(logPath, backup);
    } catch {}
}

function log(level, message) {
    try {
        fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        rotateLogIfNeeded();
        const safeMessage = String(message)
            .replace(/Authorization:\s*Basic\s+\S+/gi, 'Authorization: [REDACTED]')
            .replace(/password["'=:\s]+\S+/gi, 'password=[REDACTED]');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${level}] ${safeMessage}\n`, 'utf8');
    } catch {}
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublicAccount(account) {
    const { encryptedPassword, ...publicAccount } = account;
    return { ...publicAccount, hasPassword: Boolean(encryptedPassword) };
}

function encryptPassword(plainText) {
    if (!plainText) throw new Error('La contraseña es obligatoria.');
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Windows DPAPI no está disponible para cifrar la contraseña.');
    }
    return `v2:${safeStorage.encryptString(plainText).toString('base64')}`;
}

function decryptLegacyDpapi(encryptedData) {
    if (!/^[A-Za-z0-9+/=]+$/.test(encryptedData) || encryptedData.length > 32768) {
        throw new Error('El formato de contraseña antigua no es válido.');
    }
    const script = `Add-Type -AssemblyName System.Security;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$d=[System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${encryptedData}'),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($d)`;
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 1024 * 1024
    }).trim();
    return Buffer.from(result, 'base64').toString('utf8');
}

function decryptAccountPassword(account) {
    const encrypted = account.encryptedPassword || '';
    if (encrypted.startsWith('v2:')) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows DPAPI no está disponible.');
        const encryptedBuffer = Buffer.from(encrypted.slice(3), 'base64');
        try {
            return safeStorage.decryptString(encryptedBuffer);
        } catch {
            const roaming = process.env.APPDATA || '';
            const plainText = decryptFromCandidates(encryptedBuffer, [
                path.join(roaming, 'valorant-account-manager', 'Local State'),
                path.join(roaming, 'remswitcher', 'Local State')
            ]);
            account.encryptedPassword = encryptPassword(plainText);
            const accounts = store.loadAccounts();
            const index = accounts.findIndex((item) => item.id === account.id);
            if (index >= 0) {
                accounts[index] = account;
                store.saveAccounts(accounts);
            }
            return plainText;
        }
    }
    if (!encrypted) throw new Error('La cuenta no tiene una contraseña guardada.');

    const plainText = decryptLegacyDpapi(encrypted);
    account.encryptedPassword = encryptPassword(plainText);
    const accounts = store.loadAccounts();
    const index = accounts.findIndex((item) => item.id === account.id);
    if (index >= 0) {
        accounts[index] = account;
        store.saveAccounts(accounts);
    }
    return plainText;
}

function findRiotClientPath() {
    const settings = store.loadSettings();
    if (settings.customRiotPath) return validateRiotExecutable(settings.customRiotPath, true);

    const programData = process.env.ALLUSERSPROFILE || 'C:\\ProgramData';
    const installsPath = path.join(programData, 'Riot Games', 'RiotClientInstalls.json');
    try {
        const installs = JSON.parse(fs.readFileSync(installsPath, 'utf8'));
        for (const candidate of [installs.rc_live, installs.rc_default]) {
            if (candidate && fs.existsSync(candidate)) return candidate;
        }
    } catch {}

    const candidates = [
        'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
        'C:\\Program Files\\Riot Games\\Riot Client\\RiotClientServices.exe',
        'C:\\Program Files (x86)\\Riot Games\\Riot Client\\RiotClientServices.exe'
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

let riotSignatureCache = new Map();

function validateRiotExecutable(inputPath, verifySignature = false) {
    const resolved = path.resolve(String(inputPath || ''));
    if (path.basename(resolved).toLowerCase() !== 'riotclientservices.exe' || !fs.existsSync(resolved)) {
        throw new Error('Selecciona un RiotClientServices.exe válido.');
    }
    if (verifySignature) {
        if (riotSignatureCache.has(resolved)) {
            if (!riotSignatureCache.get(resolved)) {
                throw new Error('El ejecutable no tiene una firma válida de Riot Games.');
            }
            return resolved;
        }
        
        const encodedPath = Buffer.from(resolved, 'utf8').toString('base64');
        const script = `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'));$s=Get-AuthenticodeSignature -LiteralPath $p;Write-Output ($s.Status.ToString()+'|'+$s.SignerCertificate.Subject)`;
        const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024
        }).trim();
        
        const isValid = result.startsWith('Valid|') && result.toLowerCase().includes('riot games');
        riotSignatureCache.set(resolved, isValid);
        
        if (!isValid) {
            throw new Error('El ejecutable no tiene una firma válida de Riot Games.');
        }
    }
    return resolved;
}

function resolveValidatedRiotClient() {
    const foundPath = findRiotClientPath();
    if (!foundPath) throw Object.assign(new Error('No se encontró RiotClientServices.exe.'), { code: 'RIOT_NOT_FOUND' });
    try {
        return validateRiotExecutable(foundPath, true);
    } catch (error) {
        error.code = error.code || 'RIOT_SIGNATURE_INVALID';
        throw error;
    }
}

async function getRunningProcessesAsync(targetProcesses) {
    try {
        const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
            encoding: 'utf8', windowsHide: true, timeout: 5000
        });
        const lowerOutput = stdout.toLowerCase();
        return targetProcesses.filter(exeName => lowerOutput.includes(`"${exeName.toLowerCase()}"`));
    } catch {
        return [];
    }
}

async function terminateRiotProcesses() {
    let running = await getRunningProcessesAsync(RIOT_PROCESSES);
    if (!running.length) return true;
    try {
        const args = ['/F'];
        for (const processName of running) args.push('/IM', processName);
        await execFileAsync('taskkill.exe', args, { windowsHide: true, timeout: 8000 });
    } catch {}
    for (let attempt = 0; attempt < 30; attempt += 1) {
        running = await getRunningProcessesAsync(RIOT_PROCESSES);
        if (!running.length) return true;
        await delay(200);
    }
    return false;
}

async function terminateGameProcesses() {
    let running = await getRunningProcessesAsync(GAME_PROCESSES);
    if (!running.length) return true;
    try {
        const args = ['/F', '/T'];
        for (const processName of running) args.push('/IM', processName);
        await execFileAsync('taskkill.exe', args, { windowsHide: true, timeout: 8000 });
    } catch {}
    for (let attempt = 0; attempt < 20; attempt += 1) {
        running = await getRunningProcessesAsync(GAME_PROCESSES);
        if (!running.length) return true;
        await delay(200);
    }
    return false;
}

function updateGlobalShortcut(shortcutKey) {
    try {
        globalShortcut.unregisterAll();
        if (!shortcutKey) return;
        globalShortcut.register(shortcutKey, () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isVisible() && mainWindow.isFocused()) {
                mainWindow.minimize();
            } else {
                showMainWindow();
                mainWindow.webContents.send('global-shortcut-focus');
            }
        });
    } catch (error) {
        log('WARN', `Error registrando atajo global (${shortcutKey}): ${error.message}`);
    }
}

function getBridgeExePath() {
    const candidates = [
        path.join(process.resourcesPath, 'native', 'RiotManagerBridge.exe'),
        path.join(process.resourcesPath, 'resources', 'RiotManagerBridge.exe'),
        path.join(__dirname, 'native', 'RiotManagerBridge.exe'),
        path.join(__dirname, 'resources', 'RiotManagerBridge.exe'),
        path.join(__dirname, 'build', 'bin', 'Release', 'RiotManagerBridge.exe')
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function emitSwitch(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('switch-state', payload);
}

async function waitForAuthenticatedSession(account, payloadBase) {
    const deadline = Date.now() + 90000;
    emitSwitch({ ...payloadBase, state: 'WaitingForAuthentication', message: 'Esperando confirmación de Riot. Completa el MFA si aparece.' });
    while (Date.now() < deadline) {
        const sessionInfo = await queryRiotSession();
        if (sessionInfo) {
            if (account.riotId && sessionInfo.riotId.toLowerCase() !== account.riotId.toLowerCase()) {
                const error = new Error(`Riot inició otra cuenta (${sessionInfo.riotId}).`);
                error.code = 'ACCOUNT_MISMATCH';
                throw error;
            }
            return sessionInfo;
        }
        await delay(1000);
    }
    const error = new Error('Riot no confirmó la sesión a tiempo. Revisa la contraseña o completa el MFA.');
    error.code = 'AUTH_TIMEOUT';
    throw error;
}

function getSwitchErrorState(error) {
    if (error?.uiState) return error.uiState;
    if (error?.code === 'PASSWORD_INCORRECT') return 'WrongPassword';
    if (['BRIDGE_TIMEOUT', 'AUTH_TIMEOUT'].includes(error?.code)) return 'Timeout';
    if (['RIOT_LOGOUT_FAILED', 'RIOT_NOT_FOUND', 'RIOT_SIGNATURE_INVALID', 'BRIDGE_MISSING', 'NO_LOGIN_WINDOW'].includes(error?.code)) return 'ManualActionRequired';
    return 'Error';
}

async function startAccountSwitch(accountId, requestId, targetGame = null) {
    const payloadBase = { requestId, accountId };
    try {
        const accounts = store.loadAccounts();
        const account = accounts.find((item) => item.id === accountId);
        if (!account) throw Object.assign(new Error('La cuenta ya no existe.'), { code: 'ACCOUNT_NOT_FOUND' });
        payloadBase.game = targetGame === 'none' ? 'riot' : (targetGame || account.game || 'valorant');
        const settings = normalizeSettings(store.loadSettings(), DEFAULT_SETTINGS);

        emitSwitch({ ...payloadBase, state: 'CheckingRiotClient', message: 'Comprobando Riot Client…' });
        const runningGamesList = await getRunningProcessesAsync(GAME_PROCESSES);
        const runningGame = runningGamesList.length > 0 ? runningGamesList[0] : undefined;
        if (runningGame) {
            if (settings.autoCloseRunningGames) {
                emitSwitch({ ...payloadBase, state: 'CheckingRiotClient', message: `Cerrando ${runningGame} para cambiar de cuenta…` });
                const closed = await terminateGameProcesses();
                if (!closed) throw Object.assign(new Error(`No se pudo cerrar el juego (${runningGame}).`), { code: 'GAME_CLOSE_FAILED' });
            } else {
                throw Object.assign(new Error('Cierra el juego antes de cambiar de cuenta.'), { code: 'GAME_RUNNING' });
            }
        }

        const riotPath = resolveValidatedRiotClient();
        const bridgePath = getBridgeExePath();
        if (!fs.existsSync(bridgePath)) throw Object.assign(new Error('No se encontró el puente nativo.'), { code: 'BRIDGE_MISSING' });

        const activeSession = await queryRiotSession();
        const effectiveGame = targetGame === 'none' ? null : (targetGame || (settings.autoLaunchGame ? (account.game || 'valorant') : null));
        const alreadyLoggedIn = Boolean(activeSession && account.riotId && activeSession.riotId.toLowerCase() === account.riotId.toLowerCase());

        if (alreadyLoggedIn) {
            if (effectiveGame && GAME_ARGS[effectiveGame]) {
                const gameLabel = effectiveGame === 'league_of_legends' ? 'League of Legends' : 'VALORANT';
                emitSwitch({ ...payloadBase, state: 'LaunchingGame', message: `Iniciando ${gameLabel}…` });
                const { shell } = require('electron');
                const uri = effectiveGame === 'league_of_legends' ? 'riotclient://launch/league_of_legends/live' : 'riotclient://launch/valorant/live';
                await shell.openExternal(uri).catch(() => {});
                
                const shortcutPath = effectiveGame === 'league_of_legends' 
                    ? 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\League of Legends.lnk'
                    : 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\VALORANT.lnk';
                if (require('fs').existsSync(shortcutPath)) {
                    await shell.openPath(shortcutPath);
                }

                // MAGIC FALLBACK: Send Tabs and Enter to click "Play" manually
                const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$proc = Get-Process -Name "RiotClientUx" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
    [Win32]::SetForegroundWindow($proc.MainWindowHandle)
}
Add-Type -AssemblyName System.Windows.Forms
$preDelay = ${settings.autoPlayPreDelayMs ?? 1500}
  if ($preDelay -gt 0) { Start-Sleep -Milliseconds $preDelay }
$tabs = ${settings.autoPlayTabs ?? 23}
if ($tabs -gt 0) {
    for ($i=0; $i -lt $tabs; $i++) {
        [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
        $delay = ${settings.autoPlayTabDelayMs ?? 50}
        if ($delay -gt 0) { Start-Sleep -Milliseconds $delay }
    }
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
}
`;
                const tempPs1 = require('path').join(require('os').tmpdir(), 'rem_riot_click.ps1');
                require('fs').writeFileSync(tempPs1, psScript, 'utf8');
                require('child_process').exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`);
            } else {
                emitSwitch({ ...payloadBase, state: 'StartingRiotClient', message: 'Mostrando Riot Client…' });
                await launchDetached(riotPath, ['--open-shortcuts']);
            }
        } else {
            if (activeSession) {
                emitSwitch({ ...payloadBase, state: 'LoggingOut', message: `Cerrando la sesión de ${activeSession.riotId}…` });
                const logout = await logoutRiotSession();
                if (!logout.loggedOut) {
                    throw Object.assign(new Error('Riot Client no confirmó el cierre de sesión. Cierra sesión manualmente y vuelve a intentarlo.'), { code: 'RIOT_LOGOUT_FAILED', uiState: 'ManualActionRequired' });
                }
                emitSwitch({ ...payloadBase, state: 'LogoutConfirmed', message: 'Sesión anterior cerrada.' });
            }

            const password = decryptAccountPassword(account);
            emitSwitch({ ...payloadBase, state: 'ClosingExistingSession', message: 'Cerrando la sesión anterior…' });
            if (!(await terminateRiotProcesses())) throw Object.assign(new Error('Riot Client no pudo cerrarse.'), { code: 'RIOT_CLOSE_FAILED' });

            emitSwitch({ ...payloadBase, state: 'StartingRiotClient', message: 'Abriendo Riot Client…' });
            const initialArgs = (effectiveGame && GAME_ARGS[effectiveGame]) ? GAME_ARGS[effectiveGame] : ['--open-shortcuts'];
            await launchDetached(riotPath, initialArgs);

            await runBridge({
                bridgePath,
                request: {
                    username: account.username,
                    password,
                    riotClientPath: riotPath,
                    initialDelayMs: settings.initialDelayMs,
                    charDelayMs: settings.charDelayMs,
                    fieldDelayMs: settings.fieldDelayMs
                },
                onState: (event) => emitSwitch({ ...payloadBase, ...event })
            });

            await waitForAuthenticatedSession(account, payloadBase);
            
            if (effectiveGame && GAME_ARGS[effectiveGame]) {
                const gameLabel = effectiveGame === 'league_of_legends' ? 'League of Legends' : 'VALORANT';
                emitSwitch({ ...payloadBase, state: 'LaunchingGame', message: `Iniciando ${gameLabel}…` });
                
                
                // Intentar los métodos oficiales
                const { shell } = require('electron');
                const uri = effectiveGame === 'league_of_legends' ? 'riotclient://launch/league_of_legends/live' : 'riotclient://launch/valorant/live';
                await shell.openExternal(uri).catch(() => {});
                
                const shortcutPath = effectiveGame === 'league_of_legends' 
                    ? 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\League of Legends.lnk'
                    : 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\VALORANT.lnk';
                if (require('fs').existsSync(shortcutPath)) {
                    await shell.openPath(shortcutPath);
                }

                // MAGIC FALLBACK: Send Tabs and Enter to click "Play" manually
                const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$proc = Get-Process -Name "RiotClientUx" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
    [Win32]::SetForegroundWindow($proc.MainWindowHandle)
}
Add-Type -AssemblyName System.Windows.Forms
$preDelay = ${settings.autoPlayPreDelayMs ?? 1500}
  if ($preDelay -gt 0) { Start-Sleep -Milliseconds $preDelay }
$tabs = ${settings.autoPlayTabs ?? 23}
if ($tabs -gt 0) {
    for ($i=0; $i -lt $tabs; $i++) {
        [System.Windows.Forms.SendKeys]::SendWait("{TAB}")
        $delay = ${settings.autoPlayTabDelayMs ?? 50}
        if ($delay -gt 0) { Start-Sleep -Milliseconds $delay }
    }
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
}
`;
                const tempPs1 = require('path').join(require('os').tmpdir(), 'rem_riot_click.ps1');
                require('fs').writeFileSync(tempPs1, psScript, 'utf8');
                require('child_process').exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`);
            }
        }

        const now = Math.floor(Date.now() / 1000);
        const latestAccounts = store.loadAccounts();
        const index = latestAccounts.findIndex((item) => item.id === account.id);
        if (index >= 0) {
            latestAccounts[index].lastUsedAt = now;
            store.saveAccounts(latestAccounts);
        }
        const activity = store.loadActivity();
        const activityGame = effectiveGame || account.game || 'valorant';
        activity.unshift({
            id: crypto.randomUUID(),
            accountId: account.id,
            game: activityGame,
            text: effectiveGame
                ? `Sesión en ${account.displayName} · ${effectiveGame === 'league_of_legends' ? 'LoL' : 'Valorant'}`
                : `Sesión en ${account.displayName} · Riot Client`,
            occurredAt: now,
            success: true
        });
        store.saveActivity(activity);

        emitSwitch({
            ...payloadBase,
            state: 'Done',
            message: effectiveGame ? 'Cuenta lista. Juego iniciado.' : 'Cuenta autenticada en Riot Client.'
        });
        updateTrayMenu();
        if (settings.closeOnLaunch) {
            app.isQuitting = true;
            app.quit();
        }
    } catch (error) {
        log('ERROR', `${error.code || 'SWITCH_ERROR'}: ${error.message}`);
        emitSwitch({ ...payloadBase, state: getSwitchErrorState(error), message: error.message || 'No se pudo cambiar de cuenta.', errorCode: error.code || 'SWITCH_ERROR' });
    } finally {
        operationGate.end(requestId);
        updateTrayMenu();
    }
}

async function detectActiveRiotSession() {
    const live = await queryRiotSession();
    if (!live) return { isValid: false };
    return {
        isValid: true,
        displayName: live.gameName,
        username: '',
        riotId: live.riotId,
        region: live.region.includes('NA') ? 'NA' : live.region.includes('KR') ? 'KR' : live.region.includes('AP') ? 'AP' : 'EU'
    };
}

function createWindow() {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    mainWindow = new BrowserWindow({
        width: 850,
        height: 800,
        minWidth: 600,
        minHeight: 680,
        frame: false,
        backgroundColor: '#05070c',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            devTools: !app.isPackaged
        }
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('close', (event) => {
        const settings = store.loadSettings();
        if (settings.minimizeToTray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
}

let lastTrayStateHash = '';
let lastKnownSessionInfo = null;

function updateTrayMenu(sessionInfo = undefined) {
    if (!tray || tray.isDestroyed()) return;
    if (sessionInfo !== undefined) lastKnownSessionInfo = sessionInfo;
    const currentSession = lastKnownSessionInfo;
    
    const settings = store ? store.loadSettings() : DEFAULT_SETTINGS;
    const accounts = store ? store.loadAccounts() : [];
    const isBusy = Boolean(operationGate.activeRequestId);
    
    const currentStateHash = JSON.stringify({
        activeRiotId: currentSession?.riotId || '',
        isBusy,
        minimizeToTray: settings.minimizeToTray,
        accounts: accounts.map(a => ({ id: a.id, display: a.displayName, riotId: a.riotId, region: a.region, game: a.game }))
    });
    
    if (currentStateHash === lastTrayStateHash) return;
    lastTrayStateHash = currentStateHash;

    const activeRiotId = currentSession?.riotId || '';
    if (activeRiotId) {
        tray.setToolTip(`RemSwitcher · Sesión: ${activeRiotId}`);
    } else {
        tray.setToolTip('RemSwitcher · Gestor de cuentas Riot');
    }

    const valAccounts = accounts.filter((a) => a.game !== 'league_of_legends');
    const lolAccounts = accounts.filter((a) => a.game === 'league_of_legends');

    function createAccountMenuItem(account) {
        const isCurrent = activeRiotId && account.riotId && activeRiotId.toLowerCase() === account.riotId.toLowerCase();
        const prefix = isCurrent ? '● ' : '';
        const regionStr = account.region ? ` [${account.region}]` : '';
        const defaultGameLabel = account.game === 'league_of_legends' ? 'LoL' : 'Valorant';
        return {
            label: `${prefix}${account.displayName}${regionStr}`,
            submenu: [
                {
                    label: `▶ Iniciar (${defaultGameLabel})`,
                    enabled: !isBusy,
                    click: () => {
                        if (operationGate.activeRequestId) return;
                        const requestId = crypto.randomUUID();
                        operationGate.begin(requestId);
                        startAccountSwitch(account.id, requestId, account.game || 'valorant');
                        showMainWindow();
                    }
                },
                { type: 'separator' },
                {
                    label: '🎮 Jugar Valorant',
                    enabled: !isBusy,
                    click: () => {
                        if (operationGate.activeRequestId) return;
                        const requestId = crypto.randomUUID();
                        operationGate.begin(requestId);
                        startAccountSwitch(account.id, requestId, 'valorant');
                        showMainWindow();
                    }
                },
                {
                    label: '⚔️ Jugar League of Legends',
                    enabled: !isBusy,
                    click: () => {
                        if (operationGate.activeRequestId) return;
                        const requestId = crypto.randomUUID();
                        operationGate.begin(requestId);
                        startAccountSwitch(account.id, requestId, 'league_of_legends');
                        showMainWindow();
                    }
                },
                {
                    label: '🔑 Solo abrir Riot Client',
                    enabled: !isBusy,
                    click: () => {
                        if (operationGate.activeRequestId) return;
                        const requestId = crypto.randomUUID();
                        operationGate.begin(requestId);
                        startAccountSwitch(account.id, requestId, 'none');
                        showMainWindow();
                    }
                }
            ]
        };
    }

    const menuTemplate = [
        { label: `RemSwitcher v${app.getVersion()}`, enabled: false },
        {
            label: activeRiotId ? `● Riot: ${activeRiotId}` : '○ Riot: Sin sesión',
            enabled: false
        },
        { type: 'separator' },
        { label: 'Abrir RemSwitcher', click: () => showMainWindow() },
        { type: 'separator' }
    ];

    if (accounts.length > 0) {
        if (accounts.length <= 6) {
            menuTemplate.push(
                ...accounts.map((acc) => {
                    const tag = acc.game === 'league_of_legends' ? '[LoL]' : '[VAL]';
                    const item = createAccountMenuItem(acc);
                    item.label = `${tag} ${item.label}`;
                    return item;
                })
            );
        } else {
            if (valAccounts.length > 0) {
                menuTemplate.push({
                    label: `Valorant (${valAccounts.length})`,
                    submenu: valAccounts.map(createAccountMenuItem)
                });
            }
            if (lolAccounts.length > 0) {
                menuTemplate.push({
                    label: `League of Legends (${lolAccounts.length})`,
                    submenu: lolAccounts.map(createAccountMenuItem)
                });
            }
        }
        menuTemplate.push({ type: 'separator' });
    }

    menuTemplate.push(
        {
            label: 'Cerrar sesión de Riot Client',
            enabled: !isBusy,
            click: async () => {
                try {
                    await logoutRiotSession();
                    updateTrayMenu();
                } catch (error) {
                    log('WARN', `Error al cerrar sesión desde tray: ${error.message}`);
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Minimizar a la bandeja al cerrar',
            type: 'checkbox',
            checked: Boolean(settings.minimizeToTray),
            click: (menuItem) => {
                const currentSettings = store ? store.loadSettings() : DEFAULT_SETTINGS;
                const nextSettings = { ...currentSettings, minimizeToTray: menuItem.checked };
                store.saveSettings(nextSettings);
                updateTrayMenu();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('settings-updated', nextSettings);
                }
            }
        },
        {
            label: 'Salir de RemSwitcher',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    );

    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

function setupTray() {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    const fallback = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAE0lEQVR42mP8z8AARA0gFAAD/gAAVh8B9mH+m0cAAAAASUVORK5CYII=');
    tray = new Tray(fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : fallback);
    tray.setToolTip('RemSwitcher · Gestor de cuentas Riot');
    tray.on('click', () => showMainWindow());
    tray.on('double-click', () => showMainWindow());
    updateTrayMenu();
}

function emitUpdateStatus(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', payload);
    }
}

function setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        log('INFO', 'AutoUpdater: Buscando actualizaciones...');
        emitUpdateStatus({ status: 'checking', message: 'Buscando actualizaciones...' });
    });

    autoUpdater.on('update-available', (info) => {
        log('INFO', `AutoUpdater: Actualización disponible v${info?.version || ''}`);
        emitUpdateStatus({
            status: 'available',
            version: info?.version,
            message: `Descargando actualización v${info?.version || ''}...`
        });
    });

    autoUpdater.on('update-not-available', () => {
        log('INFO', 'AutoUpdater: La aplicación está al día.');
        emitUpdateStatus({ status: 'not-available', message: 'Tienes la versión más reciente.' });
    });

    autoUpdater.on('error', (err) => {
        log('WARN', `AutoUpdater error: ${err?.message || err}`);
        emitUpdateStatus({ status: 'error', message: err?.message || 'Error al buscar actualizaciones.' });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent || 0);
        emitUpdateStatus({
            status: 'downloading',
            percent,
            message: `Descargando actualización: ${percent}%`
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        log('INFO', `AutoUpdater: Descarga completada v${info?.version || ''}`);
        emitUpdateStatus({
            status: 'downloaded',
            version: info?.version,
            message: `Versión v${info?.version || ''} descargada y lista para instalar.`
        });
    });
}

function registerPackagedSmokeIpc() {
    const accounts = [{
        id: 'packaged-smoke-account', displayName: 'Operador EU', game: 'valorant', region: 'EU',
        username: 'smoke-user', riotId: 'Operador#EU', rank: 'Oro', level: '94 RR',
        avatarAgent: 'Jett', notes: '', isFavorite: true, lastUsedAt: 0
    }];
    const settings = {
        startWithWindows: false,
        minimizeToTray: true,
        closeOnLaunch: false,
        confirmSwitch: true,
        autoLaunchGame: true,
        soundEnabled: false,
        reducedMotion: true,
        initialDelayMs: 1800,
        charDelayMs: 15,
        fieldDelayMs: 200,
        customRiotPath: ''
    };
    ipcMain.handle('get-accounts', () => accounts);
    ipcMain.handle('get-activity-log', () => []);
    ipcMain.handle('get-user-profile', () => ({ username: '', createdAt: 0 }));
    ipcMain.handle('get-profiles', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('save-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('delete-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('set-active-profile', () => ({ activeProfileId: 'default', profiles: [{ id: 'default', name: 'Principal', createdAt: 0 }] }));
    ipcMain.handle('get-settings', () => settings);
    ipcMain.handle('get-app-version', () => '1.0.1');
    ipcMain.handle('check-for-updates', () => ({ status: 'dev-mode', message: 'Modo de prueba' }));
    ipcMain.handle('install-update', () => ({ scheduled: true }));
    ipcMain.handle('get-runtime-status', () => ({
        riotClientFound: true,
        riotSignatureValid: true,
        activeSession: { riotId: 'Operador#EU', region: 'EU' },
        runningGame: null,
        encryptionAvailable: true,
        activeRequestId: null
    }));
}

async function runPackagedSmoke() {
    const consoleErrors = [];
    registerPackagedSmokeIpc();
    createWindow();
    mainWindow.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) consoleErrors.push(message);
    });
    await mainWindow.webContents.executeJavaScript('new Promise((resolve) => { if (document.readyState === "complete") resolve(); else window.addEventListener("load", resolve, { once: true }); })');
    const result = await mainWindow.webContents.executeJavaScript(`({
        hasApi: typeof window.api === 'object',
        hasRendererApiCollision: typeof window.rendererApi !== 'object',
        addButton: document.getElementById('btnAdd') !== null,
        settingsButton: document.querySelector('[data-tab="settings"]') !== null,
        accountCard: document.querySelector('.account-card') !== null,
        gameBadge: document.querySelector('.game-badge')?.textContent.includes('VALORANT'),
        currentBadge: document.querySelector('.current-badge')?.textContent === 'ACTIVA',
        themePicker: document.getElementById('themePicker') !== null,
        userPill: document.getElementById('userPill') !== null
    })`);
    await mainWindow.webContents.executeJavaScript('document.querySelector("[data-tab=\\"accounts\\"]").click()');
    const accountsView = await mainWindow.webContents.executeJavaScript("({ view: document.body.dataset.view, title: document.getElementById('pageTitle')?.textContent })");
    await mainWindow.webContents.executeJavaScript('document.getElementById("btnAdd").click()');
    const accountModalOpen = await mainWindow.webContents.executeJavaScript('document.getElementById("accountModal").classList.contains("active")');
    await mainWindow.webContents.executeJavaScript('document.getElementById("btnCloseAccountModal").click(); document.querySelector("[data-tab=\\"settings\\"]").click()');
    const settingsModalOpen = await mainWindow.webContents.executeJavaScript('document.getElementById("settingsModal").classList.contains("active")');
    if (consoleErrors.length) throw new Error(`Errores de consola: ${consoleErrors.join(' | ')}`);
    if (!result.hasApi || !result.hasRendererApiCollision || !result.addButton || !result.settingsButton || !result.accountCard || !result.gameBadge || !result.currentBadge || accountsView.view !== 'accounts' || !accountsView.title || !accountModalOpen || !settingsModalOpen) {
        throw new Error('El smoke empaquetado no pudo accionar la precarga o los botones del renderer.');
    }
    console.log('Packaged smoke: precarga y botones OK');
}

function assertTrustedSender(event) {
    const url = event.senderFrame?.url || '';
    if (!url.startsWith('file://') || !url.endsWith('/renderer/index.html')) {
        throw new Error('Origen IPC no autorizado.');
    }
}

function registerIpc() {
    const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
        assertTrustedSender(event);
        return fn(...args);
    });

    handle('get-accounts', () => store.loadAccounts().map(toPublicAccount));
    handle('save-account', (rawInput) => {
        const input = normalizeAccountInput(rawInput);
        const accounts = store.loadAccounts();
        const index = input.id ? accounts.findIndex((item) => item.id === input.id) : -1;
        if (index < 0 && !input.password) throw new Error('Introduce una contraseña para la nueva cuenta.');
        const existing = index >= 0 ? accounts[index] : null;
        const account = {
            ...(existing || {}),
            ...input,
            id: existing?.id || crypto.randomUUID(),
            encryptedPassword: input.password ? encryptPassword(input.password) : existing.encryptedPassword,
            isFavorite: existing?.isFavorite || false,
            createdAt: existing?.createdAt || Math.floor(Date.now() / 1000),
            lastUsedAt: existing?.lastUsedAt || 0
        };
        delete account.password;
        if (index >= 0) accounts[index] = account;
        else accounts.push(account);
        store.saveAccounts(accounts);
        updateTrayMenu();
        return accounts.map(toPublicAccount);
    });
    handle('delete-account', (rawId) => {
        const id = String(rawId || '');
        const accounts = store.loadAccounts().filter((item) => item.id !== id);
        store.saveAccounts(accounts);
        updateTrayMenu();
        return accounts.map(toPublicAccount);
    });
    handle('toggle-favorite', ({ id, isFavorite } = {}) => {
        const accounts = store.loadAccounts();
        const account = accounts.find((item) => item.id === String(id || ''));
        if (account) account.isFavorite = Boolean(isFavorite);
        store.saveAccounts(accounts);
        updateTrayMenu();
        return accounts.map(toPublicAccount);
    });
    async function syncAccountsWithLiveRank() {
        try {
            const liveStats = await queryLiveRankAndStats();
            if (!liveStats || !liveStats.riotId) return null;
            const currentAccounts = store.loadAccounts();
            const matched = currentAccounts.find((acc) => acc.riotId && acc.riotId.toLowerCase() === liveStats.riotId.toLowerCase());
            if (!matched) return null;
            let changed = false;
            if (liveStats.rank && matched.rank !== liveStats.rank) {
                matched.rank = liveStats.rank;
                changed = true;
            }
            if (liveStats.level && matched.level !== liveStats.level) {
                matched.level = liveStats.level;
                changed = true;
            }
            if (changed) {
                store.saveAccounts(currentAccounts);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('accounts-updated', store.loadPublicAccounts());
                }
                log('INFO', `Live sync: rango actualizado para ${matched.displayName} -> ${matched.rank} (${matched.level ? `Nvl. ${matched.level}` : ''})`);
            }
            return { synced: true, account: toPublicAccount(matched) };
        } catch (err) {
            log('WARN', `Error en sync de rango en vivo: ${err.message}`);
            return null;
        }
    }

    handle('get-settings', () => normalizeSettings(store.loadSettings(), DEFAULT_SETTINGS));
    handle('save-settings', (rawSettings) => {
        const settings = normalizeSettings(rawSettings, DEFAULT_SETTINGS);
        if (settings.customRiotPath) validateRiotExecutable(settings.customRiotPath, true);
        store.saveSettings(settings);
        updateGlobalShortcut(settings.globalShortcut);
        app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, path: process.execPath });
        return settings;
    });
    handle('test-riot-path', async () => {
        try {
            const foundPath = resolveValidatedRiotClient();
            const sessionInfo = await queryRiotSession();
            return { found: true, path: foundPath, signatureValid: true, activeSession: sessionInfo ? { riotId: sessionInfo.riotId, region: sessionInfo.region } : null };
        } catch (error) {
            return { found: false, signatureValid: false, errorCode: error.code || 'RIOT_NOT_FOUND', error: error.message };
        }
    });
    handle('open-riot-client', async () => {
        const riotPath = resolveValidatedRiotClient();
        await launchDetached(riotPath, ['--open-shortcuts']);
        return { opened: true, path: riotPath };
    });
    handle('get-runtime-status', async () => {
        let riotClientFound = false;
        let riotSignatureValid = false;
        try {
            resolveValidatedRiotClient();
            riotClientFound = true;
            riotSignatureValid = true;
        } catch {}
        const activeSession = await queryRiotSession();
        updateTrayMenu(activeSession);
        const settings = normalizeSettings(store.loadSettings(), DEFAULT_SETTINGS);
        if (settings.autoSyncRank && activeSession) {
            syncAccountsWithLiveRank().catch(() => {});
        }
        const runningGamesList = await getRunningProcessesAsync(GAME_PROCESSES);
        const runningProcess = runningGamesList.length > 0 ? runningGamesList[0] : '';
        const runningGame = /leagueclient|league of legends/i.test(runningProcess) ? 'league_of_legends' : runningProcess ? 'valorant' : null;
        return {
            riotClientFound,
            riotSignatureValid,
            activeSession: activeSession ? { riotId: activeSession.riotId, region: activeSession.region } : null,
            runningGame,
            encryptionAvailable: safeStorage.isEncryptionAvailable(),
            activeRequestId: operationGate.activeRequestId
        };
    });
    handle('import-active-session', () => detectActiveRiotSession());
    handle('force-close-games', async () => {
        const closed = await terminateGameProcesses();
        return { closed };
    });
    handle('sync-live-rank', async () => {
        const result = await syncAccountsWithLiveRank();
        return result || { synced: false };
    });
    handle('start-play', ({ accountId, targetGame } = {}) => {
        const id = String(accountId || '');
        if (!id) throw new Error('Cuenta no válida.');
        const requestId = crypto.randomUUID();
        const admission = operationGate.begin(requestId);
        if (!admission.accepted) return admission;
        startAccountSwitch(id, requestId, targetGame);
        updateTrayMenu();
        return admission;
    });
    handle('get-activity-log', () => store.loadActivity());
    handle('get-user-profile', () => store.loadProfile());
    handle('save-user-profile', (rawProfile) => {
        const current = store.loadProfile();
        const username = String(rawProfile?.username || '').trim().slice(0, 40);
        const profile = { username, createdAt: Number(current.createdAt) || Math.floor(Date.now() / 1000) };
        store.saveProfile(profile);
        return profile;
    });

    handle('get-profiles', () => store.loadProfilesData());
    handle('save-profile', (rawProfile) => {
        const input = normalizeProfileInput(rawProfile);
        const result = store.saveProfileItem(input);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('profiles-updated', result);
        }
        return result;
    });
    handle('delete-profile', (rawId) => {
        const id = String(rawId || '');
        const result = store.deleteProfileItem(id);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('profiles-updated', result);
            mainWindow.webContents.send('accounts-updated', store.loadPublicAccounts());
        }
        return result;
    });
    handle('set-active-profile', (rawId) => {
        const id = String(rawId || '');
        const result = store.setActiveProfileId(id);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('profiles-updated', result);
        }
        return result;
    });

    handle('get-app-version', () => app.getVersion());
    handle('check-for-updates', async () => {
        if (!app.isPackaged) {
            return { status: 'dev-mode', message: 'Las actualizaciones automáticas solo funcionan en la versión empaquetada.' };
        }
        try {
            const result = await autoUpdater.checkForUpdates();
            return { status: 'ok', updateInfo: result?.updateInfo || null };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    });
    handle('install-update', () => {
        autoUpdater.quitAndInstall(false, true);
        return { scheduled: true };
    });

    ipcMain.on('window-minimize', (event) => { assertTrustedSender(event); mainWindow?.minimize(); });
    ipcMain.on('window-close', (event) => { assertTrustedSender(event); mainWindow?.close(); });
}

const packagedSmoke = process.argv.includes('--smoke-test');
if (packagedSmoke) app.setPath('userData', path.join(app.getPath('temp'), `remswitcher-packaged-smoke-${process.pid}`));
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        if (packagedSmoke) {
            await runPackagedSmoke();
            app.exit(0);
            return;
        }
        store = new JsonStore({ dataDir: APP_DATA_DIR, legacyDir: LEGACY_DATA_DIR, defaults: DEFAULT_SETTINGS });
        registerIpc();
        session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
        createWindow();
        setupTray();
        setupAutoUpdater();
        if (app.isPackaged) {
            setTimeout(() => {
                autoUpdater.checkForUpdates().catch(() => {});
            }, 6000);
        }
        const settings = normalizeSettings(store.loadSettings(), DEFAULT_SETTINGS);
        updateGlobalShortcut(settings.globalShortcut);
        app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, path: process.execPath });
    });
}

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        const settings = store ? store.loadSettings() : DEFAULT_SETTINGS;
        if (!settings.minimizeToTray || app.isQuitting) {
            app.quit();
        }
    }
});



