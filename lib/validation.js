const GAMES = new Set(['valorant', 'league_of_legends']);
const REGIONS = new Set(['EU', 'NA', 'LATAM', 'KR', 'AP', 'BR']);

function text(value, name, max, { required = false } = {}) {
    if (value == null) value = '';
    if (typeof value !== 'string') throw new Error(`${name} no es válido.`);
    const normalized = value.trim();
    if (required && !normalized) throw new Error(`${name} es obligatorio.`);
    if (normalized.length > max) throw new Error(`${name} supera ${max} caracteres.`);
    return normalized;
}

function clampNumber(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeGame(value) {
    const mapped = value === 'lol' ? 'league_of_legends' : value;
    if (!GAMES.has(mapped)) throw new Error('Juego no compatible.');
    return mapped;
}

function normalizeAccountInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Los datos de la cuenta no son válidos.');
    }
    const game = normalizeGame(input.game || 'valorant');
    const region = text(input.region || 'EU', 'Región', 12).toUpperCase();
    if (!REGIONS.has(region)) throw new Error('Región no compatible.');

    const customAvatar = typeof input.customAvatar === 'string' && input.customAvatar.startsWith('data:image/')
        ? (input.customAvatar.length <= 600000 ? input.customAvatar : '')
        : '';

    return {
        id: input.id == null || input.id === '' ? undefined : text(String(input.id), 'ID', 80, { required: true }),
        profileId: text(input.profileId || 'default', 'Perfil', 80),
        displayName: text(input.displayName, 'Nombre de cuenta', 60, { required: true }),
        game,
        region,
        username: text(input.username, 'Usuario de Riot', 80, { required: true }),
        password: text(input.password || '', 'Contraseña', 256),
        riotId: text(input.riotId || '', 'Riot ID', 80),
        rank: text(input.rank || '', 'Rango', 40),
        level: text(input.level || '', 'Nivel', 40),
        avatarAgent: text(input.avatarAgent || (game === 'valorant' ? 'Jett' : 'Ahri'), 'Icono', 40),
        customAvatar,
        notes: text(input.notes || '', 'Notas', 500),
        deceiveOffline: Boolean(input.deceiveOffline)
    };
}

function normalizeProfileInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Los datos del perfil no son válidos.');
    }
    return {
        id: input.id == null || input.id === '' ? undefined : text(String(input.id), 'ID de perfil', 80),
        name: text(input.name, 'Nombre de perfil', 40, { required: true })
    };
}

function normalizeSettings(input, defaults) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
        startWithWindows: Boolean(value.startWithWindows),
        minimizeToTray: value.minimizeToTray !== false,
        autoLaunchGame: value.autoLaunchGame !== false && value.autoLaunchValorant !== false,
        closeOnLaunch: Boolean(value.closeOnLaunch),
        confirmSwitch: value.confirmSwitch !== false,
        soundEnabled: value.soundEnabled !== false,
        reducedMotion: Boolean(value.reducedMotion),
        autoCloseRunningGames: Boolean(value.autoCloseRunningGames ?? defaults?.autoCloseRunningGames ?? true),
        autoSyncRank: Boolean(value.autoSyncRank ?? defaults?.autoSyncRank ?? true),
        globalShortcut: text(value.globalShortcut || defaults?.globalShortcut || 'CommandOrControl+Alt+R', 'Atajo global', 60),
        initialDelayMs: clampNumber(value.initialDelayMs, defaults.initialDelayMs, 300, 10000),
        charDelayMs: clampNumber(value.charDelayMs, defaults.charDelayMs, 1, 100),
        fieldDelayMs: clampNumber(value.fieldDelayMs, defaults.fieldDelayMs, 50, 1000),
        customRiotPath: text(value.customRiotPath || '', 'Ruta de Riot Client', 520),
        customDeceivePath: text(value.customDeceivePath || '', 'Ruta de Deceive', 520)
    };
}

module.exports = {
    GAMES,
    REGIONS,
    clampNumber,
    normalizeAccountInput,
    normalizeProfileInput,
    normalizeGame,
    normalizeSettings
};



