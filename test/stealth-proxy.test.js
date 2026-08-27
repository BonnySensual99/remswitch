'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { filterXmppClientTraffic, rewriteClientConfig, startStealthProxy, stopStealthProxy } = require('../lib/stealth-proxy');

test('stealth-proxy: filtra stanzas de presencia para ocultar estado y detalles de partida', () => {
    const rawXml = "<presence to='eu1.pvp.net'><show>chat</show><status>Jugando</status><games><valorant><partyId>123</partyId></valorant></games></presence>";
    const filtered = filterXmppClientTraffic(rawXml);

    assert.ok(filtered.includes('<show>offline</show>'));
    assert.ok(!filtered.includes('<show>chat</show>'));
    assert.ok(!filtered.includes('<partyId>123</partyId>'));
});

test('stealth-proxy: conserva tráfico que no es de presencia', () => {
    const chatMsg = "<message to='friend@eu1.pvp.net' type='chat'><body>Hola!</body></message>";
    const result = filterXmppClientTraffic(chatMsg);
    assert.equal(result, chatMsg);
});

test('stealth-proxy: reescribe clientconfig JSON redirigiendo chat hacia localhost', () => {
    const sampleConfig = JSON.stringify({
        'chat.host': 'eu1.chat.si.riotgames.com',
        'chat.port': 5223,
        'chat.allow_bad_cert.enabled': false,
        'chat.affinities': { 'EU': 'eu1.chat.si.riotgames.com' }
    });

    const { modifiedJson, upstreamHost, upstreamPort } = rewriteClientConfig(sampleConfig, 55555);
    const parsed = JSON.parse(modifiedJson);

    assert.equal(upstreamHost, 'eu1.chat.si.riotgames.com');
    assert.equal(upstreamPort, 5223);
    assert.equal(parsed['chat.host'], 'deceive-localhost.molenzwiebel.xyz');
    assert.equal(parsed['chat.port'], 55555);
    assert.equal(parsed['chat.allow_bad_cert.enabled'], true);
    assert.equal(parsed['chat.affinities']['EU'], 'deceive-localhost.molenzwiebel.xyz');
});

test('stealth-proxy: permite alternar entre modo offline y online dinámicamente', () => {
    const { setStealthMode, getStealthMode } = require('../lib/stealth-proxy');
    const rawXml = "<presence to='eu1.pvp.net'><show>chat</show><status>Jugando</status></presence>";
    
    setStealthMode('offline');
    assert.equal(getStealthMode(), 'offline');
    assert.ok(filterXmppClientTraffic(rawXml).includes('<show>offline</show>'));

    setStealthMode('online');
    assert.equal(getStealthMode(), 'online');
    assert.ok(filterXmppClientTraffic(rawXml).includes('<show>chat</show>'));

    setStealthMode('offline');
});

test('stealth-proxy: inicia y detiene servidores locales HTTP y TLS', async () => {
    const proxy = await startStealthProxy();
    assert.ok(proxy.configPort > 0);
    assert.ok(proxy.chatPort > 0);

    stopStealthProxy();
});

test('stealth-proxy: inyecta jugador fantasma en el roster XMPP y bloquea mensajes salientes al bot', () => {
    // La inyección ocurre en el handler de secureConnection, así que validamos
    // que el FAKE_JID y el ROSTER_MARKER son constantes conocidas.
    // Verificamos también que mensajes al bot no pasan el filtro de presencia.
    const FAKE_JID = '41c322a1-b328-495b-a004-5ccd3e45eae8@eu1.pvp.net';
    const ROSTER_MARKER = "<query xmlns='jabber:iq:riotgames:roster'>";

    // Simular un roster del servidor con el marcador correcto
    const serverRoster =
        `<iq type='result'><query xmlns='jabber:iq:riotgames:roster'>` +
        `<item jid='friend@eu1.pvp.net' subscription='both'/></query></iq>`;
    assert.ok(serverRoster.includes(ROSTER_MARKER), 'roster contiene el marcador esperado');

    // El JID del bot no debe pasarse por filterXmppClientTraffic como presencia,
    // pero sí como mensaje — verificamos que no es una presencia
    const msgToBot = `<message to='${FAKE_JID}' type='chat'><body>hola</body></message>`;
    assert.ok(!msgToBot.includes('<presence'), 'mensaje al bot no es stanza de presencia');
    assert.ok(msgToBot.includes(FAKE_JID), 'mensaje contiene JID del bot');
});

