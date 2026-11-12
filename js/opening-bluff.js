// 开局一圈传机（按住圆圈看底牌+同屏决断特权卡）与「虚晃一枪·空城计」模块

let holdPeekDelayTimer = null;
let holdPeekActivePointer = false;

function getCardDealMode() {
    if (typeof gameState !== 'undefined' && gameState.cardDealMode) return gameState.cardDealMode;
    return getStoredPref('werewolf-card-deal-mode', 'female_only');
}

function setCardDealMode(mode) {
    setStoredPref('werewolf-card-deal-mode', mode);
    if (typeof gameState !== 'undefined') gameState.cardDealMode = mode;
    updateSetupSpicyControls();
    updateConfigPreview();
}

function setSpiceTier(tier) {
    setStoredPref('werewolf-spice-tier', tier);
    updateSetupSpicyControls();
}

function toggleNoPropsMode() {
    const next = getStoredPref('werewolf-no-props', 'off') === 'on' ? 'off' : 'on';
    setStoredPref('werewolf-no-props', next);
    updateSetupSpicyControls();
}

function toggleNightStealthPref() {
    const next = getStoredPref('werewolf-night-stealth', 'on') === 'on' ? 'off' : 'on';
    setStoredPref('werewolf-night-stealth', next);
    syncNightStealthClass();
    updateSetupSpicyControls();
}

function syncNightStealthClass() {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('app-root');
    if (!root || !root.classList) return;
    const stealthOn = getStoredPref('werewolf-night-stealth', 'on') === 'on';
    const inNight = typeof gameState !== 'undefined' && gameState.phase === PHASE.NIGHT;
    root.classList.toggle('night-stealth-mode', Boolean(stealthOn && inNight));
}

function selectHoldersForDealMode(players, mode) {
    if (mode === 'all') return [...players];
    if (mode === 'random_half') {
        const count = Math.ceil(players.length / 2);
        return shuffle(players).slice(0, count).sort((a, b) => a.id - b.id);
    }
    return players.filter(p => p.gender === 'female');
}

function handleSetupStartClick() {
    if (typeof unlockIpadAudioAndSpeech === 'function') unlockIpadAudioAndSpeech();
    playSoundCheckBell();
    const mode = getStoredPref('werewolf-card-deal-mode', 'female_only');
    const genders = Array.from(document.querySelectorAll('.gender-toggle'));
    const hasFemale = genders.slice(0, playerCount).some(btn => btn.dataset.gender === 'female');
    if (mode === 'female_only' && !hasFemale) {
        const switchAll = confirm('当前所有玩家头像都是男性，「仅女生领卡」模式下本局将没有特权卡和大冒险。\n\n点「确定」自动切换为【全员人手一张特权卡】直接开局；\n点「取消」留在设置页点头像改性别。');
        if (!switchAll) return;
        setCardDealMode('all');
    }
    setupGame({ useMergedOpening: true });
}

function isCardActiveForCurrentRound(holder, cardId = null) {
    if (!isCardActive(holder, cardId)) return false;
    const effectiveDay = holder.cardEffectiveDay || 1;
    const id = holder.card.id;
    if (['DECOY', 'NINE_LIVES', 'DISRUPTOR'].includes(id)) {
        return gameState.dayNumber >= effectiveDay;
    }
    return gameState.dayNumber === effectiveDay;
}

function applyDelayedNightPotions() {
    gameState.players.forEach(holder => {
        if (!isCardActive(holder)) return;
        const effectiveDay = holder.cardEffectiveDay || 1;
        if (effectiveDay !== gameState.dayNumber) return;
        if (holder.card.id === 'RESCUE') {
            holder.cardUsed = true;
            if (holder.roleKey === 'witch') {
                holder.maxCure += 1;
                log(`空城计延迟生效：${holder.name} 在第${gameState.dayNumber}夜获得1瓶额外解药`, 'good');
            }
        } else if (holder.card.id === 'POISON') {
            holder.cardUsed = true;
            if (holder.roleKey === 'witch') {
                holder.maxPoison += 1;
                log(`空城计延迟生效：${holder.name} 在第${gameState.dayNumber}夜获得1瓶额外毒药`, 'good');
            }
        }
    });
}

function startMergedOpeningFlow() {
    gameState.phase = PHASE.ROLE;
    gameState.mergedOpeningActive = true;
    gameState.openingPassIndex = 0;
    showScreen('screen-role');
    showOpeningPass(0);
}

function buildOpeningCardPreviewHtml(player, card) {
    const needsTarget = card ? cardNeedsTarget(card) : false;
    const targets = card && needsTarget ? getCardActivationTargets(player) : [];
    const targetGridHtml = card && needsTarget ? `
        <div class="card-title" style="margin-top:8px;">点选特权卡作用目标（卡名已隐藏防偷看）</div>
        <div class="player-grid">${targets.map(p => playerCardHtml(p, 'cardActivation')).join('')}</div>
    ` : '';
    const secretCardHtml = card ? `
        <div class="privilege-card-display" style="margin-top:10px;">
            <div class="label">专属暗置特权卡（松手即隐藏）</div>
            <div class="name">${card.emoji} ${card.name}</div>
            <div class="desc">${card.desc}</div>
        </div>
    ` : `<div class="info-box" style="margin-top:10px;font-size:13px;">本局你未持有特权卡。记住身份后松手隐藏，点底部按钮传给下一位。</div>`;
    // 松手后的外部面板绝不明文显示特权卡名或效果，彻底防止大屏 iPad 邻座余光泄密
    const panelHtml = card ? `
        <div class="info-box" style="margin-bottom:8px;font-size:13px;">
            <div><strong>暗置特权决策</strong>（卡名已隐藏，忘词可再次按住上方圆圈重看）</div>
            <div style="margin-top:4px;color:var(--accent-gold);">${needsTarget ? '请先在下方点选 1 名作用目标，再点底部按钮选择「真激活 / 空城计 / 放弃」。' : '本卡无需选择目标，请直接在底部按钮选择「真激活 / 空城计 / 放弃」。'}</div>
        </div>
        ${targetGridHtml}
    ` : `<div class="info-box" style="margin-bottom:8px;font-size:13px;color:var(--text-dim);">身份已确认并隐藏。请点击底部按钮后再将 iPad 递给下一位玩家。</div>`;
    return { secretCardHtml, panelHtml };
}

function renderHoldPeekMaskHtml(unlocked, hasCard) {
    if (unlocked) {
        return `
            <div class="hold-peek-ring peeked" id="hold-peek-ring">按住重看</div>
            <div style="font-size:14px;color:var(--accent-green);font-weight:700;">✓ 已查看并隐藏底牌</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">请先点下方按钮完成操作，再把 iPad 传给下一位</div>
        `;
    }
    return `
        <div class="hold-peek-ring" id="hold-peek-ring">按住看底牌</div>
        <div style="font-size:14px;color:var(--text-secondary);">拇指按住圆圈不放查看身份${hasCard ? '与暗置卡' : ''}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">仅圆圈响应按住防交接误触 · 松手立即黑屏隐藏</div>
    `;
}

function showOpeningPass(index) {
    clearHoldPeekDelay();
    holdPeekActivePointer = false;
    if (index >= gameState.players.length) {
        beginMergedPublicDareQueue();
        return;
    }
    gameState.phase = PHASE.ROLE;
    gameState.openingPassIndex = index;
    gameState.roleRevealIndex = index;
    if (!restoringGameSnapshot) gameState.selectedTarget = null;

    const player = gameState.players[index];
    const unlocked = Boolean(player.peekedRole);
    const card = player.hasCard ? player.card : null;
    const { secretCardHtml, panelHtml } = buildOpeningCardPreviewHtml(player, card);

    document.getElementById('role-reveal-content').innerHTML = `
        <div class="opening-pass-header">
            <div style="font-size:14px;color:var(--text-dim);">请按座次将 iPad 交给（全桌仅传这一圈）</div>
            <div style="font-size:24px;font-weight:800;margin-top:2px;color:var(--accent-gold);">${player.name}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">第 ${index + 1} / ${gameState.players.length} 位</div>
        </div>
        <div class="hold-peek-card" id="hold-peek-box" oncontextmenu="return false;" ondragstart="return false;">
            <div class="hold-peek-mask" id="hold-peek-mask"
                onpointerdown="beginHoldPeekPress(${index}, event)">
                ${renderHoldPeekMaskHtml(unlocked, Boolean(card))}
            </div>
            <div class="hold-peek-secret">
                ${roleImageHtml(player, 'role-image-big')}
                <div class="hold-peek-secret-body">
                    <div class="role-name-big">${getRoleDisplayName(player)}</div>
                    <div class="role-desc-text">${identityRoleDesc(player)}</div>
                    ${secretCardHtml}
                </div>
            </div>
        </div>
        <div id="opening-card-decision-panel" style="display:${unlocked ? 'block' : 'none'};text-align:left;width:100%;">${panelHtml}</div>
    `;

    renderOpeningPassBottomBar(index, unlocked);
    setGameResumeView('openingPass', index);
}

function renderOpeningPassBottomBar(index, unlocked) {
    const player = gameState.players[index];
    const nav = document.getElementById('role-nav');
    if (!nav) return;
    if (!unlocked) {
        nav.innerHTML = `<button class="btn btn-secondary btn-block" disabled>请先按住上方圆圈查看身份</button>`;
        return;
    }
    const isLast = index === gameState.players.length - 1;
    if (!player.hasCard) {
        nav.innerHTML = `
            <button class="btn btn-primary btn-block btn-lg" onclick="advanceOpeningPass(${index})">
                ${isLast ? '我已记住身份，进入下一步' : '我已记住身份，传给下一位'}
            </button>
        `;
        return;
    }
    nav.innerHTML = `
        <div class="opening-choice-btn-group">
            <button class="btn btn-primary btn-block" onclick="submitOpeningCardChoice(${index}, 'real')">真激活（首轮生效，稍后做公开动作）</button>
            <button class="btn btn-secondary btn-block" style="border-color:var(--accent-gold);color:var(--accent-gold);" onclick="submitOpeningCardChoice(${index}, 'bluff')">虚晃一枪·空城计（首轮演戏，藏到第2轮生效）</button>
            <button class="btn btn-ghost btn-block" onclick="submitOpeningCardChoice(${index}, 'skip')">低调放弃特权卡，${isLast ? '进入下一步' : '传给下一位'}</button>
        </div>
    `;
}

function clearHoldPeekDelay() {
    if (holdPeekDelayTimer !== null) {
        clearTimeout(holdPeekDelayTimer);
        holdPeekDelayTimer = null;
    }
    if (typeof document !== 'undefined') {
        const box = document.getElementById('hold-peek-box');
        if (box && box.classList) box.classList.remove('pressing');
    }
}

function beginHoldPeekPress(index, event) {
    if (event) {
        const ring = event.target && event.target.closest ? event.target.closest('#hold-peek-ring') : null;
        if (!ring) return;
        if (event.preventDefault) event.preventDefault();
        if (typeof unlockIpadAudioAndSpeech === 'function') unlockIpadAudioAndSpeech();
        if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) { /* 忽略 */ }
        }
    }
    clearHoldPeekDelay();
    holdPeekActivePointer = true;
    const box = typeof document !== 'undefined' ? document.getElementById('hold-peek-box') : null;
    if (box && box.classList) box.classList.add('pressing');
    holdPeekDelayTimer = setTimeout(() => {
        holdPeekDelayTimer = null;
        if (!holdPeekActivePointer) return;
        startHoldPeek(index, true);
    }, 130);
}

function revealUnlockedOpeningControls(index) {
    const player = gameState.players[index];
    if (!player) return;
    const mask = typeof document !== 'undefined' ? document.getElementById('hold-peek-mask') : null;
    if (mask) {
        const isCaptured = false;
        void isCaptured;
        mask.innerHTML = renderHoldPeekMaskHtml(true, Boolean(player.hasCard));
    }
    const panel = typeof document !== 'undefined' ? document.getElementById('opening-card-decision-panel') : null;
    if (panel) panel.style.display = 'block';
    renderOpeningPassBottomBar(index, true);
}

function startHoldPeek(index, fromPointerHold = false) {
    const box = typeof document !== 'undefined' ? document.getElementById('hold-peek-box') : null;
    if (box) {
        box.classList.remove('pressing');
        box.classList.add('peeking');
    }
    const player = gameState.players[index];
    if (player && !player.peekedRole) {
        player.peekedRole = true;
        if (!fromPointerHold) {
            revealUnlockedOpeningControls(index);
        }
        saveGameSnapshot();
    }
}

function endHoldPeek() {
    clearHoldPeekDelay();
    const wasPointer = holdPeekActivePointer;
    holdPeekActivePointer = false;
    if (typeof document === 'undefined') return;
    const box = document.getElementById('hold-peek-box');
    const wasPeeking = box && box.classList && box.classList.contains('peeking');
    if (box) box.classList.remove('peeking');
    if ((wasPointer || wasPeeking) && typeof gameState !== 'undefined' && gameState.phase === PHASE.ROLE) {
        const idx = gameState.openingPassIndex || 0;
        const player = gameState.players && gameState.players[idx];
        if (player && player.peekedRole) {
            revealUnlockedOpeningControls(idx);
        }
    }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('blur', endHoldPeek);
    window.addEventListener('pointerup', endHoldPeek);
    window.addEventListener('pointercancel', endHoldPeek);
    window.addEventListener('touchend', endHoldPeek);
    window.addEventListener('touchcancel', endHoldPeek);
}

function submitOpeningCardChoice(index, mode) {
    if (typeof unlockIpadAudioAndSpeech === 'function') unlockIpadAudioAndSpeech();
    const holder = gameState.players[index];
    if (!holder || !holder.hasCard) {
        advanceOpeningPass(index);
        return;
    }
    if (mode === 'skip') {
        holder.openingChoiceMode = 'skip';
        holder.cardActivated = false;
        holder.cardTargetId = null;
        holder.cardUsed = true;
        log(`${holder.name} 私下选择放弃特权卡`, 'info');
        gameState.selectedTarget = null;
        advanceOpeningPass(index);
        return;
    }

    const needsTarget = cardNeedsTarget(holder.card);
    if (needsTarget && gameState.selectedTarget === null) {
        notifyPlayerPrompt('请先点击选择特权卡的目标玩家');
        return;
    }
    if (needsTarget && !getCardActivationTargets(holder).some(p => p.id === gameState.selectedTarget)) {
        notifyPlayerPrompt('请选择有效的目标玩家');
        return;
    }

    holder.openingChoiceMode = mode;
    holder.cardTargetId = needsTarget ? gameState.selectedTarget : null;
    holder.pendingPrivilegeAction = '';
    holder.pendingPrivilegeKey = '';
    gameState.selectedTarget = null;
    advanceOpeningPass(index);
}

function advanceOpeningPass(index) {
    if (typeof unlockIpadAudioAndSpeech === 'function') unlockIpadAudioAndSpeech();
    endHoldPeek();
    if (index + 1 < gameState.players.length) {
        showOpeningPass(index + 1);
    } else {
        beginMergedPublicDareQueue();
    }
}

function getMergedPublicDareHolders() {
    return gameState.players.filter(p => p.hasCard && (p.openingChoiceMode === 'real' || p.openingChoiceMode === 'bluff'));
}

function beginMergedPublicDareQueue() {
    const dareHolders = getMergedPublicDareHolders();
    if (!dareHolders.length) {
        startGamePhase();
        return;
    }
    gameState.phase = PHASE.PRIVILEGE;
    gameState.cardActivationIndex = 0;
    showNextMergedPublicDare();
}

function showNextMergedPublicDare() {
    const dareHolders = getMergedPublicDareHolders();
    if (gameState.cardActivationIndex >= dareHolders.length) {
        startGamePhase();
        return;
    }
    const holder = dareHolders[gameState.cardActivationIndex];
    gameState.pendingPrivilegeHolderId = holder.id;
    showPrivilegePublicConfirm(holder);
}
