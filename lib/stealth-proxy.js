'use strict';

const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');

const LOCALHOST_DOMAIN = 'deceive-localhost.molenzwiebel.xyz';

const LOCALHOST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC+/Af3xTeCyJgO
/sblODKqr1AG8ZwPy+snvoFWOEO3XqcsChX/9/cLQ+6TUaU8NHaEGQ5GPq3P6i2J
9aQDEFgooADorS0XqH2X61Lipm2wooHUvxAHSJ/J9e4PDsytBbAdi84equT6hk/O
k6gVfaWSHa1OD0p1fIvfpQCqoKMEKPLaTYtLk3qYs/GA20lN/y2IIU77TLpH8lQi
Eeqa0uVbGLmEygaNltEkFz7wcs7NR7UDj0rxtJVxrWKRfaJhu/yiMhrrUn5dGhzC
9KLA4TioRp6/MUjNXDmGtdxFf0O4LCXIe6dvFRCRW5ef2B6+iaHcBMvGn8KsvkRX
P14w3eDLAgMBAAECggEAF3G+1KaMCuzu5aBW8Bp29cbxjvinzLSemFFldR0RCvh+
kwRl8PcSh3p+Ve1G2F4kUlD1FKBrG8PGdVIHIS0ndU0271ka2PWg/T4w/YuqmW1J
fME7iXlbzCH5aDXL4E17chUQZ2lZFHvaXiR4FLNI2Of1t0hfPo7caMbLjyaK/F6H
4LInXVFNd8rZ8kepKITPcFRsA6IJAtXKHhytqbLfKyjwXvfhTB/sn0P1NNHM3D0t
bMx9DfMeoG8F6mFISds2aX3NO8gF+GrCB6y6+Gum80+4P7c+az9n8A0MMiW3GsuT
ICftozcLCyn2Xcl3lVVjwn23n3IeAnjI6hagU4VfcQKBgQD2Ak0OiVwTKr8Ta0b9
Y5D1d6D5z8AQ2VbmDdcPFV39jTO+VDU9V76Gcuh9qO1qm0+zJWuKKBVM0+yJD+MI
DBKP1NeX8yRbkyPznwZHnChFDNYhk/Bq/T7URPRKaMu7fHD4cTu5fZwXh3Plg0/8
NqeQeOT/5Xb9nS5LefcCje5+AwKBgQDGvacyF3GUY7tX7Dl3J5+TIbiMqglQ6P9B
BgtS9yLX5IwvB3XhG5XjrnWa+VYt4B+7CPERHybKffGGUDYfZ9j1AWfqwEM1lMP2
+gfK1JPN/vRGEqwA5VhSd8nmJlaC5yk/nVmFJvEnC5dk/D0e+SKIyI3s32rY9kVv
Xq51V9jbmQKBgQDRAxl3DUs2Wa4oEJAq/uoNNAuH03OqnQ2QvheHEC9gGhTpU2A8
cw1D6+MNyHWWishHO7bHldCrCq8/sEjC8IbgvwRBbGnqh/QWq3jJZKpuKD7SHoA4
VluIO+GWSr012L+exY3pxgfVkdbtHAjcD4+EVsKxi8LyLRZFOCWefPoxAwKBgHSI
aC07CeJUyFk5rkhr92mycCAq4+OJe4KJJMK1Hr0wyfIZkck4/57NgTAp25pyvKhT
CedcOMarKp/zEIlBvzmKZYCE0+PrIy0CVudb1n8Ha/xanni4Ah35F23YNQn0uX8P
qJomx2h5p4ATV1N+Cf3iezXVmzU00moHPoyXwhShAoGAQcqZg6emjT4EYCxNo99T
gfgp8YfuOk4E4ZuDxxzwRVdcNpQGe6PmwkfZ3mzC0XdsxZN7RUqMo4JuLmNCP1NJ
DhJB+O18hIqVkOzith5N+a/tFtp+0nJHrRBVcK/BQi3o7LbX11oQ35rf7qnw/cyh
G1AgT3gypoAb3iisPzE9AkE=
-----END PRIVATE KEY-----`;

const LOCALHOST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUe3JRlBG9/Xw/jmpeOEnEw8kxaUIwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgyNzEyNDg0M1oXDTM2MDgy
NDEyNDg0M1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAvvwH98U3gsiYDv7G5Tgyqq9QBvGcD8vrJ76BVjhDt16n
LAoV//f3C0Puk1GlPDR2hBkORj6tz+otifWkAxBYKKAA6K0tF6h9l+tS4qZtsKKB
1L8QB0ifyfXuDw7MrQWwHYvOHqrk+oZPzpOoFX2lkh2tTg9KdXyL36UAqqCjBCjy
2k2LS5N6mLPxgNtJTf8tiCFO+0y6R/JUIhHqmtLlWxi5hMoGjZbRJBc+8HLOzUe1
A49K8bSVca1ikX2iYbv8ojIa61J+XRocwvSiwOE4qEaevzFIzVw5hrXcRX9DuCwl
yHunbxUQkVuXn9gevomh3ATLxp/CrL5EVz9eMN3gywIDAQABo1MwUTAdBgNVHQ4E
FgQUYAy08AGn97fjaT5STPk444OEsqEwHwYDVR0jBBgwFoAUYAy08AGn97fjaT5S
TPk444OEsqEwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAAevs
FhrVw83LwHkL7C1Jiy/X1WkNRDGeWXSiYj4xEh6Y2dM+gSm0TEIkfDng9XE4tA33
do+3IWvUBfsTEOT1nzz+v5hZ3ivjBGJAdmQb0oGrsbwO0MwJnkE2nWaMCXaMpy66
RKwv6kF8T/wuPhT2ToXegvAfFYXT50wwdVwSb0FY1JQShVkTAwp2TvcTMiINsMJ5
GTqwGbuhirssIlBBnIGLOEkeANI2Fq3JXXM/DtA8u3NBu/LpwKcj0Jq6H0Sf5GlZ
A3AwMAI0iu0wWx3MfgZpzcARBFGX+P3sPOiLDsmYEK5CiwYfobLxmCuZRFtWs0ju
6xZizxrkNtETOOu4kQ==
-----END CERTIFICATE-----`;

let activeProxyInstance = null;
let currentStealthMode = 'offline'; // 'offline' | 'online'
let lastClientPresence = null;
const activeUpstreamSockets = new Set();

function decompressBuffer(buf, encoding) {
    if (!buf || buf.length === 0 || !encoding) return buf;
    try {
        const enc = String(encoding).toLowerCase().trim();
        if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(buf);
        if (enc === 'deflate') return zlib.inflateSync(buf);
        if (enc === 'br') return zlib.brotliDecompressSync(buf);
    } catch {
        return buf;
    }
    return buf;
}

function filterXmppClientTraffic(content, mode = currentStealthMode) {
    if (!content || typeof content !== 'string') return content;
    
    if (content.includes('<presence')) {
        lastClientPresence = content;
        
        // Si el modo es 'online', dejamos pasar la presencia real del cliente sin modificar
        if (mode === 'online') {
            return content;
        }

        // Si el modo es 'offline', enmascaramos
        let modified = content;
        modified = modified.replace(/<show>(chat|dnd|away)<\/show>/g, '<show>offline</show>');
        modified = modified.replace(/<games>[\s\S]*?<\/games>/g, '<games/>');
        modified = modified.replace(/<valorant>[\s\S]*?<\/valorant>/g, '');
        modified = modified.replace(/<league_of_legends>[\s\S]*?<\/league_of_legends>/g, '');
        return modified;
    }
    return content;
}

function setStealthMode(mode) {
    const normalized = (mode === 'online') ? 'online' : 'offline';
    currentStealthMode = normalized;

    // Notificar en tiempo real por los sockets activos XMPP hacia Riot
    for (const upstream of activeUpstreamSockets) {
        try {
            if (upstream && !upstream.destroyed && upstream.writable) {
                if (normalized === 'online') {
                    // Pasar a conectado
                    if (lastClientPresence) {
                        upstream.write(Buffer.from(lastClientPresence, 'utf8'));
                    } else {
                        upstream.write(Buffer.from("<presence><show>chat</show></presence>", 'utf8'));
                    }
                } else {
                    // Pasar a desconectado / invisible
                    upstream.write(Buffer.from("<presence type='unavailable'/><presence><show>offline</show></presence>", 'utf8'));
                }
            }
        } catch {}
    }

    return currentStealthMode;
}

function getStealthMode() {
    return currentStealthMode;
}

function isStealthActive() {
    return activeProxyInstance !== null;
}

function rewriteClientConfig(jsonText, localChatPort, authHeader = null) {
    try {
        const data = JSON.parse(jsonText);
        let upstreamHost = 'eu1.chat.si.riotgames.com';
        let upstreamPort = 5223;

        if (data['chat.host']) {
            upstreamHost = data['chat.host'];
            data['chat.host'] = LOCALHOST_DOMAIN;
        }
        if (data['chat.port']) {
            upstreamPort = Number(data['chat.port']) || 5223;
            data['chat.port'] = localChatPort;
        }

        let affinity = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.slice(7);
                const parts = token.split('.');
                if (parts.length >= 2) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                    affinity = payload.affinity || payload.sub || null;
                }
            } catch {}
        }

        if (data['chat.affinities'] && typeof data['chat.affinities'] === 'object') {
            for (const key of Object.keys(data['chat.affinities'])) {
                const affHost = data['chat.affinities'][key];
                if (typeof affHost === 'string' && affHost) {
                    if (affinity && key.toLowerCase() === String(affinity).toLowerCase()) {
                        upstreamHost = affHost;
                    } else if (!upstreamHost || upstreamHost === '127.0.0.1' || upstreamHost === LOCALHOST_DOMAIN) {
                        upstreamHost = affHost;
                    }
                    data['chat.affinities'][key] = LOCALHOST_DOMAIN;
                }
            }
        }

        if (data['chat.port.affinities'] && typeof data['chat.port.affinities'] === 'object') {
            for (const key of Object.keys(data['chat.port.affinities'])) {
                data['chat.port.affinities'][key] = localChatPort;
            }
        }

        data['chat.allow_bad_cert.enabled'] = true;
        data['chat.use_tls.enabled'] = true;

        return {
            modifiedJson: JSON.stringify(data),
            upstreamHost,
            upstreamPort
        };
    } catch {
        return { modifiedJson: jsonText, upstreamHost: 'eu1.chat.si.riotgames.com', upstreamPort: 5223 };
    }
}

async function startStealthProxy(options = {}) {
    if (activeProxyInstance) {
        return activeProxyInstance;
    }

    currentStealthMode = options.initialMode === 'online' ? 'online' : 'offline';
    let detectedUpstreamHost = options.defaultChatHost || 'eu1.chat.si.riotgames.com';
    let detectedUpstreamPort = options.defaultChatPort || 5223;

    // 1. Servidor TLS local para XMPP Chat
    const chatServer = tls.createServer({
        key: LOCALHOST_KEY,
        cert: LOCALHOST_CERT,
        rejectUnauthorized: false
    });

    const activeSockets = new Set();

    chatServer.on('secureConnection', (clientSocket) => {
        activeSockets.add(clientSocket);
        
        const upstreamSocket = tls.connect({
            host: detectedUpstreamHost,
            port: detectedUpstreamPort,
            rejectUnauthorized: false
        });

        activeSockets.add(upstreamSocket);
        activeUpstreamSockets.add(upstreamSocket);

        clientSocket.on('data', (chunk) => {
            const str = chunk.toString('utf8');
            const filteredStr = filterXmppClientTraffic(str, currentStealthMode);
            const outBuf = Buffer.from(filteredStr, 'utf8');
            upstreamSocket.write(outBuf);
        });

        upstreamSocket.on('data', (chunk) => {
            clientSocket.write(chunk);
        });

        const cleanup = () => {
            activeSockets.delete(clientSocket);
            activeSockets.delete(upstreamSocket);
            activeUpstreamSockets.delete(upstreamSocket);
            try { clientSocket.destroy(); } catch {}
            try { upstreamSocket.destroy(); } catch {}
        };

        clientSocket.on('error', cleanup);
        clientSocket.on('close', cleanup);
        upstreamSocket.on('error', cleanup);
        upstreamSocket.on('close', cleanup);
    });

    const chatPort = await new Promise((resolve, reject) => {
        chatServer.listen(0, '127.0.0.1', () => {
            resolve(chatServer.address().port);
        });
        chatServer.on('error', reject);
    });

    // 2. Servidor HTTP local para ClientConfig
    const configServer = http.createServer((req, res) => {
        const targetHost = req.url.includes('/pas/v1/service/chat')
            ? 'riot-geo.pas.si.riotgames.com'
            : 'clientconfig.rpg.riotgames.com';

        const forwardHeaders = {
            'host': targetHost,
            'user-agent': req.headers['user-agent'] || 'RiotClient/99.0.0.0',
            'accept': req.headers['accept'] || '*/*'
        };

        if (req.headers['authorization']) {
            forwardHeaders['authorization'] = req.headers['authorization'];
        }
        if (req.headers['x-riot-entitlements-jwt']) {
            forwardHeaders['x-riot-entitlements-jwt'] = req.headers['x-riot-entitlements-jwt'];
        }
        if (req.headers['content-type']) {
            forwardHeaders['content-type'] = req.headers['content-type'];
        }

        const proxyReq = https.request({
            host: targetHost,
            port: 443,
            path: req.url,
            method: req.method,
            headers: forwardHeaders,
            rejectUnauthorized: false
        }, (proxyRes) => {
            const chunks = [];
            proxyRes.on('data', (c) => chunks.push(c));
            proxyRes.on('end', () => {
                let rawBody = Buffer.concat(chunks);
                const encoding = proxyRes.headers['content-encoding'];
                rawBody = decompressBuffer(rawBody, encoding);

                const isSuccess = proxyRes.statusCode >= 200 && proxyRes.statusCode < 300;
                const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();

                if (isSuccess && (contentType.includes('json') || rawBody.toString('utf8').trim().startsWith('{'))) {
                    const text = rawBody.toString('utf8');
                    const authHeader = req.headers['authorization'] || null;
                    const { modifiedJson, upstreamHost, upstreamPort } = rewriteClientConfig(text, chatPort, authHeader);

                    if (upstreamHost && upstreamHost !== '127.0.0.1' && upstreamHost !== LOCALHOST_DOMAIN) {
                        detectedUpstreamHost = upstreamHost;
                    }
                    if (upstreamPort && upstreamPort !== chatPort) {
                        detectedUpstreamPort = upstreamPort;
                    }

                    const outBuf = Buffer.from(modifiedJson, 'utf8');
                    res.writeHead(proxyRes.statusCode, {
                        'content-type': 'application/json',
                        'content-length': outBuf.length,
                        'connection': 'close'
                    });
                    res.end(outBuf);
                } else {
                    const responseHeaders = { ...proxyRes.headers };
                    delete responseHeaders['content-encoding'];
                    responseHeaders['content-length'] = rawBody.length;
                    responseHeaders['connection'] = 'close';

                    res.writeHead(proxyRes.statusCode, responseHeaders);
                    res.end(rawBody);
                }
            });
        });

        proxyReq.on('error', () => {
            res.writeHead(502, { 'content-type': 'text/plain', 'connection': 'close' });
            res.end('Bad Gateway');
        });

        req.pipe(proxyReq);
    });

    const configPort = await new Promise((resolve, reject) => {
        configServer.listen(0, '127.0.0.1', () => {
            resolve(configServer.address().port);
        });
        configServer.on('error', reject);
    });

    const close = () => {
        for (const sock of activeSockets) {
            try { sock.destroy(); } catch {}
        }
        activeSockets.clear();
        activeUpstreamSockets.clear();
        try { chatServer.close(); } catch {}
        try { configServer.close(); } catch {}
        activeProxyInstance = null;
    };

    activeProxyInstance = {
        configPort,
        chatPort,
        close,
        getUpstreamHost: () => detectedUpstreamHost,
        getUpstreamPort: () => detectedUpstreamPort,
        setMode: (mode) => setStealthMode(mode),
        getMode: () => getStealthMode()
    };

    return activeProxyInstance;
}

function stopStealthProxy() {
    if (activeProxyInstance) {
        activeProxyInstance.close();
        activeProxyInstance = null;
    }
}

module.exports = {
    startStealthProxy,
    stopStealthProxy,
    setStealthMode,
    getStealthMode,
    isStealthActive,
    filterXmppClientTraffic,
    rewriteClientConfig,
    LOCALHOST_DOMAIN,
    LOCALHOST_KEY,
    LOCALHOST_CERT
};
