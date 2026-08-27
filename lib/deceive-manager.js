const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { launchDetached } = require('./process-launcher');

const DECEIVE_DOWNLOAD_URL = 'https://github.com/molenzwiebel/Deceive/releases/latest/download/Deceive.exe';
const DECEIVE_EXE_NAME = 'Deceive.exe';

function getDefaultDeceiveDir() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'RemSwitcher', 'tools');
}

function getDefaultDeceivePath() {
    return path.join(getDefaultDeceiveDir(), DECEIVE_EXE_NAME);
}

function resolveDeceivePath(customPath = '') {
    if (customPath && typeof customPath === 'string' && fs.existsSync(customPath)) {
        return customPath;
    }

    const defaultPath = getDefaultDeceivePath();
    if (fs.existsSync(defaultPath)) {
        return defaultPath;
    }

    const bundledPath = path.join(__dirname, '..', 'resources', 'tools', DECEIVE_EXE_NAME);
    if (fs.existsSync(bundledPath)) {
        return bundledPath;
    }

    const nativePath = path.join(__dirname, '..', 'native', DECEIVE_EXE_NAME);
    if (fs.existsSync(nativePath)) {
        return nativePath;
    }

    return defaultPath;
}

function isDeceiveInstalled(customPath = '') {
    const resolved = resolveDeceivePath(customPath);
    try {
        if (!fs.existsSync(resolved)) return false;
        const stat = fs.statSync(resolved);
        return stat.isFile() && stat.size > 1024;
    } catch {
        return false;
    }
}

function getDeceiveGameArgs(targetGame = 'valorant') {
    const normalized = String(targetGame || '').toLowerCase();
    if (normalized === 'league_of_legends' || normalized === 'lol') {
        return ['lol'];
    }
    if (normalized === 'valorant') {
        return ['valorant'];
    }
    if (normalized === 'lor') {
        return ['lor'];
    }
    return ['valorant'];
}

function downloadDeceive(targetPath = '', onProgress = null) {
    const destination = targetPath || getDefaultDeceivePath();
    const dir = path.dirname(destination);

    return new Promise((resolve, reject) => {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            return reject(new Error(`No se pudo crear el directorio de herramientas: ${err.message}`));
        }

        const tempFile = `${destination}.download.tmp`;
        const fetchUrl = (url, redirectCount = 0) => {
            if (redirectCount > 5) {
                return reject(new Error('Demasiadas redirecciones al descargar Deceive.'));
            }

            const req = https.get(url, { headers: { 'User-Agent': 'RemSwitcher' } }, (res) => {
                if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const redirectUrl = res.headers.location;
                    if (!redirectUrl) {
                        return reject(new Error('Redirección sin cabecera de ubicación al descargar Deceive.'));
                    }
                    return fetchUrl(redirectUrl, redirectCount + 1);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`Fallo en la descarga de Deceive (HTTP ${res.statusCode}).`));
                }

                const totalBytes = Number.parseInt(res.headers['content-length'] || '0', 10);
                let receivedBytes = 0;

                const fileStream = fs.createWriteStream(tempFile);
                res.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    if (onProgress && typeof onProgress === 'function' && totalBytes > 0) {
                        onProgress({ receivedBytes, totalBytes, percent: Math.round((receivedBytes / totalBytes) * 100) });
                    }
                });

                res.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        try {
                            if (fs.existsSync(destination)) {
                                fs.unlinkSync(destination);
                            }
                            fs.renameSync(tempFile, destination);
                            resolve({ success: true, path: destination });
                        } catch (err) {
                            reject(new Error(`Error guardando Deceive: ${err.message}`));
                        }
                    });
                });

                fileStream.on('error', (err) => {
                    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                    reject(err);
                });
            });

            req.on('error', (err) => {
                try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                reject(new Error(`Error de red al descargar Deceive: ${err.message}`));
            });

            req.setTimeout(30000, () => {
                req.destroy();
                try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                reject(new Error('Tiempo de espera agotado al descargar Deceive.'));
            });
        };

        fetchUrl(DECEIVE_DOWNLOAD_URL);
    });
}

async function launchDeceiveGame(targetGame = 'valorant', customPath = '') {
    const deceivePath = resolveDeceivePath(customPath);
    if (!isDeceiveInstalled(customPath)) {
        throw Object.assign(new Error('Deceive no está instalado o no se encuentra el archivo ejecutable.'), { code: 'DECEIVE_NOT_FOUND' });
    }

    const args = getDeceiveGameArgs(targetGame);
    await launchDetached(deceivePath, args);
    return { success: true, path: deceivePath, args };
}

function terminateDeceive() {
    return new Promise((resolve) => {
        execFile('taskkill', ['/F', '/IM', DECEIVE_EXE_NAME, '/T'], () => {
            resolve();
        });
    });
}

module.exports = {
    DECEIVE_DOWNLOAD_URL,
    DECEIVE_EXE_NAME,
    getDefaultDeceiveDir,
    getDefaultDeceivePath,
    resolveDeceivePath,
    isDeceiveInstalled,
    getDeceiveGameArgs,
    downloadDeceive,
    launchDeceiveGame,
    terminateDeceive
};
