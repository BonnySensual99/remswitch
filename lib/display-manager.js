'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_PROFILES = [
    { id: 'native-1080p', name: '1080p Nativa', width: 1920, height: 1080, frequency: 0, vibrance: 50, tag: '16:9' },
    { id: 'stretched-1568', name: '1568 Stretched Valorant', width: 1568, height: 1080, frequency: 0, vibrance: 85, tag: 'Stretched' },
    { id: 'stretched-1440', name: '1440 Stretched 4:3', width: 1440, height: 1080, frequency: 0, vibrance: 80, tag: '4:3' },
    { id: 'stretched-1280-960', name: '1280x960 CS2 / Val', width: 1280, height: 960, frequency: 0, vibrance: 90, tag: '4:3' },
    { id: 'stretched-1280-1024', name: '1280x1024 5:4', width: 1280, height: 1024, frequency: 0, vibrance: 75, tag: '5:4' }
];

let activeVibranceTimers = [];

function getDisplayBridgePath() {
    const candidates = [
        path.join(process.resourcesPath || '', 'native', 'RemDisplayBridge.exe'),
        path.join(__dirname, '..', 'native', 'RemDisplayBridge.exe'),
        path.join(__dirname, '..', '.native-build', 'bin', 'Release', 'RemDisplayBridge.exe')
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return candidates[1];
}

function getProfilesFilePath(customUserDataDir) {
    const baseDir = customUserDataDir || (app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(__dirname, '..'));
    return path.join(baseDir, 'display-profiles.json');
}

function loadDisplayProfiles(customUserDataDir) {
    const filePath = getProfilesFilePath(customUserDataDir);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
                return data;
            }
        }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_PROFILES));
}

function saveDisplayProfiles(profiles, customUserDataDir) {
    const filePath = getProfilesFilePath(customUserDataDir);
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf8');
    } catch (err) {
        console.error('Error saving display profiles:', err);
    }
}

function runBridgeCommand(args, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const bridgeExe = getDisplayBridgePath();
        if (!fs.existsSync(bridgeExe)) {
            resolve({ ok: false, error: 'Puente nativo RemDisplayBridge no encontrado.' });
            return;
        }

        execFile(bridgeExe, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error) {
                resolve({ ok: false, error: error.message || 'Error al ejecutar RemDisplayBridge.' });
                return;
            }
            try {
                const trimmed = (stdout || '').trim();
                if (!trimmed) {
                    resolve({ ok: false, error: 'Respuesta vacía del puente de pantalla.' });
                    return;
                }
                const parsed = JSON.parse(trimmed);
                resolve(parsed);
            } catch (jsonErr) {
                resolve({ ok: false, error: `Error interpretando respuesta nativa: ${jsonErr.message}` });
            }
        });
    });
}

async function getDisplayState(customUserDataDir) {
    const nativeState = await runBridgeCommand(['get-state']);
    const profiles = loadDisplayProfiles(customUserDataDir);
    return {
        ...nativeState,
        profiles
    };
}

async function setResolution(displayName, width, height, frequency = 0) {
    const args = ['set-resolution', displayName || '\\\\.\\DISPLAY1', String(width), String(height), String(frequency || 0)];
    return await runBridgeCommand(args);
}

async function setVibrance(displayName, percentage) {
    const clamped = Math.max(0, Math.Min ? Math.Min(100, percentage) : Math.min(100, percentage));
    const args = ['set-vibrance', displayName || '\\\\.\\DISPLAY1', String(clamped)];
    return await runBridgeCommand(args);
}

function scheduleVibranceReapplication(displayName, percentage) {
    for (const timer of activeVibranceTimers) {
        clearTimeout(timer);
    }
    activeVibranceTimers = [];

    const delays = [350, 1000];
    for (const delay of delays) {
        const timer = setTimeout(() => {
            setVibrance(displayName, percentage).catch(() => {});
        }, delay);
        activeVibranceTimers.push(timer);
    }
}

async function applyProfile(displayName, profile) {
    if (!profile || !profile.width || !profile.height) {
        return { ok: false, error: 'Perfil de resolución no válido.' };
    }

    const resResult = await setResolution(displayName, profile.width, profile.height, profile.frequency || 0);
    if (!resResult.ok) {
        return resResult;
    }

    if (typeof profile.vibrance === 'number' && profile.vibrance >= 0) {
        await setVibrance(displayName, profile.vibrance);
        scheduleVibranceReapplication(displayName, profile.vibrance);
    }

    return {
        ok: true,
        message: `Resolución ${profile.width} × ${profile.height} aplicada correctamente`,
        mode: resResult.mode
    };
}

function saveProfile(profileInput, customUserDataDir) {
    const profiles = loadDisplayProfiles(customUserDataDir);
    const width = parseInt(profileInput.width, 10);
    const height = parseInt(profileInput.height, 10);
    const frequency = parseInt(profileInput.frequency, 10) || 0;
    const vibrance = typeof profileInput.vibrance === 'number' ? Math.max(0, Math.min(100, profileInput.vibrance)) : (profileInput.vibrance ? parseInt(profileInput.vibrance, 10) : null);
    const name = String(profileInput.name || `${width}x${height}`).trim();
    const tag = String(profileInput.tag || (width === 1920 && height === 1080 ? '16:9' : 'Stretched')).trim();

    if (!width || !height || width < 320 || height < 200) {
        throw new Error('Resolución inválida.');
    }

    const existingIndex = profileInput.id ? profiles.findIndex((p) => p.id === profileInput.id) : profiles.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());

    const newProfile = {
        id: profileInput.id || `profile-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        width,
        height,
        frequency,
        vibrance,
        tag
    };

    if (existingIndex >= 0) {
        profiles[existingIndex] = newProfile;
    } else {
        profiles.push(newProfile);
    }

    saveDisplayProfiles(profiles, customUserDataDir);
    return profiles;
}

function deleteProfile(idOrName, customUserDataDir) {
    let profiles = loadDisplayProfiles(customUserDataDir);
    profiles = profiles.filter((p) => p.id !== idOrName && p.name !== idOrName);
    saveDisplayProfiles(profiles, customUserDataDir);
    return profiles;
}

module.exports = {
    DEFAULT_PROFILES,
    getDisplayBridgePath,
    loadDisplayProfiles,
    saveDisplayProfiles,
    getDisplayState,
    setResolution,
    setVibrance,
    applyProfile,
    saveProfile,
    deleteProfile
};
