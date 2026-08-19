const { spawn } = require('node:child_process');

function bridgeError(message, code) {
    return Object.assign(new Error(message), { code });
}

function runBridge({ bridgePath, request, onState = () => {}, timeoutMs = 45000, spawnImpl = spawn }) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawnImpl(bridgePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        } catch {
            reject(bridgeError('No se pudo iniciar el puente nativo.', 'BRIDGE_START_FAILED'));
            return;
        }

        let stdoutBuffer = '';
        let lastErrorEvent = null;
        let settled = false;
        let timedOut = false;
        let killGraceTimer = null;

        const finish = (handler) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (killGraceTimer) clearTimeout(killGraceTimer);
            handler();
        };

        const timer = setTimeout(() => {
            timedOut = true;
            try { child.kill(); } catch {}
            killGraceTimer = setTimeout(() => finish(() => reject(bridgeError('El puente nativo agotó el tiempo de espera.', 'BRIDGE_TIMEOUT'))), 1000);
        }, timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk;
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    if (event.state && event.message) {
                        if (event.state === 'Error') lastErrorEvent = event;
                        onState(event);
                    }
                } catch {}
            }
        });

        // No se registra stderr: una dependencia nativa nunca debe poder filtrar secretos al log.
        child.stderr.resume();
        child.on('error', () => finish(() => reject(bridgeError('No se pudo iniciar el puente nativo.', 'BRIDGE_START_FAILED'))));
        child.on('close', (exitCode) => finish(() => {
            if (timedOut) {
                reject(bridgeError('El puente nativo agotó el tiempo de espera.', 'BRIDGE_TIMEOUT'));
            } else if (exitCode === 0) {
                resolve();
            } else if (lastErrorEvent) {
                reject(bridgeError(lastErrorEvent.message, lastErrorEvent.errorCode || 'BRIDGE_FAILED'));
            } else {
                reject(bridgeError('El puente nativo no pudo introducir las credenciales.', 'BRIDGE_FAILED'));
            }
        }));

        child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
    });
}

module.exports = { runBridge };
