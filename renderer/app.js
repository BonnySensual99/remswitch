const rendererApi = window.api || null;
const $ = (id) => document.getElementById(id);

const elements = {
    accountsList: $('accountsList'), searchInput: $('searchInput'), gameTabs: $('gameTabs'), navTabs: $('navTabs'),
    accountModal: $('accountModal'), settingsModal: $('settingsModal'), profileModal: $('profileModal'), confirmModal: $('confirmModal'),
    switchOverlay: $('switchOverlay'), statusBar: $('statusBar'), statusText: $('statusText'), statusCode: $('statusCode'), toast: $('toast')
};

const GAME_LABELS = { valorant: 'VALORANT', league_of_legends: 'LEAGUE OF LEGENDS' };
const RANKS = {
    valorant: ['Sin rango', 'Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Ascendente', 'Inmortal', 'Radiante'],
    league_of_legends: ['Sin rango', 'Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Máster', 'Gran Máster', 'Challenger']
};
const AVATARS = {
    valorant: ['Jett', 'Phoenix', 'Reyna', 'Chamber', 'Viper', 'Omen', 'Fade', 'Iso'],
    league_of_legends: ['Ahri', 'Yasuo', 'Jinx', 'Zed', 'Lux', 'Thresh', 'Akali', 'Ekko']
};
const SWITCH_STAGES = ['CheckingRiotClient', 'LoggingOut', 'LogoutConfirmed', 'ClosingExistingSession', 'StartingRiotClient', 'WaitingForLoginWindow', 'Authenticating', 'CredentialsSubmitted', 'WaitingForAuthentication', 'LaunchingGame'];
const TERMINAL_SWITCH_STATES = new Set(['Error', 'ManualActionRequired', 'WrongPassword', 'Timeout', 'Done']);

let accounts = [];
let activity = [];
let profile = { username: '', createdAt: 0 };
let settings = null;
let runtimeStatus = null;
let currentFilter = 'all';
let currentView = 'dashboard';
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

function addClickRipple(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || button.classList.contains('modal-close')) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const bounds = button.getBoundingClientRect();
    ripple.style.left = `${event.clientX - bounds.left}px`;
    ripple.style.top = `${event.clientY - bounds.top}px`;
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

function applyTheme(theme) {
    const safeTheme = ['red', 'cyan', 'green', 'purple', 'gold'].includes(theme) ? theme : 'red';
    document.body.dataset.theme = safeTheme;
    localStorage.setItem('theme', safeTheme);
    document.querySelectorAll('.theme-dot').forEach((button) => button.classList.toggle('active', button.dataset.theme === safeTheme));
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

function initCanvas() {
    const canvas = $('bgCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.min(110, Math.max(56, Math.floor((canvas.width * canvas.height) / 12500)));
    particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - .5) * .14, vy: (Math.random() - .5) * .14,
        size: Math.random() * 2.2 + 1.2, alpha: Math.random() * .22 + .14,
        phase: Math.random() * Math.PI * 2, anchor: Math.random() < .16
    }));
}

function animateCanvas() {
    if (settings?.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('bgCanvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const color = getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim();
    for (let index = 0; index < particles.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex += 1) {
            const first = particles[index];
            const second = particles[otherIndex];
            const dx = first.x - second.x;
            const dy = first.y - second.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 172) continue;
            const strength = (1 - distance / 172) * (.72 + Math.sin((first.phase + second.phase) * .5) * .28);
            context.strokeStyle = `rgba(${color}, ${strength * .18})`;
            context.lineWidth = .55 + strength * .8;
            context.beginPath();
            context.moveTo(first.x, first.y);
            context.lineTo(second.x, second.y);
            context.stroke();
        }
    }
    for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.phase += .012;
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;
        const alpha = particle.alpha * (.78 + Math.sin(particle.phase) * .22);
        context.shadowColor = `rgba(${color}, ${alpha})`;
        context.shadowBlur = 8 + particle.size * 2;
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
        if (particle.anchor) {
            context.shadowBlur = 0;
            context.strokeStyle = `rgba(${color}, ${alpha * .55})`;
            context.lineWidth = .7;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.size * (2.6 + Math.sin(particle.phase) * .25), 0, Math.PI * 2);
            context.stroke();
        }
    }
    context.shadowBlur = 0;
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

function renderProfile() {
    const name = profile.username?.trim() || 'Operador';
    const initial = name.charAt(0).toUpperCase();
    $('headerUsername').textContent = name;
    $('headerAvatar').textContent = initial;
}

function renderRuntime() {
    const encryption = $('encryptionState');
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
    renderDashboard();
}

function renderDashboard() {
    const briefClient = $('briefClient');
    const briefSession = $('briefSession');
    const briefGame = $('briefGame');
    if (!briefClient || !briefSession || !briefGame) return;
    const riotReady = runtimeStatus?.riotClientFound && runtimeStatus?.riotSignatureValid;
    const session = runtimeStatus?.activeSession?.riotId || '';
    const runningGame = runtimeStatus?.runningGame || '';
    const busy = activeRequestId || runtimeStatus?.activeRequestId;
    briefClient.textContent = riotReady ? 'Firmado' : runtimeStatus?.riotClientFound ? 'Sin validar' : 'No encontrado';
    briefClient.className = riotReady ? 'state-ok' : 'state-bad';
    $('briefClientNote').textContent = riotReady ? 'Ruta verificada localmente' : 'Revisa Ajustes para diagnosticarlo';
    briefSession.textContent = session || 'Sin sesión';
    briefSession.className = session ? 'state-warn' : 'state-ok';
    $('briefSessionNote').textContent = session ? 'Detectada en este equipo' : 'No es presencia global';
    briefGame.textContent = runningGame === 'league_of_legends' ? 'LoL abierto' : runningGame === 'valorant' ? 'VALORANT abierto' : 'Cerrado';
    briefGame.className = runningGame ? 'state-warn' : 'state-ok';
    $('briefGameNote').textContent = runningGame ? 'Ciérralo antes de cambiar' : 'No se cerrarán partidas';
    $('briefTitle').textContent = busy ? 'Cambio en curso' : session ? 'Sesión detectada' : accounts.length ? 'Listo para cambiar' : 'Configura tu primera cuenta';
    $('briefMessage').textContent = busy
        ? 'La operación está bloqueada para evitar acciones simultáneas.'
        : session
            ? `Riot Client tiene activa la sesión ${session}.`
            : accounts.length
                ? 'Selecciona una cuenta propia y prepara tu siguiente sesión.'
                : 'Registra tu primera cuenta cifrada para empezar.';
    renderQuickSwitch();
}

function renderQuickSwitch() {
    const list = $('quickSwitchList');
    if (!list) return;
    list.textContent = '';
    const quickAccounts = [...accounts]
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .slice(0, 4);
    if (!quickAccounts.length) {
        const empty = document.createElement('div');
        empty.className = 'quick-empty';
        empty.innerHTML = '<strong>Aún no hay accesos rápidos</strong><span>Usa “Añadir cuenta” para empezar.</span>';
        list.append(empty);
        return;
    }
    for (const account of quickAccounts) {
        const isCurrent = Boolean(runtimeStatus?.activeSession?.riotId && account.riotId && runtimeStatus.activeSession.riotId.toLowerCase() === account.riotId.toLowerCase());
        const item = document.createElement('button');
        item.className = `quick-account${isCurrent ? ' is-current' : ''}`;
        item.type = 'button';
        item.disabled = Boolean(activeRequestId) || isCurrent;
        item.setAttribute('aria-label', isCurrent ? `${account.displayName}, sesión activa` : `Cambiar a ${account.displayName}`);
        item.innerHTML = `<span class="quick-game game-${account.game}">${account.game === 'league_of_legends' ? 'L' : 'V'}</span><span class="quick-copy"><strong>${escapeHtml(account.displayName)}</strong><small>${escapeHtml(account.riotId || account.region || 'Riot ID sin configurar')}</small></span><span class="quick-action" aria-hidden="true">${isCurrent ? 'ACTIVA' : '→'}</span>`;
        item.addEventListener('click', () => beginSwitch(account));
        list.append(item);
    }
}

function renderActivity() {
    const list = $('activityList');
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
        icon.className = 'activity-icon';
        icon.textContent = entry.game === 'league_of_legends' ? 'L' : 'V';
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

function renderAccounts() {
    const query = elements.searchInput.value.trim().toLowerCase();
    const counts = {
        valorant: accounts.filter((account) => account.game === 'valorant').length,
        league_of_legends: accounts.filter((account) => account.game === 'league_of_legends').length
    };
    $('countAll').textContent = accounts.length;
    $('countVal').textContent = counts.valorant;
    $('countLol').textContent = counts.league_of_legends;
    $('statAccounts').textContent = accounts.length;
    $('statValorant').textContent = counts.valorant;
    $('statLol').textContent = counts.league_of_legends;
    renderDashboard();
    elements.gameTabs.querySelectorAll('.game-tab').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.game === currentFilter));
    });

    const filtered = accounts.filter((account) => {
        if (currentFilter !== 'all' && account.game !== currentFilter) return false;
        if (!query) return true;
        return [account.displayName, account.username, account.riotId, account.region, account.rank, account.notes].some((value) => String(value || '').toLowerCase().includes(query));
    }).sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));

    elements.accountsList.textContent = '';
    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = accounts.length
            ? '<div class="empty-copy"><span class="eyebrow">SIN RESULTADOS</span><strong>Sin coincidencias</strong><p>Ajusta el filtro o la búsqueda para encontrar otra cuenta.</p><button class="btn secondary empty-clear" type="button">Limpiar filtros</button></div>'
            : '<div class="empty-copy"><div class="empty-glyph" aria-hidden="true">+</div><span class="eyebrow">PRIMER DESPLIEGUE</span><strong>Tu bóveda está lista</strong><p>Registra una cuenta cifrada o importa la sesión que ya está abierta en Riot Client.</p><div class="empty-steps"><span><b>01</b>Registra</span><span><b>02</b>Confirma</span><span><b>03</b>Cambia</span></div><button class="btn secondary empty-import" type="button">Importar sesión activa</button></div>';
        elements.accountsList.append(empty);
        empty.querySelector('.empty-import')?.addEventListener('click', importSession);
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
        card.innerHTML = `
            <div class="account-main">
                <div class="account-avatar">${account.game === 'league_of_legends' ? 'L' : 'V'}</div>
                <div class="account-copy">
                    <div class="account-topline"><h3>${escapeHtml(account.displayName)} ${account.isFavorite ? '<span class="favorite-mark" aria-label="Favorita">◆</span>' : ''}</h3><span class="game-badge">${gameLabel}</span>${isCurrent ? '<span class="current-badge">ACTIVA</span>' : ''}</div>
                    <span class="account-id">${escapeHtml(account.riotId || 'Riot ID sin configurar')}</span>
                    <div class="meta-row"><span class="meta-chip">${escapeHtml(account.region)}</span><span class="meta-chip">${escapeHtml(account.rank || 'Sin rango')}</span><span class="meta-chip">${escapeHtml(formatRelative(account.lastUsedAt))}</span>${account.level ? `<span class="meta-chip">${escapeHtml(account.level)}</span>` : ''}</div>
                </div>
            </div>
            <div class="account-actions">
                <button class="card-action favorite" type="button" aria-label="${account.isFavorite ? 'Quitar de favoritas' : 'Marcar favorita'}" title="${account.isFavorite ? 'Quitar de favoritas' : 'Marcar favorita'}">${iconSvg('star')}</button>
                <button class="card-action edit" type="button" aria-label="Editar cuenta" title="Editar cuenta">${iconSvg('edit')}</button>
                <button class="card-action delete" type="button" aria-label="Eliminar cuenta" title="Eliminar cuenta">${iconSvg('trash')}</button>
                <button class="play-btn" type="button"${isCurrent ? ' disabled data-current="true"' : ''}>${isCurrent ? 'En uso' : 'Cambiar cuenta'}</button>
            </div>`;
        card.querySelector('.favorite').addEventListener('click', () => toggleFavorite(account));
        card.querySelector('.edit').addEventListener('click', () => openAccountModal(account));
        card.querySelector('.delete').addEventListener('click', () => deleteAccount(account));
        card.querySelector('.play-btn').addEventListener('click', () => beginSwitch(account));
        elements.accountsList.append(card);
    }
    setSwitchControlsDisabled(Boolean(activeRequestId));
}

function setSwitchControlsDisabled(disabled) {
    document.querySelectorAll('.play-btn, .account-card .edit, .account-card .delete, #btnAdd, #btnQuickImport, #btnImport').forEach((button) => { button.disabled = disabled || button.dataset.current === 'true'; });
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
    currentView = view === 'accounts' ? 'accounts' : 'dashboard';
    document.body.dataset.view = currentView;
    document.body.classList.remove('view-switching');
    void document.body.offsetWidth;
    document.body.classList.add('view-switching');
    clearTimeout(viewAnimationTimer);
    viewAnimationTimer = setTimeout(() => document.body.classList.remove('view-switching'), 420);
    setActiveNav(currentView);
    if (currentView === 'accounts') {
        $('pageTitle').textContent = 'Bóveda de cuentas';
        $('pageSubtitle').textContent = 'Gestiona, filtra y prepara tus cuentas guardadas localmente.';
        if (focusSearch) requestAnimationFrame(() => elements.searchInput.focus());
    } else {
        $('pageTitle').textContent = 'Centro operativo';
        $('pageSubtitle').textContent = 'Estado local, accesos rápidos y control seguro de tus sesiones.';
    }
    renderDashboard();
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
            displayName: $('accDisplayName').value,
            game: $('accGame').value,
            region: $('accRegion').value,
            username: $('accUsername').value,
            password: $('accPassword').value,
            riotId: $('accRiotId').value,
            rank: $('accRank').value,
            level: $('accLevel').value,
            avatarAgent: $('accAvatar').value,
            notes: $('accNotes').value
        });
        hideModal(elements.accountModal);
        renderAccounts();
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

async function beginSwitch(account) {
    if (!rendererApi || activeRequestId) return;
    lastSwitchAccount = account;
    if (settings?.confirmSwitch) {
        const accepted = await confirmAction('Cambiar cuenta', `Riot Client se cerrará para iniciar “${account.displayName}” en ${GAME_LABELS[account.game]}.`, 'Iniciar cambio');
        if (!accepted) return;
    }
    try {
        const result = await rendererApi.startPlay(account.id);
        if (!result.accepted) return showToast('Ya hay un cambio de cuenta en curso.', 'error');
        activeRequestId = result.requestId;
        showSwitchOverlay(account.game, account);
        setSwitchControlsDisabled(true);
        renderRuntime();
    } catch (error) {
        showToast(error.message || 'No se pudo iniciar el cambio.', 'error');
        playSound('error');
    }
}

function resetSwitchActions() {
    ['btnRetrySwitch', 'btnOpenRiot', 'btnManualLogout', 'btnCloseSwitch'].forEach((id) => $(id).classList.add('hidden'));
}

function showSwitchOverlay(game, account = null) {
    switchPreviousFocus = document.activeElement;
    $('switchGame').textContent = GAME_LABELS[game] || 'RIOT SESSION';
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
    elements.statusText.textContent = payload.message;
    elements.statusCode.textContent = payload.errorCode || state.toUpperCase();
    elements.statusBar.className = `status-bar ${['Error', 'WrongPassword', 'Timeout'].includes(state) ? 'error' : 'busy'}`;
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
        if (state === 'WrongPassword' || state === 'Timeout' || state === 'Error') $('btnRetrySwitch').classList.remove('hidden');
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

async function openSettings() {
    if (!rendererApi) {
        settings ||= { startWithWindows: false, minimizeToTray: true, closeOnLaunch: false, confirmSwitch: true, autoLaunchGame: true, soundEnabled: true, reducedMotion: false, initialDelayMs: 1800, charDelayMs: 15, fieldDelayMs: 200, customRiotPath: '' };
        $('setStartWithWindows').checked = settings.startWithWindows;
        $('setMinimizeToTray').checked = settings.minimizeToTray;
        $('setCloseOnLaunch').checked = settings.closeOnLaunch;
        $('setConfirmSwitch').checked = settings.confirmSwitch;
        $('setAutoLaunchGame').checked = settings.autoLaunchGame;
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

async function importSession() {
    if (!rendererApi || activeRequestId) return;
    try {
        elements.statusText.textContent = 'Buscando una sesión autenticada…';
        const info = await rendererApi.importActiveSession();
        if (!info?.isValid) return showToast('No se detectó ninguna sesión activa.', 'error');
        openAccountModal();
        $('accDisplayName').value = info.displayName || '';
        $('accRiotId').value = info.riotId || '';
        $('accRegion').value = info.region || 'EU';
        $('accUsername').focus();
        showToast('Sesión detectada. Introduce el usuario privado y la contraseña.');
    } catch (error) { showToast(error.message || 'No se pudo importar la sesión.', 'error'); }
}

function openProfile() {
    $('inputProfileUsername').value = profile.username || '';
    showModal(elements.profileModal);
}

async function saveProfile(event) {
    event.preventDefault();
    if (!rendererApi) return;
    profile = await rendererApi.saveUserProfile({ username: $('inputProfileUsername').value });
    renderProfile();
    hideModal(elements.profileModal);
    showToast('Perfil local actualizado.');
}

function bindEvents() {
    $('btnMinimize').addEventListener('click', () => rendererApi?.minimizeWindow());
    $('btnClose').addEventListener('click', () => rendererApi?.closeWindow());
    $('btnAdd').addEventListener('click', () => openAccountModal());
    $('btnImport').addEventListener('click', importSession);
    $('btnQuickImport').addEventListener('click', importSession);
    $('btnViewAccounts').addEventListener('click', () => setView('accounts', true));
    $('userPill').addEventListener('click', openProfile);

    $('btnCloseAccountModal').addEventListener('click', () => hideModal(elements.accountModal));
    $('btnCancelAccount').addEventListener('click', () => hideModal(elements.accountModal));
    $('btnCloseSettingsModal').addEventListener('click', () => hideModal(elements.settingsModal));
    $('btnCancelSettings').addEventListener('click', () => hideModal(elements.settingsModal));
    $('btnCloseProfileModal').addEventListener('click', () => hideModal(elements.profileModal));
    $('btnConfirmCancel').addEventListener('click', () => settleConfirmation(false));
    $('btnConfirmAccept').addEventListener('click', () => settleConfirmation(true));
    $('btnCloseSwitch').addEventListener('click', closeSwitchOverlay);
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
    $('themePicker').addEventListener('click', (event) => {
        const button = event.target.closest('.theme-dot');
        if (!button) return;
        applyTheme(button.dataset.theme);
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
            else if (elements.switchOverlay.classList.contains('active') && !activeRequestId) closeSwitchOverlay();
        }
    });
    document.addEventListener('click', addClickRipple);
    window.addEventListener('resize', initCanvas);
}

async function initialize() {
    applyTheme(localStorage.getItem('theme') || 'red');
    document.body.dataset.view = currentView;
    bindEvents();
    initCanvas();
    animateCanvas();

    if (!rendererApi) {
        settings = { soundEnabled: true, reducedMotion: false, confirmSwitch: true };
        runtimeStatus = { encryptionAvailable: true, riotClientFound: true, activeRequestId: null };
        renderProfile(); renderRuntime(); renderActivity(); renderAccounts();
        elements.statusText.textContent = 'Vista previa local';
        return;
    }

    try {
        [accounts, activity, profile, settings, runtimeStatus] = await Promise.all([
            rendererApi.getAccounts(), rendererApi.getActivityLog(), rendererApi.getUserProfile(), rendererApi.getSettings(), rendererApi.getRuntimeStatus()
        ]);
        activeRequestId = runtimeStatus.activeRequestId || null;
        renderProfile();
        renderRuntime();
        renderActivity();
        renderAccounts();
        applyMotionPreference();
        setSwitchControlsDisabled(Boolean(activeRequestId));
        if (activeRequestId) showSwitchOverlay('valorant', accounts[0] || null);
        rendererApi.onSwitchState(updateSwitchState);
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
        elements.statusBar.classList.add('error');
        elements.statusText.textContent = 'No se pudieron cargar los datos locales.';
        elements.statusCode.textContent = 'INIT_ERROR';
        showToast(error.message || 'Error de inicialización.', 'error');
    }
}

initialize();
