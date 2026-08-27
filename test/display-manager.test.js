'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    DEFAULT_PROFILES,
    loadDisplayProfiles,
    saveDisplayProfiles,
    saveProfile,
    deleteProfile
} = require('../lib/display-manager');

test('display-manager: carga perfiles por defecto si el almacén no existe', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdisplay-test-'));
    try {
        const profiles = loadDisplayProfiles(tempDir);
        assert.equal(profiles.length, DEFAULT_PROFILES.length);
        assert.equal(profiles[0].name, DEFAULT_PROFILES[0].name);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('display-manager: permite guardar un nuevo perfil y actualizarlo', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdisplay-test-'));
    try {
        const initial = loadDisplayProfiles(tempDir);
        const updated = saveProfile({
            name: 'Custom 1440',
            width: 1440,
            height: 1080,
            frequency: 240,
            vibrance: 95,
            tag: 'Custom'
        }, tempDir);

        assert.equal(updated.length, initial.length + 1);
        const added = updated.find((p) => p.name === 'Custom 1440');
        assert.ok(added);
        assert.equal(added.width, 1440);
        assert.equal(added.height, 1080);
        assert.equal(added.frequency, 240);
        assert.equal(added.vibrance, 95);

        // Edit profile
        const modified = saveProfile({
            id: added.id,
            name: 'Custom 1440 Renamed',
            width: 1440,
            height: 1080,
            frequency: 240,
            vibrance: 100
        }, tempDir);

        const foundMod = modified.find((p) => p.id === added.id);
        assert.equal(foundMod.name, 'Custom 1440 Renamed');
        assert.equal(foundMod.vibrance, 100);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('display-manager: permite eliminar un perfil existente', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdisplay-test-'));
    try {
        const list = saveProfile({
            id: 'to-delete-123',
            name: 'Eliminar Test',
            width: 1280,
            height: 960
        }, tempDir);

        assert.ok(list.find((p) => p.id === 'to-delete-123'));

        const afterDel = deleteProfile('to-delete-123', tempDir);
        assert.ok(!afterDel.find((p) => p.id === 'to-delete-123'));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('display-manager: permite eliminar todos los perfiles por defecto y conservar la lista vacía', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remdisplay-test-'));
    try {
        let list = loadDisplayProfiles(tempDir);
        assert.equal(list.length, DEFAULT_PROFILES.length);

        for (const p of DEFAULT_PROFILES) {
            list = deleteProfile(p.id, tempDir);
        }

        assert.equal(list.length, 0);
        const reloaded = loadDisplayProfiles(tempDir);
        assert.equal(reloaded.length, 0);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

