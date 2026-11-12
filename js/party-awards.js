// 结算页趣味封号评选（今夜骚王/奥斯卡戏精/全场大冤种/认怂酒神）与本机连局战绩榜

const PARTY_LEADERBOARD_KEY = 'werewolf-party-leaderboard';

function pickTopSpicyAward(players) {
    const top = [...players].sort((a, b) => (b.actionsDoneCount || 0) - (a.actionsDoneCount || 0))[0];
    if (!top || (top.actionsDoneCount || 0) <= 0) return null;
    return {
        tag: '今夜骚王',
        winner: top.name,
        reason: `本局豁出去完成了 ${top.actionsDoneCount} 次公开互动挑战，全场气氛担当`
    };
}

function pickTricksterAward(players) {
    const scored = players.map(p => {
        let score = 0;
        let note = '';
        if (p.cardBluff && p.cardActivated) {
            score += 3;
            note = '开局虚晃一枪空城计把全桌耍得团团转';
        }
        if (p.cardActivated && p.card && ['MIST', 'FRAME_UP', 'DISRUPTOR'].includes(p.card.id)) {
            score += 2;
            if (!note) note = `暗中发动「${p.card.name}」搅乱全场视线`;
        }
        if (gameState.winner === ALIGNMENT.WOLF && p.alignment === ALIGNMENT.WOLF && p.alive) {
            score += 2;
            if (!note) note = `身为${p.role.name}深藏不露苟到终局获胜`;
        }
        return { player: p, score, note };
    }).sort((a, b) => b.score - a.score);
    if (!scored[0] || scored[0].score <= 0) return null;
    return { tag: '奥斯卡戏精', winner: scored[0].player.name, reason: scored[0].note };
}

function pickUnluckyAward(players) {
    const top = [...players].sort((a, b) => (b.unluckyCount || 0) - (a.unluckyCount || 0))[0];
    if (!top || (top.unluckyCount || 0) <= 0) return null;
    return {
        tag: '全场大冤种',
        winner: top.name,
        reason: top.unluckyReason || `本局连踩 ${top.unluckyCount} 次飞来横祸，建议大家敬TA半杯安慰酒`
    };
}

function pickDrinkerAward(players) {
    const top = [...players].sort((a, b) => (b.drinksCount || 0) - (a.drinksCount || 0))[0];
    if (!top || (top.drinksCount || 0) <= 0) return null;
    return {
        tag: '认怂酒神',
        winner: top.name,
        reason: `本局累计喜提 ${top.drinksCount} 杯罚酒，酒量撑起半边天`
    };
}

function computePartyAwards() {
    if (!gameState || !Array.isArray(gameState.players) || !gameState.players.length) return [];
    const players = gameState.players;
    return [
        pickTopSpicyAward(players),
        pickTricksterAward(players),
        pickUnluckyAward(players),
        pickDrinkerAward(players)
    ].filter(Boolean);
}

function renderPartyAwardsHtml() {
    const awards = computePartyAwards();
    if (!awards.length) return '';
    const cards = awards.map(item => `
        <div class="award-badge">
            <div class="tag">✦ ${item.tag}</div>
            <div class="winner">${item.winner}</div>
            <div class="reason">${escapeHtml(item.reason)}</div>
        </div>
    `).join('');
    return `
        <div class="card-title" style="margin-top:20px;">今夜封神榜</div>
        <div class="awards-grid">${cards}</div>
    `;
}

function readPartyLeaderboard() {
    const clean = Object.create(null);
    try {
        if (typeof localStorage === 'undefined') return clean;
        const parsed = JSON.parse(localStorage.getItem(PARTY_LEADERBOARD_KEY) || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.entries(parsed).forEach(([k, v]) => {
                if (v && typeof v === 'object' && !Array.isArray(v)) clean[k] = v;
            });
        }
    } catch (e) { /* 忽略损坏存储 */ }
    return clean;
}

function writePartyLeaderboard(board) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PARTY_LEADERBOARD_KEY, JSON.stringify(board));
        }
    } catch (e) { /* 忽略不可用存储 */ }
}

function syncGameToPartyLeaderboard() {
    if (!gameState || !gameState.winner || !Array.isArray(gameState.players)) return;
    const board = readPartyLeaderboard();
    if (!gameState.syncedDrinkTotals) gameState.syncedDrinkTotals = {};
    if (!gameState.syncedActionTotals) gameState.syncedActionTotals = {};

    const firstSync = !gameState.statsRecorded;
    gameState.players.forEach(p => {
        const key = p.rawName || p.name;
        const prev = Object.prototype.hasOwnProperty.call(board, key)
            ? board[key]
            : { name: p.name, rawName: key, games: 0, wins: 0, actions: 0, drinks: 0 };
        const prevSyncedDrinks = gameState.syncedDrinkTotals[p.id] || 0;
        const prevSyncedActions = gameState.syncedActionTotals[p.id] || 0;
        const deltaDrinks = Math.max(0, Math.round(((p.drinksCount || 0) - prevSyncedDrinks) * 10) / 10);
        const deltaActions = Math.max(0, (p.actionsDoneCount || 0) - prevSyncedActions);

        board[key] = {
            name: p.name,
            rawName: key,
            games: (Number(prev.games) || 0) + (firstSync ? 1 : 0),
            wins: (Number(prev.wins) || 0) + (firstSync && p.alignment === gameState.winner ? 1 : 0),
            actions: (Number(prev.actions) || 0) + deltaActions,
            drinks: Math.round(((Number(prev.drinks) || 0) + deltaDrinks) * 10) / 10
        };
        gameState.syncedDrinkTotals[p.id] = p.drinksCount || 0;
        gameState.syncedActionTotals[p.id] = p.actionsDoneCount || 0;
    });

    gameState.statsRecorded = true;
    writePartyLeaderboard(board);
}

function showPartyLeaderboardModal() {
    const board = readPartyLeaderboard();
    const entries = Object.values(board).sort((a, b) => (b.wins - a.wins) || (b.actions - a.actions) || (b.drinks - a.drinks));
    const rowsHtml = entries.length ? entries.map((item, idx) => `
        <div class="leaderboard-row">
            <div>
                <span style="color:var(--accent-gold);font-weight:800;margin-right:6px;">#${idx + 1}</span>
                <strong>${escapeHtml(item.rawName || item.name)}</strong>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">
                胜 ${item.wins}/${item.games} 局 · 挑战 ${item.actions} 次 · 罚酒 ${item.drinks} 杯
            </div>
        </div>
    `).join('') : `<div style="color:var(--text-dim);padding:16px 0;text-align:center;">今晚还没有已完成对局的战绩记录</div>`;

    showModal(`
        <div class="modal-title">今晚包厢连局总榜（仅存本机）</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">仅保存在当前设备本地，不上传网络、不生成外发截图，换场可一键清空。</div>
        <div style="max-height:48vh;overflow-y:auto;">${rowsHtml}</div>
        <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="confirmClearPartyLeaderboard()">清空今晚战绩</button>
            <button class="btn btn-primary btn-sm" style="flex:1;" onclick="hideModal()">关闭</button>
        </div>
    `);
}

function confirmClearPartyLeaderboard() {
    if (!confirm('确定清空本机保存的今晚连局总榜吗？')) return;
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(PARTY_LEADERBOARD_KEY);
    } catch (e) { /* 忽略 */ }
    showPartyLeaderboardModal();
}

function updateSetupSpicyControls() {
    if (typeof document === 'undefined') return;
    const tier = getStoredPref('werewolf-spice-tier', 'flirty');
    ['mild', 'flirty', 'wild'].forEach(key => {
        const btn = document.getElementById(`spice-tier-${key}`);
        if (btn && btn.classList) btn.classList.toggle('active', tier === key);
    });
    const dealMode = getStoredPref('werewolf-card-deal-mode', 'female_only');
    ['female_only', 'random_half', 'all'].forEach(key => {
        const btn = document.getElementById(`deal-mode-${key}`);
        if (btn && btn.classList) btn.classList.toggle('active', dealMode === key);
    });
    const noPropsBtn = document.getElementById('no-props-toggle');
    if (noPropsBtn) {
        const on = getStoredPref('werewolf-no-props', 'off') === 'on';
        noPropsBtn.textContent = `无道具模式（自动替换冰块/眼罩/鞭子）：${on ? '开启' : '关闭'}`;
    }
    const flirtBtn = document.getElementById('blind-flirt-toggle');
    if (flirtBtn) {
        const on = getStoredPref('werewolf-blind-flirt', 'on') === 'on';
        flirtBtn.textContent = `黎明15秒暗夜邻座盲撩：${on ? '开启' : '关闭'}`;
    }
    const stealthBtn = document.getElementById('night-stealth-toggle');
    if (stealthBtn) {
        const on = getStoredPref('werewolf-night-stealth', 'on') === 'on';
        stealthBtn.textContent = `暗夜纯黑防照脸护眼罩：${on ? '开启' : '关闭'}`;
    }
    updateAmbienceToggleUI();
}
