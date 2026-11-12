// 开局一圈传机（按住看底牌+同屏决断特权卡）与「虚晃一枪·空城计」模块

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
    // 单轮卡仅在其指定生效日当晚/当天触发；持久触发卡从生效日起一直有效直至消耗
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
        <div class="card-title" style="margin-top:12px;">选择特权卡作用目标（保密）</div>
        <div class="player-grid">${targets.map(p => playerCardHtml(p, 'cardActivation')).join('')}</div>
    ` : '';
    const secretCardHtml = card ? `
        <div class="privilege-card-display" style="margin-top:14px;">
            <div class="label">专属暗置特权卡（全场保密）</div>
            <div class="name">${card.emoji} ${card.name}</div>
            <div class="desc">${card.desc}</div>
        </div>
    ` : `<div class="info-box" style="margin-top:14px;font-size:13px;">本局你未持有特权卡。记住身份后松手隐藏，点击下方按钮传给下一位即可。</div>`;
    const panelHtml = card ? `
        <div class="info-box" style="margin-bottom:10px;font-size:13px;">
            <div><strong>你的特权卡：${card.emoji} ${card.name}</strong> — ${card.desc}</div>
            <div style="margin-top:4px;color:var(--accent-gold);">提示：可选「虚晃一枪（空城计）」在首轮照做公开动作放烟雾弹骗全场，把真卡藏到第 2 轮自动爆发！</div>
        </div>
        ${targetGridHtml}
    ` : '';
    return { secretCardHtml, panelHtml };
}

function showOpeningPass(index) {
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
        <div style="text-align:center;margin-bottom:12px;">
            <div style="font-size:15px;color:var(--text-dim);">请把设备交给（全桌仅传这一圈）</div>
            <div style="font-size:24px;font-weight:800;margin-top:4px;color:var(--accent-gold);">${player.name}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">第 ${index + 1} / ${gameState.players.length} 位</div>
        </div>
        <div class="hold-peek-card" id="hold-peek-box"
            onpointerdown="startHoldPeek(${index})"
            onpointerup="endHoldPeek()"
            onpointerleave="endHoldPeek()"
            onpointercancel="endHoldPeek()">
            <div class="hold-peek-mask">
                <div class="hold-peek-ring">按住看底牌</div>
                <div style="font-size:14px;color:var(--text-secondary);">拇指按住圆圈不放查看身份${card ? '与特权卡' : ''}</div>
                <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">松开手指立即自动黑屏防偷看</div>
            </div>
            <div class="hold-peek-secret">
                ${roleImageHtml(player, 'role-image-big')}
                <div class="role-name-big">${getRoleDisplayName(player)}</div>
                <div class="role-desc-text">${identityRoleDesc(player)}</div>
                ${secretCardHtml}
            </div>
        </div>
        <div id="opening-card-decision-panel" style="display:${unlocked ? 'block' : 'none'};text-align:left;">${panelHtml}</div>
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
        <button class="btn btn-primary btn-block" onclick="submitOpeningCardChoice(${index}, 'real')">真激活（首轮生效，稍后做公开动作）</button>
        <button class="btn btn-secondary btn-block" style="margin-top:8px;border-color:var(--accent-gold);color:var(--accent-gold);" onclick="submitOpeningCardChoice(${index}, 'bluff')">虚晃一枪·空城计（首轮演戏，真卡藏到第2轮生效）</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="submitOpeningCardChoice(${index}, 'skip')">低调放弃特权卡，${isLast ? '进入下一步' : '传给下一位'}</button>
    `;
}

function startHoldPeek(index) {
    const box = document.getElementById('hold-peek-box');
    if (box) box.classList.add('peeking');
    const player = gameState.players[index];
    if (player && !player.peekedRole) {
        player.peekedRole = true;
        const panel = document.getElementById('opening-card-decision-panel');
        if (panel) panel.style.display = 'block';
        renderOpeningPassBottomBar(index, true);
        saveGameSnapshot();
    }
}

function endHoldPeek() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('hold-peek-box');
    if (box) box.classList.remove('peeking');
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('blur', endHoldPeek);
}

function submitOpeningCardChoice(index, mode) {
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
        alert('请先点击选择特权卡的目标玩家');
        return;
    }
    if (needsTarget && !getCardActivationTargets(holder).some(p => p.id === gameState.selectedTarget)) {
        alert('请选择有效的目标玩家');
        return;
    }

    holder.openingChoiceMode = mode; // 'real' | 'bluff'
    holder.cardTargetId = needsTarget ? gameState.selectedTarget : null;
    holder.pendingPrivilegeAction = '';
    holder.pendingPrivilegeKey = '';
    gameState.selectedTarget = null;
    advanceOpeningPass(index);
}

function advanceOpeningPass(index) {
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
