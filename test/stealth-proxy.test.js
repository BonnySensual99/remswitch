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
    assert.equal(parsed['chat.host'], '127.0.0.1');
    assert.equal(parsed['chat.port'], 55555);
    assert.equal(parsed['chat.allow_bad_cert.enabled'], true);
    assert.equal(parsed['chat.affinities']['EU'], '127.0.0.1');
});

test('stealth-proxy: inicia y detiene servidores locales HTTP y TLS', async () => {
    const proxy = await startStealthProxy();
    assert.ok(proxy.configPort > 0);
    assert.ok(proxy.chatPort > 0);

    stopStealthProxy();
});
