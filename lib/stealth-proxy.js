'use strict';

const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');

const LOCALHOST_DOMAIN = 'deceive-localhost.molenzwiebel.xyz';

const LOCALHOST_PFX_BASE64 = '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';

let activeProxyInstance = null;
let currentStealthMode = 'offline'; // 'offline' | 'online'
let lastClientPresence = null;
const activeUpstreamSockets = new Set();
const activeClientSockets = new Set(); // Riot Client ↔ proxy connections

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

    // Enviar mensaje de confirmación del bot al Riot Client
    const FAKE_JID = '41c322a1-b328-495b-a004-5ccd3e45eae8@eu1.pvp.net';
    const body = normalized === 'online'
        ? '✅ RemSwitcher · Modo Desconectado DESACTIVADO. Tus amigos pueden verte.'
        : '🔒 RemSwitcher · Modo Desconectado ACTIVO. Tus amigos te ven como desconectado.';
    const msgXml =
        `<message from='${FAKE_JID}' type='chat' id='remswitch-${Date.now()}'>` +
        `<body>${body}</body>` +
        `</message>`;
    for (const clientSock of activeClientSockets) {
        try {
            if (clientSock && !clientSock.destroyed && clientSock.writable) {
                clientSock.write(Buffer.from(msgXml, 'utf8'));
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
        activeClientSockets.add(clientSocket); // para notificaciones de modo desde el tray

        let upstreamConnected = false;
        const pendingClientChunks = [];
        let insertedFakePlayer = false;
        let sentFakePlayerPresence = false;

        // ─── Jugador fantasma (igual que Deceive) ──────────────────────────────
        const FAKE_JID  = '41c322a1-b328-495b-a004-5ccd3e45eae8@eu1.pvp.net';
        const FAKE_NAME = 'RemSwitcher';
        const ROSTER_MARKER = "<query xmlns='jabber:iq:riotgames:roster'>";

        // Inyectar contacto en el roster
        function injectFakePlayerIntoRoster(content) {
            const idx = content.indexOf(ROSTER_MARKER);
            if (idx === -1) return content;
            insertedFakePlayer = true;
            const insertPos = idx + ROSTER_MARKER.length;
            const fakeItem =
                `<item jid='${FAKE_JID}' name='${FAKE_NAME}' subscription='both'>` +
                `<id name='${FAKE_NAME}' tagline='Modo Desconectado'/></item>`;
            return content.slice(0, insertPos) + fakeItem + content.slice(insertPos);
        }

        // Enviar presencia + mensaje de confirmación al Riot Client
        function sendFakePlayerPresenceAndMessage() {
            if (sentFakePlayerPresence) return;
            sentFakePlayerPresence = true;
            try {
                // Presencia del bot (aparece como "online")
                const presence =
                    `<presence from='${FAKE_JID}'>` +
                    `<show>chat</show>` +
                    `<status></status>` +
                    `</presence>`;
                clientSocket.write(Buffer.from(presence, 'utf8'));

                // Mensaje privado de confirmación
                const msgId = `remswitch-${Date.now()}`;
                const body = currentStealthMode === 'online'
                    ? '✅ RemSwitcher · Modo Desconectado DESACTIVADO. Tus amigos pueden verte.'
                    : '🔒 RemSwitcher · Modo Desconectado ACTIVO. Tus amigos te ven como desconectado.';
                const message =
                    `<message from='${FAKE_JID}' type='chat' id='${msgId}'>` +
                    `<body>${body}</body>` +
                    `</message>`;
                clientSocket.write(Buffer.from(message, 'utf8'));
            } catch {}
        }
        // ──────────────────────────────────────────────────────────────────────

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
                upstreamSocket.write(Buffer.from(filteredStr, 'utf8'));
            }
            pendingClientChunks.length = 0;
        });

        // Tráfico cliente → servidor
        clientSocket.on('data', (chunk) => {
            const str = chunk.toString('utf8');

            // Bloquear mensajes dirigidos al bot (no enviar a Riot)
            if (str.includes(FAKE_JID)) return;

            if (!upstreamConnected) {
                pendingClientChunks.push(chunk);
                return;
            }
            const filteredStr = filterXmppClientTraffic(str, currentStealthMode);
            upstreamSocket.write(Buffer.from(filteredStr, 'utf8'));
        });

        // Tráfico servidor → cliente
        upstreamSocket.on('data', (chunk) => {
            let content = chunk.toString('utf8');

            // Inyectar el bot en el roster la primera vez
            if (!insertedFakePlayer && content.includes(ROSTER_MARKER)) {
                content = injectFakePlayerIntoRoster(content);
            }

            clientSocket.write(Buffer.from(content, 'utf8'));

            // Tras enviar el roster, mandar presencia + mensaje de confirmación
            if (insertedFakePlayer && !sentFakePlayerPresence) {
                setTimeout(sendFakePlayerPresenceAndMessage, 300);
            }
        });

        const cleanup = () => {
            activeSockets.delete(clientSocket);
            activeSockets.delete(upstreamSocket);
            activeUpstreamSockets.delete(upstreamSocket);
            activeClientSockets.delete(clientSocket);
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
        activeClientSockets.clear();
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
