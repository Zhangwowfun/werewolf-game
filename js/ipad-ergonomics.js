// 单台 iPad 多人传机与桌面公放增强模块：顺时针名单记忆、180°桌面翻转、投票防窥遮罩、iPadOS语音与常亮锁自愈

const ROSTER_STORAGE_KEY = 'werewolf-saved-roster';
const MAX_ROSTER_SLOTS = 10;
let speechWarmupDone = false;
let tabletopFlipped = false;
let nightToastTimerId = null;

function readSavedRoster() {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
        return null;
    }
}

function writeSavedRoster(slots) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(slots));
        }
    } catch (e) { /* 忽略隐私模式写入限制 */ }
}

function getDefaultSlotName(index) {
    return `玩家${index + 1}`;
}

function getInitialRosterSlot(index) {
    const saved = readSavedRoster();
    const item = saved && saved[index];
    if (item && typeof item === 'object') {
        const cleanName = typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : getDefaultSlotName(index);
        const cleanGender = item.gender === 'female' ? 'female' : 'male';
        return { name: cleanName, gender: cleanGender };
    }
    return { name: getDefaultSlotName(index), gender: 'male' };
}

function persistSetupRosterFromDOM() {
    if (typeof document === 'undefined') return;
    const inputs = Array.from(document.querySelectorAll('.name-input'));
    const genders = Array.from(document.querySelectorAll('.gender-toggle'));
    if (!inputs.length) return;
    const existing = readSavedRoster() || Array.from({ length: MAX_ROSTER_SLOTS }, (_, i) => ({
        name: getDefaultSlotName(i),
        gender: 'male'
    }));
    const nextSlots = existing.slice(0, MAX_ROSTER_SLOTS);
    while (nextSlots.length < MAX_ROSTER_SLOTS) {
        nextSlots.push({ name: getDefaultSlotName(nextSlots.length), gender: 'male' });
    }
    inputs.forEach((input, idx) => {
        if (idx >= MAX_ROSTER_SLOTS) return;
        const val = (input.value || '').trim() || getDefaultSlotName(idx);
        const gen = genders[idx] && genders[idx].dataset.gender === 'female' ? 'female' : 'male';
        nextSlots[idx] = { name: val, gender: gen };
    });
    writeSavedRoster(nextSlots);
}

function persistRosterFromPlayers(players) {
    if (!Array.isArray(players) || !players.length) return;
    const existing = readSavedRoster() || Array.from({ length: MAX_ROSTER_SLOTS }, (_, i) => ({
        name: getDefaultSlotName(i),
        gender: 'male'
    }));
    const nextSlots = existing.slice(0, MAX_ROSTER_SLOTS);
    while (nextSlots.length < MAX_ROSTER_SLOTS) {
        nextSlots.push({ name: getDefaultSlotName(nextSlots.length), gender: 'male' });
    }
    players.forEach((p, idx) => {
        if (idx >= MAX_ROSTER_SLOTS) return;
        nextSlots[idx] = {
            name: (p.rawName || '').trim() || getDefaultSlotName(idx),
            gender: p.gender === 'female' ? 'female' : 'male'
        };
    });
    writeSavedRoster(nextSlots);
}

function clearSingleNameInput(index) {
    if (typeof document === 'undefined') return;
    const inputs = Array.from(document.querySelectorAll('.name-input'));
    const target = inputs[index];
    if (!target) return;
    target.value = '';
    persistSetupRosterFromDOM();
    if (typeof target.focus === 'function') target.focus();
}

function resetSavedRosterToDefault() {
    if (!confirm('要将玩家昵称与性别全部恢复为默认「玩家1~玩家N（男）」吗？')) return;
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(ROSTER_STORAGE_KEY);
    } catch (e) { /* 忽略 */ }
    renderNameInputs();
    updateConfigPreview();
}

// 桌面平放 iPad 时供对面座位玩家一键静音旋转画面 180°（进入闭眼过渡或天亮自动复位，不留朝向痕迹）
function toggleTabletopFlip() {
    tabletopFlipped = !tabletopFlipped;
    applyTabletopFlipClass();
    if (typeof resetNightRoleTimer === 'function' && typeof gameState !== 'undefined' && gameState.phase === PHASE.NIGHT) {
        resetNightRoleTimer();
    }
}

function resetTabletopFlip() {
    if (!tabletopFlipped) return;
    tabletopFlipped = false;
    applyTabletopFlipClass();
}

function applyTabletopFlipClass() {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('app-root');
    if (root && root.classList) {
        root.classList.toggle('tabletop-flipped', Boolean(tabletopFlipped));
    }
    if (typeof document.querySelectorAll === 'function') {
        const activeLabel = tabletopFlipped ? '🔄 画面已倒转180°（点此回正）' : '🔄 坐餐桌对面？点此倒转画面180°';
        Array.from(document.querySelectorAll('.tabletop-flip-btn')).forEach(btn => {
            btn.textContent = activeLabel;
        });
    }
}

function renderNightFlipToolbarHtml() {
    const activeLabel = tabletopFlipped ? '🔄 画面已倒转180°（点此回正）' : '🔄 坐餐桌对面？点此倒转画面180°';
    return `
        <div class="tabletop-flip-bar">
            <button type="button" class="tabletop-flip-btn" onclick="toggleTabletopFlip()">${activeLabel}</button>
        </div>
    `;
}

// 夜间深色页内轻提示：杜绝黑夜弹出苹果原生刺眼纯白 alert() 照亮神职脸部
function notifyPlayerPrompt(message) {
    const inNight = typeof gameState !== 'undefined' && gameState.phase === PHASE.NIGHT;
    if (!inNight || typeof document === 'undefined') {
        alert(message);
        return;
    }
    const host = document.getElementById('app-root') || document.body;
    if (!host || !document.createElement) return;
    let toast = document.getElementById('night-inline-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'night-inline-toast';
        toast.className = 'night-inline-toast';
        host.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    if (nightToastTimerId) clearTimeout(nightToastTimerId);
    nightToastTimerId = setTimeout(() => {
        if (toast && toast.classList) toast.classList.remove('visible');
    }, 2200);
}

// 统一在用户真实触屏手势中解锁 iPadOS Safari 的 AudioSession、WebAudio、单例 MP3 与 speechSynthesis
function unlockIpadAudioAndSpeech() {
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
        try { navigator.audioSession.type = 'playback'; } catch (e) { /* 旧版忽略 */ }
    }
    if (typeof getPartyAudioContext === 'function') {
        getPartyAudioContext();
    }
    if (typeof ensureGodVoiceAudio === 'function') {
        try {
            const audio = ensureGodVoiceAudio();
            if (audio && !audio.src && typeof audio.load === 'function') {
                audio.load();
            }
        } catch (e) { /* 忽略 */ }
    }
    if (!speechWarmupDone && typeof window !== 'undefined'
        && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        try {
            speechWarmupDone = true;
            const silentUtterance = new SpeechSynthesisUtterance(' ');
            silentUtterance.volume = 0;
            silentUtterance.rate = 2;
            silentUtterance.lang = 'zh-CN';
            window.speechSynthesis.speak(silentUtterance);
        } catch (e) { /* 忽略 */ }
    }
    if (typeof gameState !== 'undefined' && gameState.players && gameState.players.length > 0
        && gameState.phase !== PHASE.SETUP && typeof acquireWakeLock === 'function') {
        acquireWakeLock();
    }
}

// 白天单台 iPad 投票交接遮罩与沉默之印跳票提示
function showVoteSilencedPass(voter) {
    document.getElementById('game-phase-text').textContent = `第${gameState.dayNumber}天 · 投票跳过`;
    document.getElementById('game-content').innerHTML = `
        <div class="vote-handoff-card">
            <span class="phase-badge day">${text('vote.phase')}</span>
            <div style="font-size:42px;margin:16px 0 8px;">🤐</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent-gold);">${voter.name} 今日无法投票</div>
            <div style="font-size:14px;color:var(--text-secondary);margin-top:10px;line-height:1.6;">
                受特权卡效果影响，本轮跳过 ${voter.name} 的选票。<br>请勿代投，直接点击下方按钮后将 iPad 传给下一位存活玩家。
            </div>
        </div>
    `;
    document.getElementById('game-bottom-bar').innerHTML = `
        <button class="btn btn-primary btn-block btn-lg" onclick="advanceSilencedVoter()">已知晓，跳过 ${voter.name} 传给下一位</button>
    `;
    setGameResumeView('voteSilenced');
}

function advanceSilencedVoter() {
    const alive = getAlivePlayers();
    const voter = alive[gameState.voterIndex];
    if (voter) log(`🤐 ${voter.name} 被沉默，跳过投票`, 'info');
    gameState.selectedTarget = null;
    gameState.voterIndex += 1;
    showNextVoter();
}

function showVoteHandoffScreen(voter) {
    document.getElementById('game-phase-text').textContent = `第${gameState.dayNumber}天 · 投票交接`;
    document.getElementById('game-content').innerHTML = `
        <div class="vote-handoff-card">
            <span class="phase-badge day">${text('vote.phase')}</span>
            <div style="font-size:14px;color:var(--text-dim);margin-top:18px;">请按顺时针座次将 iPad 交给</div>
            <div style="font-size:32px;font-weight:900;color:var(--accent-gold);margin:10px 0;">${voter.name}</div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
                选票与个人昨夜私密讯息已隐藏。<br>请确认 iPad 已在 ${voter.name} 本人手中、旁人避开视线后再打开。
            </div>
        </div>
    `;
    document.getElementById('game-bottom-bar').innerHTML = `
        <button class="btn btn-primary btn-block btn-lg" onclick="openVoterBallot()">✋ 我是 ${voter.name}，打开选票</button>
    `;
    setGameResumeView('vote');
}

function setupIpadLifecycleGuards() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('focus', () => {
        if (typeof gameState !== 'undefined' && gameState.players && gameState.players.length > 0
            && gameState.phase !== PHASE.SETUP && typeof acquireWakeLock === 'function') {
            acquireWakeLock();
        }
        if (typeof partyAudioCtx !== 'undefined' && partyAudioCtx
            && (partyAudioCtx.state === 'suspended' || partyAudioCtx.state === 'interrupted')) {
            partyAudioCtx.resume().catch(() => {});
        }
    });
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('pointerdown', () => {
            if (typeof partyAudioCtx !== 'undefined' && partyAudioCtx
                && (partyAudioCtx.state === 'suspended' || partyAudioCtx.state === 'interrupted')) {
                partyAudioCtx.resume().catch(() => {});
            }
            if (typeof gameState !== 'undefined' && gameState.players && gameState.players.length > 0
                && gameState.phase !== PHASE.SETUP && typeof acquireWakeLock === 'function') {
                acquireWakeLock();
            }
        }, { passive: true });
    }
}

setupIpadLifecycleGuards();
