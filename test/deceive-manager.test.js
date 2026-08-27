const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    DECEIVE_EXE_NAME,
    getDefaultDeceivePath,
    resolveDeceivePath,
    getDeceiveGameArgs,
    isDeceiveInstalled
} = require('../lib/deceive-manager');

test('deceive-manager: retorna argumentos correctos para cada juego', () => {
    assert.deepEqual(getDeceiveGameArgs('valorant'), ['valorant']);
    assert.deepEqual(getDeceiveGameArgs('league_of_legends'), ['lol']);
    assert.deepEqual(getDeceiveGameArgs('lol'), ['lol']);
    assert.deepEqual(getDeceiveGameArgs('lor'), ['lor']);
    assert.deepEqual(getDeceiveGameArgs('none'), ['valorant']);
});

test('deceive-manager: resuelve la ruta por defecto o personalizada', () => {
    const defaultPath = getDefaultDeceivePath();
    assert.ok(defaultPath.endsWith(DECEIVE_EXE_NAME));
    assert.equal(resolveDeceivePath(''), defaultPath);
});

test('deceive-manager: verifica si Deceive está instalado correctamente', () => {
    assert.equal(typeof isDeceiveInstalled(), 'boolean');
    assert.equal(isDeceiveInstalled('C:\\non_existent_path_12345\\Deceive.exe'), false);
});
