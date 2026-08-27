
function formatShortcut(accelerator) {
    if (!accelerator) return '<span style="color:var(--muted)">Sin asignar</span>';
    const parts = accelerator.split('+');
    return parts.map(p => {
        if (p === 'CommandOrControl') return '<kbd>Ctrl</kbd>';
        if (p === 'Super') return '<kbd>Win</kbd>';
        if (p === 'Space') return '<kbd>Espacio</kbd>';
        return `<kbd>${p}</kbd>`;
    }).join(' <span class="or-sep">+</span> ');
}

const rendererApi = window.api || null;
const $ = (id) => document.getElementById(id);

const elements = {
    accountsList: $('accountsList'), searchInput: $('searchInput'), gameTabs: $('gameTabs'), navTabs: $('navTabs'),
    accountModal: $('accountModal'), settingsModal: $('settingsModal'), themesModal: $('themesModal'), profileModal: $('profileModal'), profilesModal: $('profilesModal'), confirmModal: $('confirmModal'),
    switchOverlay: $('switchOverlay'), toast: $('toast')
};

const GAME_LABELS = { valorant: 'VALORANT', league_of_legends: 'LEAGUE OF LEGENDS' };
const RANKS = {
    valorant: [
        'Sin rango',
        'Hierro 1', 'Hierro 2', 'Hierro 3',
        'Bronce 1', 'Bronce 2', 'Bronce 3',
        'Plata 1', 'Plata 2', 'Plata 3',
        'Oro 1', 'Oro 2', 'Oro 3',
        'Platino 1', 'Platino 2', 'Platino 3',
        'Diamante 1', 'Diamante 2', 'Diamante 3',
        'Ascendente 1', 'Ascendente 2', 'Ascendente 3',
        'Inmortal 1', 'Inmortal 2', 'Inmortal 3',
        'Radiante'
    ],
    league_of_legends: [
        'Sin rango', 'Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Máster', 'Gran Máster', 'Challenger'
    ]
};
const AVATARS = {
    valorant: ['Jett', 'Phoenix', 'Reyna', 'Chamber', 'Viper', 'Omen', 'Fade', 'Iso'],
    league_of_legends: ['Ahri', 'Yasuo', 'Jinx', 'Zed', 'Lux', 'Thresh', 'Akali', 'Ekko']
};
const SWITCH_STAGES = ['CheckingRiotClient', 'LoggingOut', 'LogoutConfirmed', 'ClosingExistingSession', 'StartingRiotClient', 'WaitingForLoginWindow', 'Authenticating', 'CredentialsSubmitted', 'WaitingForAuthentication', 'LaunchingGame'];
const TERMINAL_SWITCH_STATES = new Set(['Error', 'ManualActionRequired', 'WrongPassword', 'Timeout', 'Done']);

let accounts = [];
let activity = [];
let profiles = [{ id: 'default', name: 'Principal', createdAt: 0 }];
let activeProfileId = 'default';
let settings = null;
let runtimeStatus = null;
let currentFilter = 'all';
let currentView = 'accounts';
let activeRequestId = null;
let lastSwitchAccount = null;
let openModal = null;
let previousFocus = null;
let switchPreviousFocus = null;
let confirmResolver = null;
let toastTimer = null;
let audioContext = null;
let particles = [];
let animationFrame = null;
let viewAnimationTimer = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function playSound(type = 'click') {
    if (settings && settings.soundEnabled === false) return;
    try {
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(type === 'success' ? 620 : type === 'error' ? 180 : 480, now);
        if (type === 'success') oscillator.frequency.exponentialRampToValueAtTime(920, now + .13);
        gain.gain.setValueAtTime(type === 'error' ? .055 : .035, now);
        gain.gain.exponentialRampToValueAtTime(.001, now + .14);
        oscillator.start(now);
        oscillator.stop(now + .14);
    } catch {}
}

function showToast(message, type = 'info') {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3200);
}

const STYLES_META = {
    oled: { name: 'Minimal OLED', icon: '⬛' },
    scifi: { name: 'Sci-Fi Hologram', icon: '🚀' }
};

const THEME_RGBS = {
    red: '255, 70, 85',
    cyan: '0, 240, 255',
    green: '32, 227, 154',
    purple: '185, 131, 255',
    gold: '255, 189, 61',
    pink: '255, 42, 133',
    white: '241, 245, 249'
};

let currentStyle = 'oled';
let currentColor = 'red';
let currentThemeRgb = THEME_RGBS.red;

function applyStyle(style, save = true) {
    const safeStyle = STYLES_META[style] ? style : 'oled';
    currentStyle = safeStyle;
    document.body.dataset.style = safeStyle;
    if (save) localStorage.setItem('style', safeStyle);

    const meta = STYLES_META[safeStyle];


    document.querySelectorAll('.style-card').forEach((btn) => btn.classList.toggle('active', btn.dataset.style === safeStyle));

    initCanvas();
}

function applyColor(color, save = true) {
    const safeColor = THEME_RGBS[color] ? color : 'red';
    currentColor = safeColor;
    document.body.dataset.color = safeColor;
    document.body.dataset.theme = safeColor;
    currentThemeRgb = THEME_RGBS[safeColor] || THEME_RGBS.red;
    if (save) {
        localStorage.setItem('color', safeColor);
        localStorage.setItem('theme', safeColor);
    }



    document.querySelectorAll('.theme-dot').forEach((btn) => {
        const dotColor = btn.dataset.color || btn.dataset.theme;
        btn.classList.toggle('active', dotColor === safeColor);
    });
    document.querySelectorAll('.color-swatch').forEach((btn) => {
        const swatchColor = btn.dataset.color || btn.dataset.theme;
        btn.classList.toggle('active', swatchColor === safeColor);
    });
}

function applyTheme(theme) {
    applyColor(theme);
}

function applyMotionPreference() {
    document.body.classList.toggle('reduce-motion', Boolean(settings?.reducedMotion));
    if (settings?.reducedMotion && animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    } else if (!animationFrame) {
        initCanvas();
        animateCanvas();
    }
}

let pendingMousePos = { x: -1000, y: -1000 };
let mousePos = { x: -1000, y: -1000 };
let isWindowActive = true;
let lastCanvasFrameTime = 0;
const CANVAS_FRAME_INTERVAL_MS = 28; // Cap canvas to ~35 FPS for zero CPU/GPU overhead

function initCanvas() {
    const canvas = $('bgCanvas');
    if (!canvas) return;
    canvas.width = Math.floor(window.innerWidth);
    canvas.height = Math.floor(window.innerHeight);

    const count = currentStyle === 'oled' ? 12 : 22;

    particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - .5) * (currentStyle === 'oled' ? .12 : .22),
        vy: (Math.random() - .5) * (currentStyle === 'oled' ? .12 : .22),
        size: currentStyle === 'oled' ? Math.random() * 1.0 + 0.6 : Math.random() * 1.6 + 1.0,
        alpha: currentStyle === 'oled' ? Math.random() * .10 + .05 : Math.random() * .22 + .10,
        phase: Math.random() * Math.PI * 2,
        anchor: currentStyle !== 'oled' && Math.random() < .15
    }));
}

function animateCanvas(timestamp = 0) {
    if (settings?.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!isWindowActive || document.hidden) {
        animationFrame = requestAnimationFrame(animateCanvas);
        return;
    }

    if (timestamp - lastCanvasFrameTime < CANVAS_FRAME_INTERVAL_MS) {
        animationFrame = requestAnimationFrame(animateCanvas);
        return;
    }
    lastCanvasFrameTime = timestamp;

    const canvas = $('bgCanvas');
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    mousePos.x = pendingMousePos.x;
    mousePos.y = pendingMousePos.y;

    const color = currentThemeRgb;
    const pLen = particles.length;

    // Draw connection mesh only for scifi style
    if (currentStyle === 'scifi') {
        const maxDistSq = 120 * 120;
        context.lineWidth = 0.6;
        for (let index = 0; index < pLen; index += 1) {
            const first = particles[index];
            for (let otherIndex = index + 1; otherIndex < pLen; otherIndex += 1) {
                const second = particles[otherIndex];
                const dx = first.x - second.x;
                const dy = first.y - second.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > maxDistSq) continue;
                const strength = 1 - Math.sqrt(distSq) / 120;
                context.strokeStyle = `rgba(${color}, ${strength * 0.14})`;
                context.beginPath();
                context.moveTo(first.x, first.y);
                context.lineTo(second.x, second.y);
                context.stroke();
            }
        }
    }

    // Draw particles
    for (let i = 0; i < pLen; i += 1) {
        const particle = particles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.phase += .012;
        if (particle.x < 0) particle.x = canvas.width;
        else if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        else if (particle.y > canvas.height) particle.y = 0;

        if (mousePos.x > 0 && currentStyle === 'scifi') {
            const mdx = particle.x - mousePos.x;
            const mdy = particle.y - mousePos.y;
            const mdistSq = mdx * mdx + mdy * mdy;
            if (mdistSq < 10000) {
                const mdist = Math.sqrt(mdistSq);
                const mforce = (1 - mdist / 100) * 0.25;
                context.strokeStyle = `rgba(${color}, ${mforce * 0.3})`;
                context.beginPath();
                context.moveTo(particle.x, particle.y);
                context.lineTo(mousePos.x, mousePos.y);
                context.stroke();
            }
        }

        const alpha = particle.alpha * (0.85 + Math.sin(particle.phase) * 0.15);
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();

        if (particle.anchor && currentStyle === 'scifi') {
            context.strokeStyle = `rgba(${color}, ${alpha * 0.4})`;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.size * 2.2, 0, Math.PI * 2);
            context.stroke();
        }
    }

    animationFrame = requestAnimationFrame(animateCanvas);
}

function showModal(modal) {
    if (!modal) return;
    if (openModal && openModal !== modal) hideModal(openModal);
    previousFocus = document.activeElement;
    openModal = modal;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('input:not([type="hidden"]), select, button, textarea')?.focus());
}

function hideModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (openModal === modal) openModal = null;
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
    if (modal === elements.settingsModal) setActiveNav(currentView);
}

function trapModalFocus(event) {
    const dialog = openModal || (elements.switchOverlay.classList.contains('active') ? elements.switchOverlay : null);
    if (!dialog || event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function confirmAction(title, message, acceptLabel = 'Confirmar') {
    if (confirmResolver) confirmResolver(false);
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('btnConfirmAccept').textContent = acceptLabel;
    showModal(elements.confirmModal);
    return new Promise((resolve) => { confirmResolver = resolve; });
}

function settleConfirmation(accepted) {
    const resolver = confirmResolver;
    confirmResolver = null;
    hideModal(elements.confirmModal);
    resolver?.(accepted);
}

function formatDate(timestamp) {
    if (!timestamp) return 'Nunca';
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000));
}

function formatRelative(timestamp) {
    if (!timestamp) return 'Nunca usada';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (seconds < 60) return 'Ahora';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return formatDate(timestamp);
}

function updateSelectOptions(select, values, selected) {
    select.textContent = '';
    for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
    }
    if (selected && values.includes(selected)) select.value = selected;
}

function updateGameFields(game, selectedRank, selectedAvatar) {
    updateSelectOptions($('accRank'), RANKS[game] || RANKS.valorant, selectedRank);
    updateSelectOptions($('accAvatar'), AVATARS[game] || AVATARS.valorant, selectedAvatar);
}

function renderProfiles() {
    const active = profiles.find((p) => p.id === activeProfileId) || profiles[0] || { id: 'default', name: 'Principal' };
    activeProfileId = active.id;
    const name = active.name?.trim() || 'Principal';
    const initial = name.charAt(0).toUpperCase();
    $('headerUsername').textContent = name;
    $('headerAvatar').textContent = initial;

    const list = $('profileList');
    if (list) {
        list.textContent = '';
        for (const p of profiles) {
            const count = accounts.filter((a) => (a.profileId || 'default') === p.id).length;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `profile-item${p.id === activeProfileId ? ' active' : ''}`;
            item.innerHTML = `
                <span class="profile-item-name">${escapeHtml(p.name)}</span>
                <span class="profile-item-badge">${count} ${count === 1 ? 'cuenta' : 'cuentas'}</span>
            `;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectProfile(p.id);
            });
            list.append(item);
        }
    }
}

function renderProfilesManager() {
    const list = $('profilesManagerList');
    if (!list) return;
    list.textContent = '';
    for (const p of profiles) {
        const count = accounts.filter((a) => (a.profileId || 'default') === p.id).length;
        const isActive = p.id === activeProfileId;
        const item = document.createElement('div');
        item.className = `profiles-manager-item${isActive ? ' is-active' : ''}`;
        item.innerHTML = `
            <div class="profiles-manager-info">
                <strong>${escapeHtml(p.name)}</strong>
                <small>${count} ${count === 1 ? 'cuenta' : 'cuentas'}${isActive ? ' · Activo' : ''}</small>
            </div>
            <div class="profiles-manager-actions">
                ${!isActive ? `<button type="button" class="btn secondary small btn-set-active" title="Activar perfil">Activar</button>` : ''}
                <button type="button" class="card-action edit btn-edit-prof" title="Renombrar perfil" aria-label="Renombrar">${iconSvg('edit')}</button>
                ${profiles.length > 1 ? `<button type="button" class="card-action delete btn-del-prof" title="Eliminar perfil" aria-label="Eliminar">${iconSvg('trash')}</button>` : ''}
            </div>
        `;
        item.querySelector('.btn-set-active')?.addEventListener('click', () => {
            selectProfile(p.id);
            renderProfilesManager();
        });
        item.querySelector('.btn-edit-prof')?.addEventListener('click', () => openEditProfile(p));
        item.querySelector('.btn-del-prof')?.addEventListener('click', () => deleteProfile(p.id));
        list.append(item);
    }
}

async function selectProfile(profileId) {
    activeProfileId = profileId;
    $('profileDropdown')?.classList.add('hidden');
    $('userPill')?.classList.remove('active');
    if (rendererApi) {
        try {
            const res = await rendererApi.setActiveProfile(profileId);
            profiles = res.profiles || profiles;
            activeProfileId = res.activeProfileId || profileId;
        } catch {}
    }
    renderProfiles();
    renderAccounts();
}

function openEditProfile(profileItem) {
    $('editProfileId').value = profileItem.id;
    $('inputProfileUsername').value = profileItem.name || '';
    $('profileTitle').textContent = `Renombrar perfil “${profileItem.name}”`;
    showModal(elements.profileModal);
}

async function saveProfile(event) {
    event.preventDefault();
    if (!rendererApi) return;
    const id = $('editProfileId')?.value;
    const name = $('inputProfileUsername')?.value?.trim();
    if (!name) return;
    try {
        const res = await rendererApi.saveProfile({ id: id || undefined, name });
        profiles = res.profiles || profiles;
        activeProfileId = res.activeProfileId || activeProfileId;
        hideModal(elements.profileModal);
        renderProfiles();
        renderAccounts();
        renderProfilesManager();
        showToast('Perfil guardado.', 'success');
        playSound('success');
    } catch (err) {
        showToast(err.message || 'Error al guardar perfil.', 'error');
    }
}

function openProfilesManager() {
    $('profileDropdown')?.classList.add('hidden');
    $('userPill')?.classList.remove('active');
    renderProfilesManager();
    showModal(elements.profilesModal);
}

function openQuickCreateProfile() {
    $('profileDropdown')?.classList.add('hidden');
    $('userPill')?.classList.remove('active');
    openProfilesManager();
    $('inputNewProfileName')?.focus();
}

async function createProfileFromBar(event) {
    event.preventDefault();
    if (!rendererApi) return;
    const input = $('inputNewProfileName');
    const name = input.value.trim();
    if (!name) return;
    try {
        const res = await rendererApi.saveProfile({ name });
        profiles = res.profiles || profiles;
        activeProfileId = res.activeProfileId || activeProfileId;
        input.value = '';
        renderProfiles();
        renderAccounts();
        renderProfilesManager();
        showToast(`Perfil “${name}” creado y activado.`, 'success');
        playSound('success');
    } catch (err) {
        showToast(err.message || 'Error al crear perfil.', 'error');
    }
}

async function deleteProfile(profileId) {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;
    const accepted = await confirmAction('Eliminar perfil', `Se eliminará el perfil “${target.name}”. Las cuentas que contenga se trasladarán automáticamente al perfil principal.`, 'Eliminar perfil');
    if (!accepted || !rendererApi) return;
    try {
        const res = await rendererApi.deleteProfile(profileId);
        profiles = res.profiles || profiles;
        activeProfileId = res.activeProfileId || activeProfileId;
        accounts = await rendererApi.getAccounts();
        renderProfiles();
        renderAccounts();
        renderProfilesManager();
        showToast('Perfil eliminado y cuentas trasladadas.');
    } catch (err) {
        showToast(err.message || 'No se pudo eliminar el perfil.', 'error');
    }
}

function renderRuntime() {
    const encryption = $('encryptionState');
    if (!encryption) return;
    const riot = $('riotState');
    const operation = $('operationState');
    const session = $('riotSessionState');
    const gameProcess = $('gameProcessState');
    encryption.textContent = runtimeStatus?.encryptionAvailable ? 'DPAPI activo' : 'No disponible';
    encryption.className = runtimeStatus?.encryptionAvailable ? 'state-ok' : 'state-bad';
    const riotReady = runtimeStatus?.riotClientFound && runtimeStatus?.riotSignatureValid;
    const riotLabel = riotReady ? 'Firmado' : runtimeStatus?.riotClientFound ? 'Sin validar' : 'No encontrado';
    riot.textContent = riotLabel;
    riot.className = riotReady ? 'state-ok' : 'state-bad';
    const sessionLabel = runtimeStatus?.activeSession?.riotId || 'Sin sesión';
    session.textContent = sessionLabel;
    session.className = runtimeStatus?.activeSession ? 'state-warn' : 'state-ok';
    const runningGame = runtimeStatus?.runningGame || '';
    const runningGameLabel = runningGame === 'league_of_legends' ? 'LoL abierto' : runningGame === 'valorant' ? 'VALORANT abierto' : 'Cerrado';
    if (gameProcess) {
        gameProcess.textContent = runningGameLabel;
        gameProcess.className = runningGame ? 'state-warn' : 'state-ok';
    }
    const busy = activeRequestId || runtimeStatus?.activeRequestId;
    operation.textContent = busy ? 'En curso' : 'Disponible';
    operation.className = busy ? 'state-warn' : 'state-ok';
}

const GAME_LOGOS = {
    valorant: `<svg class="game-logo-svg" viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M38.8 84.7L0 23.5h22.6l27.5 43.6-11.3 17.6zm17.4-61.2L94.9 84.7H72.3L44.8 41.1l11.4-17.6z"/></svg>`,
    league_of_legends: `<svg class="game-logo-svg" viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M22 14h18v54h32v18H22V14zm58 10v40l-14-8V24h14z"/><path fill="currentColor" opacity="0.65" d="M66 24h14l-14 14V24z"/></svg>`,
    riot: `<svg class="game-logo-svg" viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M78.6 22.3l-18.7 7.1 5 10.9 15.1-5.8 7.5 5.8-7.9 17.9L21.4 79.9 11.2 57.8l51.7-19.6-3.3-7.5L8.1 49.7 3.1 30.5l57.5-21.7 7.5 5.8-7.9 17.5 15.1-5.8 6.3 8.8-7.5 17.5 7.5-2.9.8-2.5-8.3-32.4z"/></svg>`
};

const RANK_ICONS = {
    radiant: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 5.4 5.6.8-4 4 1 5.8-5-2.8-5 2.8 1-5.8-4-4 5.6-.8L12 2zm0 4.2L10.5 9l-3.5.5 2.5 2.5-.6 3.6 3.1-1.7 3.1 1.7-.6-3.6 2.5-2.5-3.5-.5L12 6.2z"/><circle cx="12" cy="11.5" r="1.8" fill="#fff"/></svg>`,
    immortal: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2L4 7v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7l-8-5zm0 3.2l5.5 3.5v4.5c0 3.6-2.4 7-5.5 8-3.1-1-5.5-4.4-5.5-8V8.7L12 5.2zm0 3l-3.5 3.5L12 16l3.5-4.3L12 8.2z"/></svg>`,
    ascendant: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2L2 9l3 11h14l3-11-10-7zm0 3.8l6.5 4.6-2 7.6H7.5l-2-7.6L12 5.8zm0 3.4l-3 4.2h6l-3-4.2z"/></svg>`,
    diamond: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3h12l4 6-10 12L2 9l4-6zm1.5 2l-2.7 4h14.4l-2.7-4H7.5zm-3.2 6l7.7 9.2 7.7-9.2H4.3z"/></svg>`,
    emerald: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l8 5v10l-8 5-8-5V7l8-5zm0 3.2L6 8.5v7l6 3.8 6-3.8v-7L12 5.2z"/><path fill="currentColor" opacity="0.7" d="M12 7l4 2.8v4.4L12 17l-4-2.8V9.8L12 7z"/></svg>`,
    platinum: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l7 7-7 13L5 9l7-7zm0 4.2L8.2 9.5 12 17l3.8-7.5L12 6.2z"/></svg>`,
    gold: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2L4 6v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V6l-8-4zm0 3.2l5.5 2.8v4.2c0 3.6-2.4 7-5.5 8-3.1-1-5.5-4.4-5.5-8V8l5.5-2.8zm0 3.8l-3 3h6l-3-3z"/></svg>`,
    silver: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3L5 7v6c0 4.5 3 8.7 7 10 4-1.3 7-5.5 7-10V7l-7-4zm0 3.3L16.5 9v4.2c0 2.8-1.9 5.5-4.5 6.4-2.6-.9-4.5-3.6-4.5-6.4V9L12 6.3z"/></svg>`,
    bronze: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3l-6 4v5c0 4 2.5 7.8 6 9 3.5-1.2 6-5 6-9V7l-6-4zm0 3.5l4 2.7v3.5c0 2.3-1.4 4.5-4 5.3-2.6-.8-4-3-4-5.3V9.2l4-2.7z"/></svg>`,
    iron: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h12l2 4v8l-2 4H6l-2-4V8l2-4zm1.5 2.5L6 8.5v7l1.5 2h9l1.5-2v-7l-1.5-2h-9z"/></svg>`,
    unranked: `<svg class="rank-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`
};

function getGameLogoSvg(game) {
    return GAME_LOGOS[game] || GAME_LOGOS.valorant;
}

function getRankIconSvg(rank) {
    const cls = getRankClass(rank).replace('rank-', '');
    return RANK_ICONS[cls] || RANK_ICONS.unranked;
}

function renderActivity() {
    const list = $('activityList');
    if (!list) return;
    list.textContent = '';
    if (!activity.length) {
        const empty = document.createElement('p');
        empty.className = 'no-activity';
        empty.textContent = 'Aún no hay sesiones confirmadas.';
        list.append(empty);
        return;
    }
    for (const entry of activity.slice(0, 8)) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        const icon = document.createElement('span');
        icon.className = `activity-icon game-${entry.game}`;
        icon.innerHTML = getGameLogoSvg(entry.game);
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = entry.text || 'Sesión confirmada';
        const time = document.createElement('time');
        time.dateTime = new Date((entry.occurredAt || 0) * 1000).toISOString();
        time.textContent = formatRelative(entry.occurredAt);
        copy.append(title, time);
        item.append(icon, copy);
        list.append(item);
    }
}

function iconSvg(kind) {
    const paths = {
        star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
        edit: '<path d="m4 16.5-.5 4 4-.5L19 8.5 15.5 5 4 16.5ZM17 3.5 20.5 7l1-1a1.4 1.4 0 0 0 0-2l-1.5-1.5a1.4 1.4 0 0 0-2 0l-1 1Z"/>',
        trash: '<path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm-2 6h12l-1 11H7L6 10Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind]}</svg>`;
}

function getRankClass(rank) {
    if (!rank) return 'rank-unranked';
    const r = rank.toLowerCase();
    if (r.includes('radiante') || r.includes('challenger')) return 'rank-radiant';
    if (r.includes('inmortal') || r.includes('gran máster') || r.includes('grandmaster')) return 'rank-immortal';
    if (r.includes('ascendente') || r.includes('máster') || r.includes('master')) return 'rank-ascendant';
    if (r.includes('diamante')) return 'rank-diamond';
    if (r.includes('esmeralda')) return 'rank-emerald';
    if (r.includes('platino')) return 'rank-platinum';
    if (r.includes('oro')) return 'rank-gold';
    if (r.includes('plata')) return 'rank-silver';
    if (r.includes('bronce')) return 'rank-bronze';
    if (r.includes('hierro')) return 'rank-iron';
    return 'rank-unranked';
}

function getRankAsset(game, rank) {
    if (!rank || rank.toLowerCase().includes('sin rango') || rank.toLowerCase().includes('unranked')) {
        return 'assets/ranks/unranked.svg';
    }
    const r = rank.toLowerCase();
    if (game === 'league_of_legends') {
        if (r.includes('challenger')) return 'assets/ranks/lol/challenger.png';
        if (r.includes('gran máster') || r.includes('grandmaster') || r.includes('gran master')) return 'assets/ranks/lol/grandmaster.png';
        if (r.includes('máster') || r.includes('master')) return 'assets/ranks/lol/master.png';
        if (r.includes('diamante') || r.includes('diamond')) return 'assets/ranks/lol/diamond.png';
        if (r.includes('esmeralda') || r.includes('emerald')) return 'assets/ranks/lol/emerald.png';
        if (r.includes('platino') || r.includes('platinum')) return 'assets/ranks/lol/platinum.png';
        if (r.includes('oro') || r.includes('gold')) return 'assets/ranks/lol/gold.png';
        if (r.includes('plata') || r.includes('silver')) return 'assets/ranks/lol/silver.png';
        if (r.includes('bronce') || r.includes('bronze')) return 'assets/ranks/lol/bronze.png';
        if (r.includes('hierro') || r.includes('iron')) return 'assets/ranks/lol/iron.png';
        return 'assets/ranks/unranked.svg';
    }

    let tierNum = '1';
    if (r.includes('3')) tierNum = '3';
    else if (r.includes('2')) tierNum = '2';

    if (r.includes('radiante') || r.includes('radiant')) return 'assets/ranks/valorant/radiant.svg';
    if (r.includes('inmortal') || r.includes('immortal')) return `assets/ranks/valorant/immortal${tierNum}.svg`;
    if (r.includes('ascendente') || r.includes('ascendant')) return `assets/ranks/valorant/ascendant${tierNum}.svg`;
    if (r.includes('diamante') || r.includes('diamond')) return `assets/ranks/valorant/diamond${tierNum}.svg`;
    if (r.includes('platino') || r.includes('platinum')) return `assets/ranks/valorant/platinum${tierNum}.svg`;
    if (r.includes('oro') || r.includes('gold')) return `assets/ranks/valorant/gold${tierNum}.svg`;
    if (r.includes('plata') || r.includes('silver')) return `assets/ranks/valorant/silver${tierNum}.svg`;
    if (r.includes('bronce') || r.includes('bronze')) return `assets/ranks/valorant/bronze${tierNum}.svg`;
    if (r.includes('hierro') || r.includes('iron')) return `assets/ranks/valorant/iron${tierNum}.svg`;

    return 'assets/ranks/unranked.svg';
}

function getAvatarKey(account) {
    if (account.avatarAgent) return account.avatarAgent.toLowerCase();
    return account.game === 'league_of_legends' ? 'ahri' : 'jett';
}

function renderAccounts() {
    const query = elements.searchInput.value.trim().toLowerCase();
    const profileAccounts = accounts.filter((account) => (account.profileId || 'default') === activeProfileId);
    const counts = {
        valorant: profileAccounts.filter((account) => account.game === 'valorant').length,
        league_of_legends: profileAccounts.filter((account) => account.game === 'league_of_legends').length
    };
    $('countAll').textContent = profileAccounts.length;
    $('countVal').textContent = counts.valorant;
    $('countLol').textContent = counts.league_of_legends;

    elements.gameTabs.querySelectorAll('.game-tab').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.game === currentFilter));
    });

    const filtered = profileAccounts.filter((account) => {
        if (currentFilter !== 'all' && account.game !== currentFilter) return false;
        if (!query) return true;
        return [account.displayName, account.username, account.riotId, account.region, account.rank, account.notes].some((value) => String(value || '').toLowerCase().includes(query));
    }).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));

    elements.accountsList.textContent = '';
    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = profileAccounts.length
            ? '<div class="empty-copy"><span class="eyebrow">SIN RESULTADOS</span><strong>Sin coincidencias</strong><p>Ajusta el filtro o la búsqueda para encontrar otra cuenta.</p><button class="btn secondary empty-clear" type="button">Limpiar filtros</button></div>'
            : '<div class="empty-copy"><div class="empty-glyph" aria-hidden="true">+</div><span class="eyebrow">PERFIL ACTUAL</span><strong>Bóveda lista en este perfil</strong><p>Registra cuentas para este perfil o cambia a otro perfil en la barra superior.</p><button class="btn primary empty-add" type="button">+ Añadir cuenta al perfil</button></div>';
        elements.accountsList.append(empty);
        empty.querySelector('.empty-add')?.addEventListener('click', () => openAccountModal());
        empty.querySelector('.empty-clear')?.addEventListener('click', () => {
            elements.searchInput.value = '';
            currentFilter = 'all';
            renderAccounts();
            elements.searchInput.focus();
        });
        return;
    }

    for (const account of filtered) {
        const card = document.createElement('article');
        const isCurrent = Boolean(runtimeStatus?.activeSession?.riotId && account.riotId && runtimeStatus.activeSession.riotId.toLowerCase() === account.riotId.toLowerCase());
        card.className = `account-card game-${account.game}${isCurrent ? ' is-current' : ''}`;
        card.setAttribute('aria-label', `${account.displayName}, ${GAME_LABELS[account.game] || 'Riot'}`);
        const gameLabel = account.game === 'league_of_legends' ? 'LEAGUE OF LEGENDS' : 'VALORANT';
        const defaultGame = account.game === 'league_of_legends' ? 'league_of_legends' : 'valorant';
        const defaultPlayLabel = account.game === 'league_of_legends' ? 'Jugar LoL' : 'Jugar Valorant';
        const avatarKey = getAvatarKey(account);
        const avatarInitials = (account.avatarAgent || (account.game === 'league_of_legends' ? 'LoL' : 'Val')).slice(0, 2).toUpperCase();
        const avatarContent = account.customAvatar
            ? `<img class="custom-avatar-img" src="${escapeHtml(account.customAvatar)}" alt="${escapeHtml(account.displayName)}">`
            : `<span>${avatarInitials}</span>`;
        card.innerHTML = `
            <div class="account-main">
                <div class="account-avatar avatar-${escapeHtml(avatarKey)}" title="${escapeHtml(account.avatarAgent || (account.game === 'league_of_legends' ? 'LoL' : 'Valorant'))}">
                    ${avatarContent}
                </div>
                <div class="account-copy">
                    <div class="account-topline">
                        <h3>${escapeHtml(account.displayName)} ${account.isFavorite ? '<span class="favorite-mark" aria-label="Favorita">◆</span>' : ''}</h3>
                        <span class="game-badge">${getGameLogoSvg(account.game)} ${gameLabel}</span>
                        ${isCurrent ? '<span class="current-badge">ACTIVA</span>' : ''}
                    </div>
                    <span class="account-id">${escapeHtml(account.riotId || 'Riot ID sin configurar')}</span>
                    <div class="meta-row">
                        <span class="meta-chip meta-region">${escapeHtml(account.region)}</span>
                        <span class="meta-chip meta-rank ${getRankClass(account.rank)}"><img class="rank-img" src="${escapeHtml(getRankAsset(account.game, account.rank))}" alt="" aria-hidden="true" /><span>${escapeHtml(account.rank || 'Sin rango')}</span></span>
                        <span class="meta-chip meta-time">${escapeHtml(formatRelative(account.lastUsedAt))}</span>
                        ${account.level ? `<span class="meta-chip meta-level">Nvl. ${escapeHtml(account.level)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="account-actions">
                <button class="card-action favorite ${account.isFavorite ? 'active' : ''}" type="button" aria-label="${account.isFavorite ? 'Quitar de favoritas' : 'Marcar favorita'}" title="${account.isFavorite ? 'Quitar de favoritas' : 'Marcar favorita'}">${iconSvg('star')}</button>
                <button class="card-action edit" type="button" aria-label="Editar cuenta" title="Editar cuenta">${iconSvg('edit')}</button>
                <button class="card-action delete" type="button" aria-label="Eliminar cuenta" title="Eliminar cuenta">${iconSvg('trash')}</button>
                <div class="play-group">
                    <button class="play-btn" type="button">
                        ${getGameLogoSvg(defaultGame)} <span>${defaultPlayLabel}</span>
                    </button>
                    <button class="play-btn-drop" type="button" aria-label="Más opciones de juego" title="Opciones de inicio">
                        <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M4 6l4 4 4-4z"/></svg>
                    </button>
                    <div class="play-menu hidden">
                        <button class="play-menu-item opt-val" type="button">${getGameLogoSvg('valorant')} <span>Jugar Valorant</span></button>
                        <button class="play-menu-item opt-lol" type="button">${getGameLogoSvg('league_of_legends')} <span>Jugar League of Legends</span></button>
                        <button class="play-menu-item opt-riot" type="button">${getGameLogoSvg('riot')} <span>Solo abrir Riot Client</span></button>
                    </div>
                </div>
            </div>`;
        card.querySelector('.favorite').addEventListener('click', () => toggleFavorite(account));
        card.querySelector('.edit').addEventListener('click', () => openAccountModal(account));
        card.querySelector('.delete').addEventListener('click', () => deleteAccount(account));
        card.querySelector('.play-btn').addEventListener('click', () => beginSwitch(account, account.game || 'valorant'));
        
        const dropBtn = card.querySelector('.play-btn-drop');
        const playMenu = card.querySelector('.play-menu');
        dropBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const wasHidden = playMenu.classList.contains('hidden');
            document.querySelectorAll('.play-menu').forEach((menu) => menu.classList.add('hidden'));
            if (wasHidden) playMenu.classList.remove('hidden');
        });
        card.querySelector('.opt-val').addEventListener('click', (event) => {
            event.stopPropagation();
            playMenu.classList.add('hidden');
            beginSwitch(account, 'valorant');
        });
        card.querySelector('.opt-lol').addEventListener('click', (event) => {
            event.stopPropagation();
            playMenu.classList.add('hidden');
            beginSwitch(account, 'league_of_legends');
        });
        card.querySelector('.opt-riot').addEventListener('click', (event) => {
            event.stopPropagation();
            playMenu.classList.add('hidden');
            beginSwitch(account, 'none');
        });
        elements.accountsList.append(card);
    }
    setSwitchControlsDisabled(Boolean(activeRequestId));
}

function setSwitchControlsDisabled(disabled) {
    document.querySelectorAll('.play-btn, .play-btn-drop, .play-menu-item, .account-card .edit, .account-card .delete, #btnAdd, #btnManageAccounts').forEach((button) => { button.disabled = disabled; });
}

function setActiveNav(tabName) {
    elements.navTabs.querySelectorAll('.nav-tab').forEach((item) => {
        const active = item.dataset.tab === tabName;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
}

function setView(view, focusSearch = false) {
    currentView = 'accounts';
    document.body.dataset.view = 'accounts';
    setActiveNav('accounts');
    if (focusSearch) requestAnimationFrame(() => elements.searchInput.focus());
    renderAccounts();
}

function openAccountModal(account = null) {
    $('accountForm').reset();
    $('accId').value = account?.id || '';
    $('accDisplayName').value = account?.displayName || '';
    $('accGame').value = account?.game || 'valorant';
    $('accRegion').value = account?.region || 'EU';
    $('accUsername').value = account?.username || '';
    $('accRiotId').value = account?.riotId || '';
    $('accLevel').value = account?.level || '';
    $('accNotes').value = account?.notes || '';
    $('accPassword').value = '';
    $('accPassword').required = !account;
    $('accPassword').placeholder = account ? 'Dejar en blanco para conservar' : 'Protegida con DPAPI';
    $('modalTitle').textContent = account ? 'Editar cuenta' : 'Añadir cuenta';
    const banner = $('autofillBanner');
    if (banner) banner.style.display = account ? 'none' : 'flex';

    // Populate profile selector
    const profileSelect = $('accProfile');
    if (profileSelect) {
        profileSelect.textContent = '';
        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            profileSelect.append(opt);
        }
        profileSelect.value = account?.profileId || activeProfileId || 'default';
    }

    // Custom avatar preview
    const customAvatar = account?.customAvatar || '';
    $('accCustomAvatar').value = customAvatar;
    if (customAvatar) {
        $('avatarPreviewImg').src = customAvatar;
        $('avatarPreviewImg').classList.remove('hidden');
        $('avatarPreviewFallback').classList.add('hidden');
        $('btnRemoveCustomAvatar').classList.remove('hidden');
    } else {
        $('avatarPreviewImg').src = '';
        $('avatarPreviewImg').classList.add('hidden');
        $('avatarPreviewFallback').classList.remove('hidden');
        $('btnRemoveCustomAvatar').classList.add('hidden');
    }

    updateGameFields($('accGame').value, account?.rank, account?.avatarAgent);
    showModal(elements.accountModal);
}

async function saveAccount(event) {
    event.preventDefault();
    if (!rendererApi) return showToast('Vista previa: almacenamiento no disponible.');
    const submit = event.submitter;
    submit.disabled = true;
    try {
        accounts = await rendererApi.saveAccount({
            id: $('accId').value || undefined,
            profileId: $('accProfile')?.value || activeProfileId || 'default',
            displayName: $('accDisplayName').value,
            game: $('accGame').value,
            region: $('accRegion').value,
            username: $('accUsername').value,
            password: $('accPassword').value,
            riotId: $('accRiotId').value,
            rank: $('accRank').value,
            level: $('accLevel').value,
            avatarAgent: $('accAvatar').value,
            customAvatar: $('accCustomAvatar').value || '',
            notes: $('accNotes').value
        });
        hideModal(elements.accountModal);
        renderAccounts();
        renderProfiles();
        showToast('Cuenta guardada y cifrada.', 'success');
        playSound('success');
    } catch (error) {
        showToast(error.message || 'No se pudo guardar la cuenta.', 'error');
        playSound('error');
    } finally { submit.disabled = false; }
}

async function toggleFavorite(account) {
    if (!rendererApi) return;
    accounts = await rendererApi.toggleFavorite(account.id, !account.isFavorite);
    renderAccounts();
}

async function deleteAccount(account) {
    const accepted = await confirmAction('Eliminar cuenta', `Se eliminará “${account.displayName}” de este equipo. Esta acción no afecta a la cuenta de Riot.`, 'Eliminar');
    if (!accepted || !rendererApi) return;
    try {
        accounts = await rendererApi.deleteAccount(account.id);
        renderAccounts();
        showToast('Cuenta eliminada del equipo.');
    } catch (error) { showToast(error.message || 'No se pudo eliminar.', 'error'); }
}

async function beginSwitch(account, targetGame = null) {
    if (!rendererApi || activeRequestId) return;
    lastSwitchAccount = account;
    const gameToLaunch = targetGame === 'none' ? 'none' : (targetGame || account.game || 'valorant');
    const targetLabel = gameToLaunch === 'none'
        ? 'Riot Client (sin abrir juego)'
        : (gameToLaunch === 'league_of_legends' ? 'League of Legends' : 'VALORANT');
    if (settings?.confirmSwitch) {
        const accepted = await confirmAction('Cambiar cuenta', `Riot Client se cerrará para iniciar “${account.displayName}” y abrir ${targetLabel}.`, 'Iniciar cambio');
        if (!accepted) return;
    }
    try {
        const result = await rendererApi.startPlay(account.id, gameToLaunch);
        if (!result.accepted) return showToast('Ya hay un cambio de cuenta en curso.', 'error');
        activeRequestId = result.requestId;
        showSwitchOverlay(gameToLaunch, account);
        setSwitchControlsDisabled(true);
        renderRuntime();
    } catch (error) {
        showToast(error.message || 'No se pudo iniciar el cambio.', 'error');
        playSound('error');
    }
}

function resetSwitchActions() {
    ['btnRetrySwitch', 'btnOpenRiot', 'btnManualLogout', 'btnCloseSwitch', 'btnForceCloseGame', 'btnCancelSwitch'].forEach((id) => $(id).classList.add('hidden'));
}

function showSwitchOverlay(game, account = null) {
    switchPreviousFocus = document.activeElement;
    $('switchGame').textContent = GAME_LABELS[game] || 'RIOT SESSION';
    document.querySelector('.switch-radar').innerHTML = getGameLogoSvg(game);
    $('switchTarget').textContent = account?.displayName ? `Destino · ${account.displayName}` : 'Cuenta destino';
    $('switchSource').textContent = runtimeStatus?.activeSession?.riotId || 'Sin sesión';
    $('switchDestination').textContent = account?.displayName || 'Cuenta destino';
    $('switchTitle').textContent = 'Preparando operación';
    $('switchMessage').textContent = 'Comprobando el sistema…';
    $('switchProgress').className = 'progress-5';
    resetSwitchActions();
    document.querySelector('.switch-panel').classList.remove('error', 'manual', 'waiting', 'done');
    document.querySelectorAll('.switch-steps li').forEach((step) => step.classList.remove('active', 'complete'));
    elements.switchOverlay.classList.add('active');
    elements.switchOverlay.setAttribute('aria-hidden', 'false');
}

function closeSwitchOverlay() {
    elements.switchOverlay.classList.remove('active');
    elements.switchOverlay.setAttribute('aria-hidden', 'true');
    if (switchPreviousFocus instanceof HTMLElement) switchPreviousFocus.focus();
    switchPreviousFocus = null;
}

function updateSwitchState(payload) {
    if (activeRequestId && payload.requestId !== activeRequestId) return;
    activeRequestId ||= payload.requestId;
    const state = payload.state;
    const stageIndex = SWITCH_STAGES.indexOf(state);
    const progress = TERMINAL_SWITCH_STATES.has(state) ? 100 : [8, 18, 24, 34, 44, 54, 66, 78, 88, 94][Math.max(0, stageIndex)] || 8;
    const titleByState = {
        Done: 'Operación completada',
        WrongPassword: 'Contraseña incorrecta',
        ManualActionRequired: 'Intervención manual',
        Timeout: 'Tiempo agotado',
        Error: 'Intervención necesaria',
        WaitingForAuthentication: 'Esperando autenticación',
        LoggingOut: 'Cerrando sesión anterior',
        LogoutConfirmed: 'Sesión anterior cerrada'
    };
    $('switchTitle').textContent = titleByState[state] || 'Cambio de cuenta en curso';
    $('switchMessage').textContent = payload.message;
    $('switchProgress').className = `progress-${progress}`;
    if (elements.statusText) elements.statusText.textContent = payload.message;
    if (elements.statusCode) elements.statusCode.textContent = payload.errorCode || state.toUpperCase();
    if (elements.statusBar) elements.statusBar.className = `status-bar ${['Error', 'WrongPassword', 'Timeout'].includes(state) ? 'error' : 'busy'}`;
    const panel = document.querySelector('.switch-panel');
    panel.classList.remove('waiting');
    document.querySelectorAll('.switch-steps li').forEach((step, index) => {
        const mappedIndex = SWITCH_STAGES.indexOf(step.dataset.state);
        step.classList.toggle('complete', stageIndex > mappedIndex || state === 'Done');
        step.classList.toggle('active', mappedIndex === stageIndex);
    });

    if (TERMINAL_SWITCH_STATES.has(state)) {
        panel.classList.remove('error', 'manual', 'waiting', 'done');
        panel.classList.add(state === 'Done' ? 'done' : ['ManualActionRequired', 'Timeout'].includes(state) ? 'manual' : 'error');
        $('btnCloseSwitch').classList.remove('hidden');
        } else if (state === 'WaitingForAuthentication') {
            $('btnCancelSwitch').classList.remove('hidden');
        if (state === 'WrongPassword' || state === 'Timeout' || state === 'Error') $('btnRetrySwitch').classList.remove('hidden');
        if (payload.errorCode === 'GAME_RUNNING') {
            $('btnForceCloseGame').classList.remove('hidden');
        }
        if (state === 'ManualActionRequired' || state === 'Timeout') {
            $('btnOpenRiot').classList.remove('hidden');
            $('btnManualLogout').classList.remove('hidden');
        }
        requestAnimationFrame(() => document.querySelector('#switchOverlay button:not(.hidden):not(:disabled)')?.focus());
        activeRequestId = null;
        setSwitchControlsDisabled(false);
        renderRuntime();
        refreshAfterSwitch();
        playSound(state === 'Done' ? 'success' : 'error');
        if (state === 'Done') setTimeout(closeSwitchOverlay, 1800);
    } else if (state === 'WaitingForAuthentication' || state === 'LoggingOut') {
        document.querySelector('.switch-panel').classList.add('waiting');
    }
}

async function refreshAfterSwitch() {
    if (!rendererApi) return;
    [accounts, activity, runtimeStatus] = await Promise.all([rendererApi.getAccounts(), rendererApi.getActivityLog(), rendererApi.getRuntimeStatus()]);
    renderAccounts();
    renderActivity();
    renderRuntime();
}

async function refreshRuntimeStatus() {
    if (!rendererApi || activeRequestId) return;
    try {
        const prevSessionId = runtimeStatus?.activeSession?.riotId || '';
        const prevGame = runtimeStatus?.runningGame || '';
        runtimeStatus = await rendererApi.getRuntimeStatus();
        renderRuntime();
        const nextSessionId = runtimeStatus?.activeSession?.riotId || '';
        const nextGame = runtimeStatus?.runningGame || '';
        if (prevSessionId !== nextSessionId || prevGame !== nextGame) {
            renderAccounts();
        }
    } catch {}
}

async function openSettings() {
    if (!rendererApi) {
        settings ||= { startWithWindows: false, minimizeToTray: true, closeOnLaunch: false, confirmSwitch: true, autoLaunchGame: true, autoCloseRunningGames: true, autoSyncRank: true, globalShortcut: 'Alt+R', soundEnabled: true, reducedMotion: false, initialDelayMs: 1800, charDelayMs: 15, fieldDelayMs: 200, customRiotPath: '' };
        $('setStartWithWindows').checked = settings.startWithWindows;
        $('setMinimizeToTray').checked = settings.minimizeToTray;
        $('setCloseOnLaunch').checked = settings.closeOnLaunch;
        $('setConfirmSwitch').checked = settings.confirmSwitch;
        $('setAutoLaunchGame').checked = settings.autoLaunchGame;
        $('setAutoCloseRunningGames').checked = settings.autoCloseRunningGames !== false;
        $('setAutoSyncRank').checked = settings.autoSyncRank !== false;
        if($('btnGlobalShortcut')) { $('btnGlobalShortcut').innerHTML = formatShortcut(settings.globalShortcut || 'Alt+R'); }
        $('setSoundEnabled').checked = settings.soundEnabled;
        $('setReducedMotion').checked = settings.reducedMotion;
        $('setInitialDelay').value = settings.initialDelayMs;
        $('setCharDelay').value = settings.charDelayMs;
        $('setFieldDelay').value = settings.fieldDelayMs;
        $('setCustomRiotPath').value = settings.customRiotPath;
        showModal(elements.settingsModal);
        return;
    }
    try {
        settings = await rendererApi.getSettings();
        if (rendererApi.getAppVersion) {
            rendererApi.getAppVersion().then((v) => { if (v) $('appVersionLabel').textContent = v; }).catch(() => {});
        }
        $('setStartWithWindows').checked = settings.startWithWindows;
        $('setMinimizeToTray').checked = settings.minimizeToTray;
        $('setCloseOnLaunch').checked = settings.closeOnLaunch;
        $('setConfirmSwitch').checked = settings.confirmSwitch;
        $('setAutoLaunchGame').checked = settings.autoLaunchGame;
        $('setAutoCloseRunningGames').checked = settings.autoCloseRunningGames !== false;
        $('setAutoSyncRank').checked = settings.autoSyncRank !== false;
        if($('btnGlobalShortcut')) { $('btnGlobalShortcut').innerHTML = formatShortcut(settings.globalShortcut || 'Alt+R'); }
        $('setSoundEnabled').checked = settings.soundEnabled;
        $('setReducedMotion').checked = settings.reducedMotion;
        $('setInitialDelay').value = settings.initialDelayMs;
        $('setCharDelay').value = settings.charDelayMs;
        $('setFieldDelay').value = settings.fieldDelayMs;
        $('setCustomRiotPath').value = settings.customRiotPath || '';
        $('testRiotStatus').textContent = '';
        showModal(elements.settingsModal);
    } catch (error) { showToast(error.message || 'No se pudieron cargar los ajustes.', 'error'); }
}

async function checkForUpdates() {
    if (!rendererApi?.checkForUpdates) return;
    $('btnCheckUpdates').disabled = true;
    $('updateStatusText').textContent = 'Buscando actualizaciones…';
    try {
        const res = await rendererApi.checkForUpdates();
        if (res.status === 'dev-mode') {
            $('updateStatusText').textContent = res.message || 'Modo desarrollo (sin actualizaciones empaquetadas).';
        } else if (res.status === 'error') {
            $('updateStatusText').textContent = res.message || 'Error al buscar actualizaciones.';
        }
    } catch (err) {
        $('updateStatusText').textContent = err.message || 'Error al buscar actualizaciones.';
    } finally {
        $('btnCheckUpdates').disabled = false;
    }
}

async function installUpdate() {
    if (!rendererApi?.installUpdate) return;
    $('btnInstallUpdate').disabled = true;
    $('updateStatusText').textContent = 'Reiniciando para instalar la actualización…';
    await rendererApi.installUpdate();
}

async function saveSettings(event) {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
        settings = await rendererApi.saveSettings({
            startWithWindows: $('setStartWithWindows').checked,
            minimizeToTray: $('setMinimizeToTray').checked,
            closeOnLaunch: $('setCloseOnLaunch').checked,
            confirmSwitch: $('setConfirmSwitch').checked,
            autoLaunchGame: $('setAutoLaunchGame').checked,
            autoCloseRunningGames: $('setAutoCloseRunningGames').checked,
            autoSyncRank: $('setAutoSyncRank').checked,
            globalShortcut: settings.globalShortcut,
            soundEnabled: $('setSoundEnabled').checked,
            reducedMotion: $('setReducedMotion').checked,
            initialDelayMs: $('setInitialDelay').value,
            charDelayMs: $('setCharDelay').value,
            fieldDelayMs: $('setFieldDelay').value,
            customRiotPath: $('setCustomRiotPath').value
        });
        applyMotionPreference();
        hideModal(elements.settingsModal);
        showToast('Ajustes guardados.', 'success');
    } catch (error) { showToast(error.message || 'No se pudieron guardar los ajustes.', 'error'); }
    finally { submit.disabled = false; }
}

async function testRiotClient() {
    if (!rendererApi) return showToast('La comprobación requiere la aplicación de escritorio.');
    $('testRiotStatus').textContent = 'Comprobando…';
    const result = await rendererApi.testRiotPath();
    $('testRiotStatus').textContent = result.found
        ? `✓ Cliente firmado${result.activeSession ? ` · Sesión ${result.activeSession.riotId}` : ' · Sin sesión'}`
        : `✕ ${result.error || 'No encontrado'}`;
    $('testRiotStatus').className = result.found ? 'state-ok' : 'state-bad';
}

async function autofillSessionFromRiot() {
    if (!rendererApi || activeRequestId) return;
    const btn = $('btnAutofillSession');
    if (btn) btn.disabled = true;
    try {
        showToast('Consultando sesión activa de Riot…');
        const info = await rendererApi.importActiveSession();
        if (!info?.isValid) {
            return showToast('No se detectó ninguna sesión activa en Riot Client.', 'error');
        }
        if (info.displayName) $('accDisplayName').value = info.displayName;
        if (info.riotId) $('accRiotId').value = info.riotId;
        if (info.region) $('accRegion').value = info.region;
        if (info.game) {
            $('accGame').value = info.game;
            updateGameFields(info.game, info.rank);
        } else if (info.rank) {
            $('accRank').value = info.rank;
        }
        if (info.level) $('accLevel').value = info.level;
        $('accUsername').focus();
        showToast('✓ Datos autocompletados. Escribe usuario y contraseña.', 'success');
    } catch (error) {
        showToast(error.message || 'No se pudo leer la sesión de Riot.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setupCustomAvatarUploader() {
    const btnUpload = $('btnUploadAvatar');
    const fileInput = $('inputCustomAvatar');
    const btnRemove = $('btnRemoveCustomAvatar');
    const previewImg = $('avatarPreviewImg');
    const fallbackText = $('avatarPreviewFallback');
    const hiddenInput = $('accCustomAvatar');

    btnUpload?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Por favor selecciona un archivo de imagen.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 128;
                let w = img.width;
                let h = img.height;
                if (w > h) {
                    if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
                } else {
                    if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/png');
                hiddenInput.value = dataUrl;
                previewImg.src = dataUrl;
                previewImg.classList.remove('hidden');
                fallbackText.classList.add('hidden');
                btnRemove.classList.remove('hidden');
                fileInput.value = '';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    btnRemove?.addEventListener('click', () => {
        hiddenInput.value = '';
        previewImg.src = '';
        previewImg.classList.add('hidden');
        fallbackText.classList.remove('hidden');
        btnRemove.classList.add('hidden');
        if (fileInput) fileInput.value = '';
    });
}

function bindEvents() {
    // Settings Tabs
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const tabPanels = document.querySelectorAll('.settings-panel');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    $('btnMinimize').addEventListener('click', () => rendererApi?.minimizeWindow());
    $('btnClose').addEventListener('click', () => rendererApi?.closeWindow());
    $('btnAdd').addEventListener('click', () => openAccountModal());
    $('btnAutofillSession').addEventListener('click', autofillSessionFromRiot);
    
    // Profile Dropdown & Pill
    $('userPill').addEventListener('click', (event) => {
        event.stopPropagation();
        const dropdown = $('profileDropdown');
        dropdown.classList.toggle('hidden');
        $('userPill').classList.toggle('active', !dropdown.classList.contains('hidden'));
    });
    $('btnManageProfiles')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openProfilesManager();
    });
    $('btnQuickCreateProfile')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openQuickCreateProfile();
    });
    $('btnCloseProfilesModal')?.addEventListener('click', () => hideModal(elements.profilesModal));
    $('btnCloseProfilesManager')?.addEventListener('click', () => hideModal(elements.profilesModal));
    $('createProfileForm')?.addEventListener('submit', createProfileFromBar);

    $('btnCloseAccountModal').addEventListener('click', () => hideModal(elements.accountModal));
    $('btnCancelAccount').addEventListener('click', () => hideModal(elements.accountModal));
    $('btnCloseSettingsModal').addEventListener('click', () => hideModal(elements.settingsModal));
    $('btnCancelSettings').addEventListener('click', () => hideModal(elements.settingsModal));
    $('btnCloseProfileModal').addEventListener('click', () => hideModal(elements.profileModal));
    $('btnConfirmCancel').addEventListener('click', () => settleConfirmation(false));
    $('btnConfirmAccept').addEventListener('click', () => settleConfirmation(true));
    $('btnCloseSwitch').addEventListener('click', closeSwitchOverlay);
    $('btnCancelSwitch').addEventListener('click', () => { rendererApi.cancelSwitch?.(); closeSwitchOverlay(); });
    $('btnRetrySwitch').addEventListener('click', () => {
        if (!lastSwitchAccount) return;
        closeSwitchOverlay();
        beginSwitch(lastSwitchAccount);
    });
    $('btnOpenRiot').addEventListener('click', async () => {
        if (!rendererApi) return showToast('La comprobación requiere la aplicación de escritorio.');
        try { await rendererApi.openRiotClient(); showToast('Riot Client abierto.'); }
        catch (error) { showToast(error.message || 'No se pudo abrir Riot Client.', 'error'); }
    });
    $('btnManualLogout').addEventListener('click', async () => {
        if (!rendererApi) return;
        try { await rendererApi.openRiotClient(); showToast('Cierra sesión en Riot Client y pulsa Reintentar.'); }
        catch (error) { showToast(error.message || 'No se pudo abrir Riot Client.', 'error'); }
    });
    $('btnForceCloseGame').addEventListener('click', async () => {
        $('btnForceCloseGame').disabled = true;
        showToast('Cerrando procesos de juego…');
        try {
            await rendererApi.forceCloseGames();
            showToast('Juegos cerrados. Reanudando cambio…');
            if (lastSwitchAccount) {
                beginSwitch(lastSwitchAccount);
            }
        } catch (error) {
            showToast(error.message || 'Error al cerrar el juego.', 'error');
        } finally {
            $('btnForceCloseGame').disabled = false;
        }
    });

    $('btnManageAccounts')?.addEventListener('click', () => {
        showToast('Gestión de cuentas (copiar a perfiles) llegará en la próxima versión.', 'info');
        playSound();
    });

    if (rendererApi?.onGlobalShortcut) {
        rendererApi.onGlobalShortcut(() => {
            elements.searchInput.focus();
            elements.searchInput.select();
            showToast('Búsqueda rápida activada.');
        });
    }

    if (rendererApi?.onAccountsUpdated) {
        rendererApi.onAccountsUpdated((updatedAccounts) => {
            if (Array.isArray(updatedAccounts)) {
                accounts = updatedAccounts;
                renderAccounts();
                renderProfiles();
            }
        });
    }

    if (rendererApi?.onProfilesUpdated) {
        rendererApi.onProfilesUpdated((profData) => {
            if (profData?.profiles) {
                profiles = profData.profiles;
                activeProfileId = profData.activeProfileId || activeProfileId;
                renderProfiles();
                renderAccounts();
            }
        });
    }

    setupCustomAvatarUploader();

    $('accountForm').addEventListener('submit', saveAccount);
    $('settingsForm').addEventListener('submit', saveSettings);
    $('profileForm').addEventListener('submit', saveProfile);
    $('btnTestRiot').addEventListener('click', testRiotClient);
    $('btnCheckUpdates').addEventListener('click', checkForUpdates);
    $('btnInstallUpdate').addEventListener('click', installUpdate);
    $('accGame').addEventListener('change', () => updateGameFields($('accGame').value));
    $('btnTogglePass').addEventListener('click', () => {
        const input = $('accPassword');
        input.type = input.type === 'password' ? 'text' : 'password';
        $('btnTogglePass').setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });

    elements.searchInput.addEventListener('input', renderAccounts);
    elements.gameTabs.addEventListener('click', (event) => {
        const button = event.target.closest('.game-tab');
        if (!button) return;
        currentFilter = button.dataset.game;
        elements.gameTabs.querySelectorAll('.game-tab').forEach((item) => item.classList.toggle('active', item === button));
        renderAccounts();
    });
    elements.navTabs.addEventListener('click', (event) => {
        const button = event.target.closest('.nav-tab');
        if (!button) return;
        if (button.dataset.tab === 'settings') {
            setActiveNav('settings');
            return openSettings();
        }
        setView(button.dataset.tab, button.dataset.tab === 'accounts');
    });
    $('btnCloseThemesModal')?.addEventListener('click', () => hideModal(elements.themesModal));
    $('btnCloseThemesModalBtn')?.addEventListener('click', () => hideModal(elements.themesModal));

    $('modalStyleCards')?.addEventListener('click', (event) => {
        const button = event.target.closest('.style-card');
        if (!button) return;
        applyStyle(button.dataset.style);
        playSound();
    });

    $('modalColorSwatches')?.addEventListener('click', (event) => {
        const button = event.target.closest('.color-swatch');
        if (!button) return;
        applyColor(button.dataset.color || button.dataset.theme);
        playSound();
    });

    $('settingsStyleCards')?.addEventListener('click', (event) => {
        const button = event.target.closest('.style-card');
        if (!button) return;
        applyStyle(button.dataset.style);
        playSound();
    });

    $('settingsColorSwatches')?.addEventListener('click', (event) => {
        const button = event.target.closest('.color-swatch');
        if (!button) return;
        applyColor(button.dataset.color || button.dataset.theme);
        playSound();
    });



    $('btnDismissBanner').addEventListener('click', () => $('updateBanner').classList.add('hidden'));
    $('btnBannerUpdate').addEventListener('click', () => {
        if (!$('btnInstallUpdate').classList.contains('hidden')) {
            installUpdate();
        } else {
            openSettings();
        }
    });

    document.addEventListener('keydown', (event) => {
        trapModalFocus(event);
        if (event.key === 'Escape') {
            if (openModal === elements.confirmModal) settleConfirmation(false);
            else if (openModal) hideModal(openModal);
            else if (elements.switchOverlay.classList.contains('active')) closeSwitchOverlay();
            else {
                $('profileDropdown')?.classList.add('hidden');
                $('userPill')?.classList.remove('active');
            }
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            if (!openModal) {
                event.preventDefault();
                elements.searchInput.focus();
                elements.searchInput.select();
            }
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
            if (!openModal) {
                event.preventDefault();
                openAccountModal();
            }
        } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
            if (!openModal) {
                event.preventDefault();
                openSettings();
            }
        } else if (event.key === '/' && document.activeElement !== elements.searchInput && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            if (!openModal) {
                event.preventDefault();
                elements.searchInput.focus();
                elements.searchInput.select();
            }
        }
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.play-group')) {
            document.querySelectorAll('.play-menu').forEach((menu) => menu.classList.add('hidden'));
        }
        if (!event.target.closest('.profile-select-wrap')) {
            $('profileDropdown')?.classList.add('hidden');
            $('userPill')?.classList.remove('active');
        }
    });
    window.addEventListener('mousemove', (event) => {
        pendingMousePos.x = event.clientX;
        pendingMousePos.y = event.clientY;
    }, { passive: true });
    window.addEventListener('mouseleave', () => {
        pendingMousePos.x = -1000;
        pendingMousePos.y = -1000;
    }, { passive: true });
    window.addEventListener('blur', () => { isWindowActive = false; });
    window.addEventListener('focus', () => {
        isWindowActive = true;
        refreshRuntimeStatus();
    });
    window.addEventListener('resize', initCanvas);
}

async function initialize() {
    applyStyle(localStorage.getItem('style') || 'oled', false);
    applyColor(localStorage.getItem('color') || localStorage.getItem('theme') || 'red', false);
    document.body.dataset.view = currentView;
    bindEvents();
    initCanvas();
    animateCanvas();

    if (!rendererApi) {
        settings = { soundEnabled: true, reducedMotion: false, confirmSwitch: true };
        runtimeStatus = { encryptionAvailable: true, riotClientFound: true, activeRequestId: null };
        renderProfiles(); renderRuntime(); renderActivity(); renderAccounts();
        if (elements.statusText) elements.statusText.textContent = 'Vista previa local';
        return;
    }

    try {
        const [accs, acts, profData, setts, runStatus] = await Promise.all([
            rendererApi.getAccounts(),
            rendererApi.getActivityLog(),
            rendererApi.getProfiles ? rendererApi.getProfiles() : rendererApi.getUserProfile(),
            rendererApi.getSettings(),
            rendererApi.getRuntimeStatus()
        ]);
        accounts = accs || [];
        activity = acts || [];
        if (profData && Array.isArray(profData.profiles)) {
            profiles = profData.profiles;
            activeProfileId = profData.activeProfileId || 'default';
        } else if (profData && profData.username) {
            profiles = [{ id: 'default', name: profData.username, createdAt: profData.createdAt || 0 }];
            activeProfileId = 'default';
        }
        settings = setts;
        runtimeStatus = runStatus;
        activeRequestId = runtimeStatus?.activeRequestId || null;
        renderProfiles();
        renderRuntime();
        renderActivity();
        renderAccounts();
        applyMotionPreference();
        setSwitchControlsDisabled(Boolean(activeRequestId));
        if (activeRequestId) showSwitchOverlay('valorant', accounts[0] || null);
        rendererApi.onSwitchState(updateSwitchState);
        setInterval(() => {
            if (isWindowActive && !document.hidden && !activeRequestId) {
                refreshRuntimeStatus();
            }
        }, 5000);
        if (rendererApi.onUpdateStatus) {
            rendererApi.onUpdateStatus((payload) => {
                if (!payload) return;
                if (payload.status === 'checking') {
                    $('updateStatusText').textContent = 'Buscando actualizaciones…';
                } else if (payload.status === 'available') {
                    $('updateStatusText').textContent = `Nueva versión ${payload.version ? `v${payload.version}` : ''} disponible. Descargando…`;
                    $('updateBannerTitle').textContent = 'Actualización disponible';
                    $('updateBannerMessage').textContent = payload.version ? `Descargando v${payload.version} en segundo plano…` : 'Descargando nueva versión en segundo plano…';
                    $('btnBannerUpdate').textContent = 'Descargando…';
                    $('btnBannerUpdate').disabled = true;
                    $('updateBanner').classList.remove('hidden');
                    $('settingsUpdateBadge').classList.remove('hidden');
                    showToast(`Nueva versión ${payload.version ? `v${payload.version}` : ''} disponible.`);
                } else if (payload.status === 'downloading') {
                    const pct = payload.percent || 0;
                    $('updateStatusText').textContent = `Descargando actualización: ${pct}%`;
                    $('updateBannerMessage').textContent = `Descargando: ${pct}%`;
                    $('btnBannerUpdate').textContent = `${pct}%`;
                } else if (payload.status === 'downloaded') {
                    $('updateStatusText').textContent = `Versión ${payload.version ? `v${payload.version}` : ''} lista para instalar.`;
                    $('btnInstallUpdate').classList.remove('hidden');
                    $('updateBannerTitle').textContent = '¡Actualización lista!';
                    $('updateBannerMessage').textContent = payload.version ? `La versión v${payload.version} está lista. Reinicia para aplicarla.` : 'Reinicia RemSwitcher para aplicar los cambios.';
                    $('btnBannerUpdate').textContent = 'Reiniciar y actualizar';
                    $('btnBannerUpdate').disabled = false;
                    $('updateBanner').classList.remove('hidden');
                    $('settingsUpdateBadge').classList.remove('hidden');
                    showToast('Actualización lista. Pulsa en el aviso para reiniciar.', 'success');
                } else if (payload.status === 'not-available') {
                    $('updateStatusText').textContent = 'Tienes la versión más reciente.';
                } else if (payload.status === 'error') {
                    $('updateStatusText').textContent = payload.message || 'Error en actualizaciones.';
                }
            });
        }
    } catch (error) {
        if (elements.statusBar) elements.statusBar.classList.add('error');
        if (elements.statusText) elements.statusText.textContent = 'No se pudieron cargar los datos locales.';
        if (elements.statusCode) elements.statusCode.textContent = 'INIT_ERROR';
        showToast(error.message || 'Error de inicialización.', 'error');
    }
}

initialize();







const shortcutInput = setGlobalShortcut;
if (shortcutInput) {
    shortcutInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (e.key === 'Backspace' || e.key === 'Delete') { e.target.value = ''; return; }
        if (e.key === 'Escape') { e.target.blur(); return; }
        let keys = [];
        if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        const forbiddenKeys = ['Control', 'Alt', 'Shift', 'Meta', 'Dead', 'CapsLock', 'Tab'];
        if (!forbiddenKeys.includes(e.key)) {
            let keyName = e.key.toUpperCase();
            if (keyName === ' ') keyName = 'Space';
            else if (keyName.length === 1 && keyName >= 'A' && keyName <= 'Z') keyName = keyName;
            else if (keyName.length === 1 && keyName >= '0' && keyName <= '9') keyName = keyName;
            else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
            else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
            else keyName = e.code;
            keys.push(keyName);
            e.target.value = keys.join('+');
        }
    });
}



