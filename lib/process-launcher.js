const { spawn } = require('node:child_process');

function launchDetached(executablePath, args, spawnImpl = spawn) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawnImpl(executablePath, args, { detached: true, stdio: 'ignore', windowsHide: false });
        } catch {
            reject(Object.assign(new Error('No se pudo iniciar el proceso.'), { code: 'LAUNCH_FAILED' }));
            return;
        }

        child.once('error', () => {
            reject(Object.assign(new Error('No se pudo iniciar el proceso.'), { code: 'LAUNCH_FAILED' }));
        });
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
    });
}

module.exports = { launchDetached };
