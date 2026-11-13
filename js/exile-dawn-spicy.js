// 处决台「盲狙背刺凶手陪罚」、认怂封口禁枪令、终局换题封顶与黎明15秒暗夜邻座盲撩

function isBlindFlirtEnabled() {
    if (typeof gameState !== 'undefined' && typeof gameState.blindFlirtEnabled === 'boolean') {
        return gameState.blindFlirtEnabled;
    }
    return getStoredPref('werewolf-blind-flirt', 'on') === 'on';
}

function toggleBlindFlirtRule() {
    const next = getStoredPref('werewolf-blind-flirt', 'on') === 'on' ? 'off' : 'on';
    setStoredPref('werewolf-blind-flirt', next);
    updateSetupSpicyControls();
}

function resetDecisiveVoteHistory() {
    if (!gameState) return;
    gameState.voteHistory = {};
    gameState.actualVoterIds = [];
}

function recordDecisiveVote(voterId, targetId) {
    if (!gameState.voteHistory) gameState.voteHistory = {};
    if (!Array.isArray(gameState.actualVoterIds)) gameState.actualVoterIds = [];
    gameState.voteHistory[voterId] = targetId;
    if (!gameState.actualVoterIds.includes(voterId)) {
        gameState.actualVoterIds.push(voterId);
    }
}

function ensureExileBetrayerState(victimId) {
    if (gameState.exileBetrayerState && gameState.exileBetrayerState.victimId === victimId) {
        return gameState.exileBetrayerState;
    }
    const otherVoters = (gameState.actualVoterIds || []).filter(id => id !== victimId);
    const trueBetrayers = otherVoters.filter(id => gameState.voteHistory && gameState.voteHistory[id] === victimId);
    const state = {
        victimId,
        canSnipe: otherVoters.length > 0,
        resolved: otherVoters.length === 0,
        guessedId: null,
        hit: false,
        lockedPartnerId: null,
        trueBetrayerCount: trueBetrayers.length
    };
    gameState.exileBetrayerState = state;
    return state;
}

function exilePunishmentNeedsPartner() {
    const action = gameState.pendingExilePunishment || '';
    const promptKey = gameState.pendingExilePunishmentKey || '';
    return inferPartnerCountFromText(action, promptKey) > 0;
}

function renderExileBetrayerSnipeHtml(victimId) {
    const state = ensureExileBetrayerState(victimId);
    if (!state.canSnipe) return '';
    const needsPartner = exilePunishmentNeedsPartner();

    if (!state.resolved) {
        const candidates = (gameState.actualVoterIds || [])
            .filter(id => id !== victimId)
            .map(id => getPlayerById(id))
            .filter(Boolean);
        const btns = candidates.map(p => `
            <button class="betrayer-snipe-btn" onclick="resolveExileBetrayerSnipe(${victimId}, ${p.id})">
                赌 ${p.name}
            </button>
        `).join('');
        const subDesc = needsPartner
            ? '点 1 名刚才参与投票的玩家！猜中 TA 投了你，直接锁定 TA 上台配合受罚（拒绝配合须替你连干 2 杯酒）；猜错当众帮 TA 洗清冲票嫌疑！'
            : '点 1 名刚才参与投票的玩家！本条为单人惩罚无需搭档：猜中 TA 投了你，真凶当场陪喝 1 杯罚酒；猜错当众帮 TA 洗清冲票嫌疑！';
        return `
            <div class="betrayer-snipe-card">
                <div style="font-size:14px;font-weight:800;color:#f4b2a4;">处决台复仇盲狙：抓背刺真凶</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
                    ${subDesc}
                </div>
                <div class="betrayer-snipe-grid">${btns}</div>
            </div>
        `;
    }

    const guessed = getPlayerById(state.guessedId);
    const locked = state.lockedPartnerId !== null ? getPlayerById(state.lockedPartnerId) : null;
    if (state.hit && guessed) {
        return `
            <div class="betrayer-result-banner hit">
                ${needsPartner
                    ? `抓获背刺真凶！<strong>${guessed.name}</strong> 刚才真的投了你！已锁定为头号配合搭档（拒绝配合须替你连罚 2 杯酒）。`
                    : `抓获背刺真凶！<strong>${guessed.name}</strong> 刚才真的投了你，当场陪喝 1 杯罚酒！`}
            </div>
        `;
    }
    return `
        <div class="betrayer-result-banner miss">
            冤枉好人！<strong>${guessed ? guessed.name : ''}</strong> 本轮并未投你，当众洗清冲票嫌疑！
            ${needsPartner
                ? (locked ? `系统已从真投你的凶手里随机揪出 <strong>${locked.name}</strong> 上台配合！` : '（本轮其他玩家均未投你）')
                : ''}
        </div>
    `;
}

function resolveExileBetrayerSnipe(victimId, guessedId) {
    const state = ensureExileBetrayerState(victimId);
    if (state.resolved) return;
    const victim = getPlayerById(victimId);
    const guessed = getPlayerById(guessedId);
    if (!victim || !guessed) return;

    const needsPartner = exilePunishmentNeedsPartner();
    const otherTrueBetrayers = (gameState.actualVoterIds || [])
        .filter(id => id !== victimId && gameState.voteHistory && gameState.voteHistory[id] === victimId);
    const isHit = otherTrueBetrayers.includes(guessedId);

    state.resolved = true;
    state.guessedId = guessedId;
    state.hit = isHit;
    if (isHit) {
        state.lockedPartnerId = needsPartner ? guessedId : null;
        guessed.unluckyCount = (guessed.unluckyCount || 0) + 1;
        if (!needsPartner) {
            guessed.drinksCount = Math.round(((guessed.drinksCount || 0) + 1) * 10) / 10;
        }
        playCountdownGong();
        log(`处决盲狙命中：${victim.name} 当场抓获投TA的 ${guessed.name} ${needsPartner ? '上台陪罚' : '陪喝1杯罚酒'}`, 'info');
    } else {
        state.lockedPartnerId = needsPartner && otherTrueBetrayers.length > 0 ? randomItem(otherTrueBetrayers) : null;
        log(`处决盲狙落空：${guessed.name} 本轮未投 ${victim.name}，洗清嫌疑`, 'info');
    }

    // 保留已跑秒表、已点计次与「限1次换搭档」状态，仅将锁定真凶平滑并入搭档首位
    const prevWidget = gameState.activeActionWidget;
    if (prevWidget && prevWidget.contextKey === 'exile') {
        const wasRunning = prevWidget.started;
        clearActionWidgetTimer();
        let nextPartners = Array.isArray(prevWidget.partnerIds) ? [...prevWidget.partnerIds] : [];
        if (needsPartner && state.lockedPartnerId !== null && nextPartners.length > 0) {
            const withoutLocked = nextPartners.filter(id => id !== state.lockedPartnerId);
            nextPartners = [state.lockedPartnerId, ...withoutLocked].slice(0, nextPartners.length);
        }
        const canStillReroll = nextPartners.length > (state.lockedPartnerId !== null ? 1 : 0);
        gameState.activeActionWidget = {
            ...prevWidget,
            lockedFirstPartnerId: state.lockedPartnerId,
            partnerIds: nextPartners,
            canReroll: canStillReroll,
            started: false
        };
        restoringGameSnapshot = true;
        try {
            showExilePunishment(victimId);
        } finally {
            restoringGameSnapshot = false;
        }
        if (wasRunning && gameState.activeActionWidget.remainingSec > 0) {
            toggleActionWidgetTimer('exile-punishment-countdown');
        }
        saveGameSnapshot();
        return;
    }

    showExilePunishment(victimId);
}

function completeExilePunishmentDone(playerId) {
    clearActionWidgetTimer();
    clearTimedActionCountdown();
    const player = getPlayerById(playerId);
    if (player) {
        player.actionsDoneCount = (player.actionsDoneCount || 0) + 1;
    }
    gameState.activeActionWidget = null;
    gameState.exileBetrayerState = null;
    gameState.pendingExilePunishment = '';
    gameState.pendingExilePunishmentKey = '';
    gameState.pendingExilePunishmentPlayerId = null;
    renderVoteResult(playerId, 'vote');
}

function executeCowardSkipExilePunishment(playerId) {
    const player = getPlayerById(playerId);
    if (!player) return;
    clearActionWidgetTimer();
    clearTimedActionCountdown();
    player.drinksCount = Math.round(((player.drinksCount || 0) + 2) * 10) / 10;
    player.cowardCount = (player.cowardCount || 0) + 1;
    if (player.roleKey === 'hunter') {
        player.canShoot = false;
    }
    log(`${player.name} 在处决台认怂免做动作：自罚2杯酒，剥夺遗言与离场技能`, 'info');

    gameState.activeActionWidget = null;
    gameState.exileBetrayerState = null;
    gameState.pendingExilePunishment = '';
    gameState.pendingExilePunishmentKey = '';
    gameState.pendingExilePunishmentPlayerId = null;
    afterVote();
}

function cowardSkipExilePunishment(playerId) {
    const player = getPlayerById(playerId);
    if (!player) return;
    const msg = `确定选择「认怂不做」吗？\n\n认怂代价：\n1. ${player.rawName || player.name} 当场自罚 2 杯酒（可换脱1件外衣/鞋袜）\n2. 直接剥夺本轮 30 秒遗言（立即闭嘴）\n3. 若底牌是猎人，本局猎枪直接哑火作废！`;
    if (typeof openAppConfirmDialog === 'function') {
        openAppConfirmDialog({
            title: '确认认怂跳过惩罚？',
            message: msg,
            confirmText: '认怂受罚，直接跳过',
            cancelText: '返回继续做动作',
            danger: true,
            onConfirm: () => executeCowardSkipExilePunishment(playerId)
        });
        return;
    }
    if (!confirm(msg)) return;
    executeCowardSkipExilePunishment(playerId);
}

function getBlindFlirtNightHintHtml() {
    if (!isBlindFlirtEnabled()) return '';
    return `
        <div class="info-box" style="margin-top:12px;border-color:rgba(215,185,131,0.35);text-align:left;">
            <div style="font-weight:700;color:var(--accent-gold);">暗夜邻座盲撩时刻（可选）</div>
            <div style="font-size:13px;margin-top:4px;">趁全员闭眼倒数这 15 秒，已出局的冤魂或任意胆大玩家可坐在原位不出声，对<strong>左右相邻座位</strong>做一次 5 秒轻度撩拨（桌下脚尖轻勾小腿、冰杯贴手背或耳畔吹气），天亮开赌抓凶！</div>
        </div>
    `;
}

function getDayBlindFlirtButtonHtml() {
    if (!isBlindFlirtEnabled()) return '';
    const doneToday = gameState.blindFlirtResolvedDay === gameState.dayNumber;
    if (doneToday) {
        return `<button class="btn btn-ghost btn-block btn-sm" style="margin-top:10px;" disabled>本轮暗夜盲撩赌酒已结算</button>`;
    }
    return `<button class="btn btn-secondary btn-block btn-sm" style="margin-top:10px;border-color:var(--accent-gold);color:var(--accent-gold);" onclick="openBlindFlirtVictimPicker()">昨晚有人偷撩我！发起邻座盲猜赌酒</button>`;
}

function openBlindFlirtVictimPicker() {
    const btns = gameState.players.map(p => `
        <button class="btn btn-secondary btn-block" style="margin-bottom:8px;" onclick="openBlindFlirtSuspectModal(${p.id})">${p.name}（我刚被偷撩了）</button>
    `).join('');
    showModal(`
        <div class="modal-title">暗夜邻座盲猜赌酒</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请刚才在闭眼 15 秒里被偷撩到的玩家点选自己的名字：</div>
        ${btns}
        <button class="btn btn-ghost btn-block" onclick="hideModal()">取消</button>
    `);
}

function openBlindFlirtSuspectModal(victimId) {
    const victim = getPlayerById(victimId);
    if (!victim) return;
    const n = gameState.players.length;
    // 按全场初始物理座位环形计算左右邻座，不剔除昨晚死者以免剧透或错位
    const leftPlayer = getPlayerById((victimId - 1 + n) % n);
    const rightPlayer = getPlayerById((victimId + 1) % n);
    const suspects = Array.from(new Set([leftPlayer, rightPlayer].filter(p => p && p.id !== victimId)));
    const btns = suspects.map(s => `
        <button class="btn btn-primary btn-block" style="margin-bottom:10px;" onclick="promptBlindFlirtOutcome(${victim.id}, ${s.id})">
            我赌是邻座：${s.name}
        </button>
    `).join('');
    showModal(`
        <div class="modal-title">${victim.name} 请当众盲指凶手</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">先盯着左右邻座看三秒表情，当众拍板猜刚才是谁在黑暗里偷撩你：</div>
        ${btns}
        <button class="btn btn-ghost btn-block" onclick="hideModal()">算了不猜</button>
    `);
}

function promptBlindFlirtOutcome(victimId, suspectId) {
    const victim = getPlayerById(victimId);
    const suspect = getPlayerById(suspectId);
    if (!victim || !suspect) return;
    showModal(`
        <div class="modal-title">请真凶当场认领赌局结果</div>
        <div style="font-size:15px;color:var(--text-primary);line-height:1.6;margin-bottom:16px;">
            <strong>${victim.name}</strong> 当众指认刚才是 <strong>${suspect.name}</strong> 偷撩的！<br>请问抓准了吗？
        </div>
        <button class="btn btn-primary btn-block" onclick="settleBlindFlirtBet(${victim.id}, ${suspect.id}, true)">抓个正着！${suspect.name} 认栽罚酒 1 杯</button>
        <button class="btn btn-secondary btn-block" style="margin-top:8px;" onclick="settleBlindFlirtBet(${victim.id}, ${suspect.id}, false)">猜错了！${victim.name} 自罚 1 杯酒</button>
    `);
}

function settleBlindFlirtBet(victimId, suspectId, caught) {
    const victim = getPlayerById(victimId);
    const suspect = getPlayerById(suspectId);
    if (!victim || !suspect) return;
    gameState.blindFlirtResolvedDay = gameState.dayNumber;
    if (caught) {
        suspect.drinksCount = Math.round(((suspect.drinksCount || 0) + 1) * 10) / 10;
        suspect.actionsDoneCount = (suspect.actionsDoneCount || 0) + 1;
        log(`暗夜盲撩抓获：${victim.name} 精准揪出邻座 ${suspect.name}，${suspect.name} 罚酒1杯`, 'info');
    } else {
        victim.drinksCount = Math.round(((victim.drinksCount || 0) + 1) * 10) / 10;
        victim.unluckyCount = (victim.unluckyCount || 0) + 1;
        log(`暗夜盲撩猜错：${victim.name} 错怪 ${suspect.name}，自罚1杯酒`, 'info');
    }
    playSoundCheckBell();
    hideModal();
    renderDayOverview();
}
