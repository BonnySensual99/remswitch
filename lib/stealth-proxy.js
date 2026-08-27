'use strict';

const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');

const LOCALHOST_DOMAIN = 'deceive-localhost.molenzwiebel.xyz';

const LOCALHOST_PFX_BASE64 = 'MIIGdQIBAzCCBjEGCSqGSIb3DQEHAaCCBiIEggYeMIIGGjCCAcsGCSqGSIb3DQEHAaCCAbwEggG4MIIBtDCCAbAGCyqGSIb3DQEMCgECoIHMMIHJMBwGCiqGSIb3DQEMAQMwDgQIq1VQwvLVBO0CAgfQBIGoQt+AW3HRTc38xcq5IJ9CypGPCmaKw9Cks1RSpAms+sgqBc1rGGOd8W2QCr/lDzgTVjcDltqs84eVW8zRtkCKLVFRxz1fjNtnJoMd3kj1rZGfIc9JfEr8PsAYEcE6k8j999rB2dsLVirB4TZN9QBXcIzQR6KD2rLv7jmOjEfjHRmkHijSuypDC/FPFDqHdgMS68aL3O9VN8Ik7qjOdGROIQ4l6Oqxdj+4MYHRMBMGCSqGSIb3DQEJFTEGBAQBAAAAMFsGCSqGSIb3DQEJFDFOHkwAewAxADcAMQBBADUARABEADIALQAxADIARgBFAC0ANABGADMANAAtADkANABDADkALQA3AEEANAA3ADcARQA2ADYANQBGAEMAMAB9MF0GCSsGAQQBgjcRATFQHk4ATQBpAGMAcgBvAHMAbwBmAHQAIABTAG8AZgB0AHcAYQByAGUAIABLAGUAeQAgAFMAdABvAHIAYQBnAGUAIABQAHIAbwB2AGkAZABlAHIwggRHBgkqhkiG9w0BBwagggQ4MIIENAIBADCCBC0GCSqGSIb3DQEHATAcBgoqhkiG9w0BDAEDMA4ECFsf0g+5znzYAgIH0ICCBACVYF8xj/hfflOLvDd35TZ38uNlxGdv7RlijWVDYjny1r9Q2BYmSO2+Dbj8Kv/X75supGQSh4RZdE68mQzYYkHc1DAhIcWWv0XyhyYT/psJGxJR8j8mYBhbdY2ikiw4X2DLFJco0ss7b4dnvbBT3pGiUbFkvURPDOJKhW6dmyIHJSmz1+W9mocUUvw8521uFB2eePJM0tl5rwpYNpVzI/vnOLg4/B1H4gGnf0Ywjb2kMtJRQNMJ/Hvj5rWLlq157yf4PZ9cFkLisXKBRh/JL4r97WY97gLXezPju+2YvXBmtxWm7IGJXfZtp2iNVCVs0lQeD4OkC9zd0UeoemQ0x0j6Jj/vH3AExxaqjhJty9KpChFV7LK0D4421Kdc2F2R6U1AZxnJCd3ywV0QaUV+UIrfaRkbfUFIgTI5PPR8jO7a9yVpIzuNvUFdEWYZo3qg8vL8T9FADYWWE8NwT6CXWWm5Sk2ZXzKBTMH6g/OA9sDXtk744dKOTUhJOgJRv0YO2kU7fqxGGzg1KECjRL58mTgItkwGsB9lCLvNmkO7ClywSYk2zT4FlzdndwmnXOKO1pAxrF9hhCoD/Gza3997SO3Hqw4gJ3KV0WMz2nVL6a7EF8GMpjrl2qbDNTJgzEgyvlX0pMY3LZ98746PLRqaliEQRQA55Y2kJYDZuYGUsQACSZ/e+4i3T+z1RMkRmiHcyTTW0aHM3JLDDF5IuTPA9BL0s0xtBE3Edv7ZFBnauTOGulu5nK7FgUHyzWaSyYLqIzq4Q5JL42FwlA32wFMNNcGBUsupPpURGFeYlk/iy5OlthzCJcIm/YXFy5xsYuHrBTx+C0iKAsaE0GGT7pXge69kOIaop3Y6qvEprS3u19r24/yDecxmcLhiEOKIuN98qwXky1XEoR2m2xj0r7oNVViEBOyWU/6beYvozqCgBZ092zpi6JIXlyhkhPeTcq6BHClMyC3T7o5N6E/OMKx1yG9ny2Kb41xEPcDfdplMahAtuCvg1FYlHzXYaRYrugIxhZH+UCN9tC5RvxHoAMg3l7647jDXfA2q/uynjviLuYnxrq/jS+KD60f7JNEAkfZ2+GPvJEljro0aZBZPqi/AKERijjvoBZMhTVMZQlyGhYmcPD8KJCgRfgsVOe29L7aH8ykmFU+Lt8ZJ5nmr6ePnB/9Opf9Y5Nd/dMHeoI9wsYVOfMYT4Rwaqt3Z464fU/iiiN0wdwOm6g56xqoiwSPc/eNr7MIfBkM07kJYeNHcQsXO1jPCHh0lx99bGE1PwRHPVKABWNOYsj48Egfwps8UK2ndFyPkHFXaEdpr1/p2Y0kdLFmNspoUJlMAKRBh1u16TOKjjh/lphGzGczrrkgyv3BtMDswHzAHBgUrDgMCGgQUH6wSjNIfzOFbFBprJUJcdrd2iqkEFD3uXXKME5WnkI4QOAT+t18K+7i9AgIH0A==';

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
        modified = modified.replace(/<status>[\s\S]*?<\/status>/g, '<status/>');
        modified = modified.replace(/<games>[\s\S]*?<\/games>/g, '<games/>');
        modified = modified.replace(/<valorant>[\s\S]*?<\/valorant>/g, '');
        modified = modified.replace(/<league_of_legends>[\s\S]*?<\/league_of_legends>/g, '');
        modified = modified.replace(/<keystone>[\s\S]*?<\/keystone>/g, '');
        modified = modified.replace(/<bacon>[\s\S]*?<\/bacon>/g, '');
        modified = modified.replace(/<lion>[\s\S]*?<\/lion>/g, '');
        modified = modified.replace(/<riot_client>[\s\S]*?<\/riot_client>/g, '');
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

    // 1. Servidor TLS local para XMPP Chat con certificado oficial de deceive-localhost
    const chatServer = tls.createServer({
        pfx: Buffer.from(LOCALHOST_PFX_BASE64, 'base64'),
        passphrase: 'remswitch',
        rejectUnauthorized: false
    });

    const activeSockets = new Set();

    chatServer.on('secureConnection', (clientSocket) => {
        activeSockets.add(clientSocket);
        
        let upstreamConnected = false;
        const pendingClientChunks = [];

        const upstreamSocket = tls.connect({
            host: detectedUpstreamHost,
            port: detectedUpstreamPort,
            servername: detectedUpstreamHost,
            rejectUnauthorized: false
        });

        activeSockets.add(upstreamSocket);
        activeUpstreamSockets.add(upstreamSocket);

        upstreamSocket.once('secureConnect', () => {
            upstreamConnected = true;
            for (const chunk of pendingClientChunks) {
                const str = chunk.toString('utf8');
                const filteredStr = filterXmppClientTraffic(str, currentStealthMode);
                const outBuf = Buffer.from(filteredStr, 'utf8');
                upstreamSocket.write(outBuf);
            }
            pendingClientChunks.length = 0;
        });

        clientSocket.on('data', (chunk) => {
            if (!upstreamConnected) {
                pendingClientChunks.push(chunk);
                return;
            }
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
    LOCALHOST_PFX_BASE64
};
