const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

function readRiotLockfile(localAppData = process.env.LOCALAPPDATA || '') {
    const candidates = [
        path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
        path.join(localAppData, 'Riot Games', 'Riot Client', 'lockfile')
    ];
    for (const filePath of candidates) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const parts = fs.readFileSync(filePath, 'utf8').trim().split(':');
            const port = Number.parseInt(parts[2], 10);
            const password = parts[3] || '';
            if (!Number.isInteger(port) || port < 1 || port > 65535 || !password || parts.length < 4) continue;
            return { filePath, port, password };
        } catch {}
    }
    return null;
}

function requestRiotLocal(lockfile, { method = 'GET', requestPath, timeoutMs = 1500, requestImpl = https.request } = {}) {
    return new Promise((resolve) => {
        let request;
        try {
            request = requestImpl({
                hostname: '127.0.0.1',
                port: lockfile.port,
                path: requestPath,
                method,
                rejectUnauthorized: false,
                headers: { Authorization: `Basic ${Buffer.from(`riot:${lockfile.password}`).toString('base64')}` },
                timeout: timeoutMs
            }, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => { body += chunk; });
                response.on('end', () => resolve({ statusCode: response.statusCode || 0, body }));
            });
            request.on('error', () => resolve(null));
            request.on('timeout', () => { request.destroy(); resolve(null); });
            request.end();
        } catch {
            resolve(null);
        }
    });
}

async function getRiotSessionState({ localAppData, requestImpl } = {}) {
    const lockfile = readRiotLockfile(localAppData);
    if (!lockfile) return { state: 'unavailable', reason: 'NO_LOCKFILE', session: null };
    const response = await requestRiotLocal(lockfile, { requestPath: '/chat/v1/session', requestImpl });
    if (!response) return { state: 'unavailable', reason: 'NO_RESPONSE', session: null };
    if ([401, 403, 404].includes(response.statusCode)) return { state: 'logged_out', reason: 'UNAUTHENTICATED', session: null };
    if (response.statusCode < 200 || response.statusCode >= 300) return { state: 'unavailable', reason: `HTTP_${response.statusCode}`, session: null };
    try {
        const parsed = JSON.parse(response.body);
        const gameName = parsed.game_name || parsed.name || '';
        if (!gameName) return { state: 'logged_out', reason: 'EMPTY_SESSION', session: null };
        return {
            state: 'active',
            reason: 'AUTHENTICATED',
            session: {
                riotId: parsed.game_tag ? `${gameName}#${parsed.game_tag}` : gameName,
                gameName,
                tag: parsed.game_tag || '',
                region: String(parsed.region || '').toUpperCase()
            }
        };
    } catch {
        return { state: 'unavailable', reason: 'INVALID_RESPONSE', session: null };
    }
}

async function queryRiotSession(options = {}) {
    const status = await getRiotSessionState(options);
    return status.state === 'active' ? status.session : null;
}

async function waitForRiotLogout({ localAppData, requestImpl, timeoutMs = 10000, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastState = 'unavailable';
    while (Date.now() <= deadline) {
        const status = await getRiotSessionState({ localAppData, requestImpl });
        lastState = status.state;
        if (status.state === 'logged_out' || status.reason === 'NO_LOCKFILE') {
            return { confirmed: true, state: status.state, reason: status.reason };
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return { confirmed: false, state: lastState, reason: 'VERIFICATION_TIMEOUT' };
}

async function logoutRiotSession({ localAppData, requestImpl, verifyTimeoutMs = 10000, verifyIntervalMs = 250 } = {}) {
    const lockfile = readRiotLockfile(localAppData);
    if (!lockfile) return { attempted: false, loggedOut: false, reason: 'NO_LOCKFILE', verification: 'not-needed' };

    let response = await requestRiotLocal(lockfile, {
        method: 'DELETE',
        requestPath: '/rso-auth/v1/authorization',
        requestImpl
    });

    if (!response || response.statusCode === 404 || response.statusCode === 405) {
        response = await requestRiotLocal(lockfile, {
            method: 'POST',
            requestPath: '/lol-login/v1/delete-rso-on-close',
            requestImpl
        });
    }

    const endpointAccepted = Boolean(response && response.statusCode >= 200 && response.statusCode < 300);
    if (!endpointAccepted) {
        return { attempted: true, loggedOut: false, statusCode: response?.statusCode || 0, verification: 'endpoint-failed' };
    }

    await requestRiotLocal(lockfile, {
        method: 'DELETE',
        requestPath: '/riot-messaging-service/v1/session',
        requestImpl
    });

    const verification = await waitForRiotLogout({
        localAppData,
        requestImpl,
        timeoutMs: verifyTimeoutMs,
        intervalMs: verifyIntervalMs
    });
    return {
        attempted: true,
        loggedOut: verification.confirmed,
        statusCode: response.statusCode,
        verification: verification.confirmed ? 'confirmed' : verification.reason
    };
}

const VALORANT_TIERS = {
    0: 'Sin rango', 1: 'Sin rango', 2: 'Sin rango',
    3: 'Hierro 1', 4: 'Hierro 2', 5: 'Hierro 3',
    6: 'Bronce 1', 7: 'Bronce 2', 8: 'Bronce 3',
    9: 'Plata 1', 10: 'Plata 2', 11: 'Plata 3',
    12: 'Oro 1', 13: 'Oro 2', 14: 'Oro 3',
    15: 'Platino 1', 16: 'Platino 2', 17: 'Platino 3',
    18: 'Diamante 1', 19: 'Diamante 2', 20: 'Diamante 3',
    21: 'Ascendente 1', 22: 'Ascendente 2', 23: 'Ascendente 3',
    24: 'Inmortal 1', 25: 'Inmortal 2', 26: 'Inmortal 3',
    27: 'Radiante'
};

const LOL_TIERS = {
    IRON: 'Hierro',
    BRONZE: 'Bronce',
    SILVER: 'Plata',
    GOLD: 'Oro',
    PLATINUM: 'Platino',
    EMERALD: 'Esmeralda',
    DIAMOND: 'Diamante',
    MASTER: 'Máster',
    GRANDMASTER: 'Gran Máster',
    CHALLENGER: 'Challenger'
};

async function queryLiveRankAndStats({ localAppData, requestImpl } = {}) {
    const lockfile = readRiotLockfile(localAppData);
    if (!lockfile) return null;

    const sessionRes = await requestRiotLocal(lockfile, { requestPath: '/chat/v1/session', requestImpl });
    if (!sessionRes || sessionRes.statusCode < 200 || sessionRes.statusCode >= 300) return null;

    let sessionData;
    try {
        sessionData = JSON.parse(sessionRes.body);
    } catch {
        return null;
    }

    const gameName = sessionData.game_name || sessionData.name || '';
    if (!gameName) return null;
    const puuid = sessionData.puuid || '';
    const riotId = sessionData.game_tag ? `${gameName}#${sessionData.game_tag}` : gameName;

    const presencesRes = await requestRiotLocal(lockfile, { requestPath: '/chat/v1/presences', requestImpl });
    if (!presencesRes || presencesRes.statusCode < 200 || presencesRes.statusCode >= 300) {
        return { riotId, gameName, puuid };
    }

    try {
        const presencesData = JSON.parse(presencesRes.body);
        const presences = Array.isArray(presencesData) ? presencesData : (presencesData.presences || []);
        const myPresence = presences.find((p) => (puuid && p.puuid === puuid) || (p.game_name === gameName));
        if (!myPresence || !myPresence.private) {
            return { riotId, gameName, puuid };
        }

        let privateData;
        try {
            privateData = JSON.parse(Buffer.from(myPresence.private, 'base64').toString('utf8'));
        } catch {
            return { riotId, gameName, puuid };
        }

        let rank = null;
        let level = null;
        let detectedGame = myPresence.product || null;

        if (privateData.competitiveTier !== undefined) {
            rank = VALORANT_TIERS[privateData.competitiveTier] || null;
            level = privateData.accountLevel ? String(privateData.accountLevel) : null;
            detectedGame = 'valorant';
        } else if (privateData.rankedLeagueTier) {
            rank = LOL_TIERS[String(privateData.rankedLeagueTier).toUpperCase()] || null;
            level = privateData.level ? String(privateData.level) : null;
            detectedGame = 'league_of_legends';
        }

        return {
            riotId,
            gameName,
            puuid,
            game: detectedGame,
            rank,
            level
        };
    } catch {
        return { riotId, gameName, puuid };
    }
}

module.exports = {
    readRiotLockfile,
    requestRiotLocal,
    getRiotSessionState,
    queryRiotSession,
    queryLiveRankAndStats,
    waitForRiotLogout,
    logoutRiotSession
};
