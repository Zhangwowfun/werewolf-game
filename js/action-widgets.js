// 多模式互动执行组件：就位再开表、多人轮流接力秒表、点按计次器与天意搭档条

let activeWidgetIntervalId = null;

function clearActionWidgetTimer() {
    if (activeWidgetIntervalId) {
        clearInterval(activeWidgetIntervalId);
        activeWidgetIntervalId = null;
    }
}

function extractActionRepCount(actionText) {
    const str = String(actionText || '');
    const match = str.match(/(\d+|[一二两三四五六七八九十]{1,2})\s*(?:圈|下|遍|个(?:深蹲|骚词|骚姿势))/);
    if (!match) return 0;
    const count = parseTimeCount(match[1]);
    // 排除「舔一下手指」「走一圈」这类单次口语量词，仅 >=2 次才生成计次器
    return count >= 2 ? count : 0;
}

function isPerPersonExplicitAction(actionText) {
    return /每人\s*(\d+|[一二两三四五六七八九十]{1,3})\s*(?:秒|分钟)/.test(String(actionText || ''));
}

function initActionWidgetState({ contextKey, actorId = null, promptKey = '', actionText = '', lockedFirstPartnerId = null }) {
    clearActionWidgetTimer();
    const existing = gameState.activeActionWidget;
    if (restoringGameSnapshot && existing && existing.contextKey === contextKey && existing.actionText === actionText) {
        const resumed = { ...existing, started: false };
        gameState.activeActionWidget = resumed;
        return resumed;
    }

    const destiny = drawDestinyPartners({
        stage: contextKey,
        actorId,
        promptKey,
        actionText,
        lockedFirstPartnerId
    });
    const rawSeconds = extractTimeLimitSeconds(actionText);
    const explicitPerPerson = rawSeconds > 0 && isPerPersonExplicitAction(actionText);
    const sharedTurnRelay = rawSeconds > 0 && !explicitPerPerson
        && destiny.partnerIds.length >= 2 && /轮流/.test(String(actionText || ''));
    const isRelay = explicitPerPerson || sharedTurnRelay;
    const relayTotal = isRelay ? Math.max(destiny.partnerIds.length, 2) : 1;
    const perPersonSec = sharedTurnRelay
        ? Math.max(5, Math.round(rawSeconds / relayTotal))
        : rawSeconds;
    const repCount = rawSeconds > 0 ? 0 : extractActionRepCount(actionText);

    const widget = {
        contextKey,
        actorId,
        promptKey,
        actionText,
        lockedFirstPartnerId,
        loserRepId: destiny.loserRepId,
        partnerIds: destiny.partnerIds,
        canReroll: destiny.canReroll,
        partnerRerollUsed: false,
        mode: rawSeconds > 0 ? (isRelay ? 'relay' : 'countdown') : (repCount > 0 ? 'counter' : 'none'),
        started: false,
        perPersonSec,
        remainingSec: perPersonSec,
        relayIndex: 0,
        relayTotal,
        targetCount: repCount,
        currentCount: 0
    };
    gameState.activeActionWidget = widget;
    return widget;
}

function renderDestinyPartnerHtml(widget) {
    if (!widget) return '';
    const hasLoserRep = widget.loserRepId !== null && widget.loserRepId !== undefined;
    const hasPartners = Array.isArray(widget.partnerIds) && widget.partnerIds.length > 0;
    if (!hasLoserRep && !hasPartners) return '';

    const loserRep = hasLoserRep ? getPlayerById(widget.loserRepId) : null;
    const partnerNames = (widget.partnerIds || [])
        .map(id => getPlayerById(id))
        .filter(Boolean)
        .map((p, idx) => {
            const lockedTag = (idx === 0 && widget.lockedFirstPartnerId === p.id) ? '（盲狙锁定）' : '';
            return `${p.name}${lockedTag}`;
        })
        .join('、');

    const rerollBtn = widget.canReroll && !widget.partnerRerollUsed
        ? `<button class="btn btn-ghost btn-sm" onclick="rerollActiveActionPartners()">自罚半杯换搭档（限1次）</button>`
        : (widget.partnerRerollUsed ? `<span style="font-size:12px;color:var(--text-dim);">已换过搭档（记半杯）</span>` : '');

    return `
        <div class="destiny-partner-card" id="destiny-partner-box">
            <div class="destiny-partner-header">
                <span style="font-size:12px;color:var(--text-secondary);font-weight:700;">天意钦点互动人选</span>
                ${rerollBtn}
            </div>
            ${loserRep ? `<div style="font-size:14px;color:var(--accent-red);margin-top:6px;">受罚代表：<strong>${loserRep.name}</strong></div>` : ''}
            ${partnerNames ? `<div class="destiny-partner-names">配合搭档：${partnerNames}</div>` : ''}
        </div>
    `;
}

function renderActionExecutionHtml(widget, countdownElementId) {
    if (!widget) return '';
    const partnerHtml = renderDestinyPartnerHtml(widget);

    if (widget.mode === 'countdown' || widget.mode === 'relay') {
        const currentPartnerId = widget.mode === 'relay' && widget.partnerIds[widget.relayIndex] !== undefined
            ? widget.partnerIds[widget.relayIndex]
            : null;
        const currentPartner = currentPartnerId !== null ? getPlayerById(currentPartnerId) : null;
        const relayHeader = widget.mode === 'relay'
            ? `<div style="font-size:13px;color:var(--accent-gold);font-weight:700;margin-bottom:4px;">接力进度：第 ${widget.relayIndex + 1} / ${widget.relayTotal} 位${currentPartner ? `（${currentPartner.name}）` : ''}</div>`
            : `<div class="label">动作倒计时（摆好姿势再点开始）</div>`;
        const nextRelayBtn = widget.mode === 'relay' && widget.relayIndex + 1 < widget.relayTotal
            ? `<button class="btn btn-secondary btn-sm" onclick="nextRelayPerson('${countdownElementId}')">下一位接力（重置 ${widget.perPersonSec}s）</button>`
            : '';

        return `
            ${partnerHtml}
            <div class="action-widget-panel timed-action-timer">
                ${relayHeader}
                <div class="count"><span id="${countdownElementId}">${widget.remainingSec}</span>s</div>
                <div id="${countdownElementId}-status" style="font-size:12px;color:var(--text-dim);margin-top:4px;">
                    ${widget.remainingSec <= 0 ? '时间到！' : (widget.started ? '计时进行中…' : '已暂停，人选就位后点击开始计时')}
                </div>
                <div class="action-widget-controls">
                    <button class="btn btn-primary btn-sm" id="${countdownElementId}-toggle" onclick="toggleActionWidgetTimer('${countdownElementId}')">
                        ${widget.started ? '暂停计时' : (widget.remainingSec <= 0 ? '重新计时' : '姿势就位，开始计时')}
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="resetActionWidgetTimer('${countdownElementId}')">重置秒表</button>
                    ${nextRelayBtn}
                </div>
            </div>
        `;
    }

    if (widget.mode === 'counter') {
        const done = widget.currentCount >= widget.targetCount;
        return `
            ${partnerHtml}
            <div class="action-widget-panel">
                <div style="font-size:12px;color:var(--text-secondary);">互动计次器（每做完一次点一下）</div>
                <button class="counter-tap-btn ${done ? 'completed' : ''}" id="action-rep-counter-btn" onclick="incrementActionCounter()">
                    ${done ? `已完成全部 ${widget.targetCount} 次！` : `点击记 1 次（${widget.currentCount} / ${widget.targetCount}）`}
                </button>
            </div>
        `;
    }

    return partnerHtml;
}

function syncActionTimerDom(countdownElementId) {
    const widget = gameState.activeActionWidget;
    if (!widget || typeof document === 'undefined') return;
    const countEl = document.getElementById(countdownElementId);
    if (countEl) countEl.textContent = Math.max(0, widget.remainingSec);
    const statusEl = document.getElementById(`${countdownElementId}-status`);
    if (statusEl) {
        statusEl.textContent = widget.remainingSec <= 0
            ? '时间到！铜锣已响'
            : (widget.started ? '计时进行中…' : '已暂停，人选就位后点击开始计时');
    }
    const toggleBtn = document.getElementById(`${countdownElementId}-toggle`);
    if (toggleBtn) {
        toggleBtn.textContent = widget.started ? '暂停计时' : (widget.remainingSec <= 0 ? '重新计时' : '姿势就位，开始计时');
    }
}

function toggleActionWidgetTimer(countdownElementId) {
    const widget = gameState.activeActionWidget;
    if (!widget) return;
    getPartyAudioContext();

    if (widget.started) {
        clearActionWidgetTimer();
        widget.started = false;
        syncActionTimerDom(countdownElementId);
        saveGameSnapshot();
        return;
    }

    if (widget.remainingSec <= 0) {
        widget.remainingSec = widget.perPersonSec;
    }
    widget.started = true;
    syncActionTimerDom(countdownElementId);
    clearActionWidgetTimer();
    activeWidgetIntervalId = setInterval(() => {
        if (!gameState.activeActionWidget) {
            clearActionWidgetTimer();
            return;
        }
        widget.remainingSec = Math.max(0, widget.remainingSec - 1);
        if (widget.remainingSec > 0 && widget.remainingSec <= 3) {
            playShortTickSound();
        }
        if (widget.remainingSec <= 0) {
            clearActionWidgetTimer();
            widget.started = false;
            playCountdownGong();
        }
        syncActionTimerDom(countdownElementId);
        saveGameSnapshot();
    }, 1000);
    saveGameSnapshot();
}

function resetActionWidgetTimer(countdownElementId) {
    const widget = gameState.activeActionWidget;
    if (!widget) return;
    clearActionWidgetTimer();
    widget.started = false;
    widget.remainingSec = widget.perPersonSec;
    syncActionTimerDom(countdownElementId);
    saveGameSnapshot();
}

function nextRelayPerson(countdownElementId) {
    const widget = gameState.activeActionWidget;
    if (!widget || widget.mode !== 'relay') return;
    clearActionWidgetTimer();
    widget.relayIndex = Math.min(widget.relayTotal - 1, widget.relayIndex + 1);
    widget.remainingSec = widget.perPersonSec;
    widget.started = false;
    rerenderCurrentWidgetHost();
    saveGameSnapshot();
}

function incrementActionCounter() {
    const widget = gameState.activeActionWidget;
    if (!widget || widget.mode !== 'counter') return;
    widget.currentCount = Math.min(widget.targetCount, widget.currentCount + 1);
    const done = widget.currentCount >= widget.targetCount;
    playCounterTapSound(done);
    if (done) triggerGongFlash();
    const btn = document.getElementById('action-rep-counter-btn');
    if (btn) {
        if (done) btn.classList.add('completed');
        btn.textContent = done
            ? `已完成全部 ${widget.targetCount} 次！`
            : `点击记 1 次（${widget.currentCount} / ${widget.targetCount}）`;
    }
    saveGameSnapshot();
}

function rerollActiveActionPartners() {
    const widget = gameState.activeActionWidget;
    if (!widget || widget.partnerRerollUsed || !widget.canReroll) return;
    const drinkPayerId = widget.loserRepId !== null && widget.loserRepId !== undefined ? widget.loserRepId : widget.actorId;
    const payer = drinkPayerId !== null && drinkPayerId !== undefined ? getPlayerById(drinkPayerId) : null;
    if (payer) {
        payer.drinksCount = Math.round(((payer.drinksCount || 0) + 0.5) * 10) / 10;
        log(`${payer.name} 自罚半杯酒重抽互动搭档`, 'info');
    }
    const redrawn = drawDestinyPartners({
        stage: widget.contextKey,
        actorId: payer ? payer.id : widget.actorId,
        promptKey: widget.promptKey,
        actionText: widget.actionText,
        lockedFirstPartnerId: widget.lockedFirstPartnerId,
        excludeIds: widget.partnerIds
    });
    widget.partnerIds = redrawn.partnerIds;
    widget.partnerRerollUsed = true;
    rerenderCurrentWidgetHost();
    saveGameSnapshot();
}

function rerenderCurrentWidgetHost() {
    const widget = gameState.activeActionWidget;
    if (!widget) return;
    restoringGameSnapshot = true;
    try {
        if (widget.contextKey === 'privilege' && gameState.pendingPrivilegeHolderId !== null) {
            const holder = getPlayerById(gameState.pendingPrivilegeHolderId);
            if (holder) showPrivilegePublicConfirm(holder);
        } else if (widget.contextKey === 'exile' && gameState.pendingExilePunishmentPlayerId !== null) {
            showExilePunishment(gameState.pendingExilePunishmentPlayerId);
        } else if (widget.contextKey === 'victory') {
            showResult();
        }
    } finally {
        restoringGameSnapshot = false;
    }
}
