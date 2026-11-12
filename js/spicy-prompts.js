// 分级成人题库引擎：三档车速升温曲线、无道具自动替换、男女比例过滤与「天意抽人」

const SPICE_TIER_LEVEL = { mild: 1, flirty: 2, wild: 3 };

// 对全部词条标注：档位 tier(1微醺/2热辣/3失控)、适用执行者性别 actor('any'|'female'|'male')、
// 所需搭档人数 partners、搭档性别偏好 pref('opposite'|'any'|'winners')、以及无道具模式替换文案 noProps
const SPICY_META = {
    // ---- 开局特权公开动作 ----
    'privilege.action.1': { tier: 1, actor: 'any', partners: 0 },
    'privilege.action.2': { tier: 2, actor: 'any', partners: 2, pref: 'opposite' },
    'privilege.action.3': { tier: 3, actor: 'female', partners: 1, pref: 'opposite' },
    'privilege.action.4': { tier: 2, actor: 'any', partners: 0 },
    'privilege.action.5': { tier: 2, actor: 'any', partners: 2, pref: 'opposite' },
    'privilege.action.6': { tier: 2, actor: 'female', minOpposite: 2, partners: 0 },
    'privilege.action.7': { tier: 2, actor: 'any', partners: 0 },
    'privilege.action.8': { tier: 2, actor: 'female', minOpposite: 1, partners: 0 },
    'privilege.action.9': { tier: 2, actor: 'female', partners: 0 },
    'privilege.action.10': {
        tier: 3, actor: 'female', partners: 0,
        noProps: '解开最上面两颗扣子（或脱掉一件外搭衣物）玩完本局。'
    },
    'privilege.action.11': { tier: 2, actor: 'any', minOpposite: 2, partners: 2, pref: 'opposite' },
    'privilege.action.12': { tier: 1, actor: 'any', partners: 3, pref: 'any' },
    'privilege.action.13': { tier: 1, actor: 'any', partners: 2, pref: 'opposite' },
    'privilege.action.14': { tier: 2, actor: 'any', partners: 0 },
    'privilege.action.15': { tier: 1, actor: 'any', partners: 0 },
    'privilege.action.16': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.17': { tier: 3, actor: 'any', partners: 0 },
    'privilege.action.18': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.19': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.20': {
        tier: 3, actor: 'any', partners: 1, pref: 'opposite',
        noProps: '脱下一件随身外衣或配饰，亲手披在指定玩家身上保管至本局结束。'
    },
    'privilege.action.21': {
        tier: 2, actor: 'any', partners: 3, pref: 'opposite',
        noProps: '紧闭双眼双手背在身后，最多3名玩家轮流摸大腿内侧，每人10秒。'
    },
    'privilege.action.22': { tier: 1, actor: 'any', partners: 0 },
    'privilege.action.23': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.24': {
        tier: 1, actor: 'any', partners: 1, pref: 'opposite',
        maleTargetAlt: '用服务的语气对指定玩家说：「贵宾，请问今晚需要特殊服务吗？」'
    },
    'privilege.action.25': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.26': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.27': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'privilege.action.28': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },

    // ---- 白天投票出局惩罚 ----
    'exile.punishment.1': { tier: 3, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.2': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.3': { tier: 2, actor: 'any', partners: 2, pref: 'opposite' },
    'exile.punishment.4': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.5': { tier: 3, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.6': {
        tier: 1, actor: 'any', partners: 3, pref: 'opposite',
        noProps: '紧闭双眼不准偷看，最多3名玩家轮流亲脖子或耳侧，每人10秒。'
    },
    'exile.punishment.7': { tier: 3, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.8': {
        tier: 2, actor: 'any', partners: 0,
        maleActorAlt: '脱掉上衣赤裸上身展示腹肌或胸膛，给在场的人看，15秒。'
    },
    'exile.punishment.9': { tier: 3, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.10': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.11': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.12': { tier: 3, actor: 'female', minOpposite: 1, partners: 1, pref: 'opposite' },
    'exile.punishment.13': { tier: 3, actor: 'female', partners: 1, pref: 'opposite' },
    'exile.punishment.14': { tier: 3, actor: 'any', partners: 0 },
    'exile.punishment.15': { tier: 3, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.16': { tier: 3, actor: 'any', partners: 0 },
    'exile.punishment.17': { tier: 2, actor: 'any', partners: 0 },
    'exile.punishment.18': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.19': { tier: 1, actor: 'any', partners: 2, pref: 'opposite' },
    'exile.punishment.20': { tier: 3, actor: 'any', partners: 0 },
    'exile.punishment.21': { tier: 3, actor: 'any', partners: 0 },
    'exile.punishment.22': { tier: 3, actor: 'any', partners: 0 },
    'exile.punishment.23': {
        tier: 2, actor: 'any', partners: 2, pref: 'opposite',
        noProps: '闭眼，被2位玩家用沾了冰酒或凉水的指尖轻擦胸口敏感点，30秒。'
    },
    'exile.punishment.24': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.25': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.26': { tier: 1, actor: 'any', partners: 1, pref: 'opposite' },
    'exile.punishment.27': { tier: 2, actor: 'any', partners: 1, pref: 'opposite' },

    // ---- 终局阵营胜利特权 ----
    'victory.privilege.1': { tier: 1, filler: true, partners: 0 },
    'victory.privilege.2': { tier: 3, partners: 0 },
    'victory.privilege.3': { tier: 1, filler: true, partners: 0 },
    'victory.privilege.4': { tier: 3, partners: 0 },
    'victory.privilege.5': { tier: 3, loserRep: true, partners: 3, pref: 'winners' },
    'victory.privilege.6': { tier: 3, loserRep: true, partners: 3, pref: 'winners' },
    'victory.privilege.7': { tier: 2, loserRep: true, minWinners: 2, partners: 2, pref: 'winners' },
    'victory.privilege.8': { tier: 3, loserRep: true, loserGender: 'female', winnerGender: 'male', partners: 3, pref: 'winners' },
    'victory.privilege.9': {
        tier: 1, loserRep: true, partners: 2, pref: 'winners',
        noProps: '失败阵营指定一人紧闭双眼双手背在身后60秒，由胜利玩家轮流贴耳吹气或轻抚颈侧，随时喊停即停。'
    },
    'victory.privilege.10': { tier: 3, loserRep: true, minWinners: 3, partners: 3, pref: 'winners' },
    'victory.privilege.11': { tier: 2, partners: 0 },
    'victory.privilege.12': {
        tier: 2, partners: 0,
        noProps: '失败阵营所有人撅起臀部，由胜利阵营玩家用手掌隔衣清脆拍打臀部10下。'
    },
    'victory.privilege.13': {
        tier: 3, partners: 0,
        noProps: '失败阵营所有人，隔衣或贴肤用手掌快速摩擦大腿根20秒。'
    },
    'victory.privilege.14': { tier: 1, partners: 0 },
    'victory.privilege.15': { tier: 3, partners: 0 },
    'victory.privilege.16': { tier: 2, partners: 0 },
    'victory.privilege.17': { tier: 1, partners: 0 },
    'victory.privilege.18': { tier: 2, partners: 0 },
    'victory.privilege.19': { tier: 2, loserRep: true, partners: 1, pref: 'winners' },
    'victory.privilege.20': { tier: 2, partners: 0 }
};

function getSpiceSettings() {
    const maxTier = (typeof gameState !== 'undefined' && gameState.spiceConfig && gameState.spiceConfig.maxTier)
        || getStoredPref('werewolf-spice-tier', 'flirty');
    const noPropsMode = (typeof gameState !== 'undefined' && gameState.spiceConfig && typeof gameState.spiceConfig.noPropsMode === 'boolean')
        ? gameState.spiceConfig.noPropsMode
        : (getStoredPref('werewolf-no-props', 'off') === 'on');
    return { maxTier, noPropsMode };
}

function allowedTiersForStage(stage, maxTierKey, dayNumber = 1) {
    const cap = SPICE_TIER_LEVEL[maxTierKey] || 2;
    if (cap === 1) return [1];
    if (stage === 'privilege') {
        return cap === 2 ? [1] : [1, 2];
    }
    if (stage === 'exile') {
        if (cap === 2) return dayNumber <= 1 ? [1, 2] : [2];
        return dayNumber <= 1 ? [2] : [2, 3];
    }
    // victory 终局特权直接锁定当前车速最高档
    return [cap];
}

function getNumberedPromptEntries(prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedPrefix}\\.(\\d+)$`);
    return Object.keys(GAME_TEXT)
        .map(key => {
            const match = key.match(pattern);
            return match ? { key, order: Number(match[1]), rawText: text(key) } : null;
        })
        .filter(item => item && item.rawText && item.rawText !== item.key)
        .sort((a, b) => a.order - b.order);
}

function resolvePromptText(entry, actorPlayer, noPropsMode) {
    const meta = SPICY_META[entry.key] || {};
    if (actorPlayer && actorPlayer.gender === 'male' && meta.maleActorAlt) {
        return meta.maleActorAlt;
    }
    if (noPropsMode && meta.noProps) {
        return meta.noProps;
    }
    if (meta.maleTargetAlt) {
        return meta.maleTargetAlt;
    }
    return entry.rawText;
}

function isPromptCompatible(entry, stage, actorPlayer) {
    const meta = SPICY_META[entry.key] || { tier: 2, actor: 'any', partners: 0 };
    const players = (typeof gameState !== 'undefined' && Array.isArray(gameState.players)) ? gameState.players : [];
    if (!players.length) return true;

    if (actorPlayer && meta.actor && meta.actor !== 'any' && actorPlayer.gender !== meta.actor) {
        return false;
    }
    const others = actorPlayer ? players.filter(p => p.id !== actorPlayer.id) : players;
    if (meta.partners && others.length < Math.min(meta.partners, 1)) {
        return false;
    }
    if (actorPlayer && meta.minOpposite) {
        const oppCount = others.filter(p => p.gender !== actorPlayer.gender).length;
        if (oppCount < meta.minOpposite) return false;
    }
    if (stage === 'victory' && gameState.winner) {
        const winners = players.filter(p => p.alignment === gameState.winner);
        const losers = players.filter(p => p.alignment !== gameState.winner);
        if (meta.minWinners && winners.length < meta.minWinners) return false;
        if (meta.loserGender && !losers.some(p => p.gender === meta.loserGender)) return false;
        if (meta.winnerGender && !winners.some(p => p.gender === meta.winnerGender)) return false;
    }
    return true;
}

function selectSmartPrompt(prefix, stage, storageKey, actorPlayer = null, excludeText = '') {
    const { maxTier, noPropsMode } = getSpiceSettings();
    const cap = SPICE_TIER_LEVEL[maxTier] || 2;
    const dayNum = (typeof gameState !== 'undefined' && gameState.dayNumber) ? gameState.dayNumber : 1;
    const targetTiers = allowedTiersForStage(stage, maxTier, dayNum);
    const allEntries = getNumberedPromptEntries(prefix);

    const compatible = allEntries.filter(entry => isPromptCompatible(entry, stage, actorPlayer));
    const nonFiller = cap >= 2
        ? compatible.filter(entry => !(SPICY_META[entry.key] && SPICY_META[entry.key].filler))
        : compatible;

    let candidates = nonFiller.filter(entry => {
        const t = (SPICY_META[entry.key] && SPICY_META[entry.key].tier) || 2;
        return targetTiers.includes(t);
    });
    // 若当前高档池为空（如全男局+无道具），逐档向下回退但不超过所选车速上限
    if (!candidates.length) {
        candidates = nonFiller.filter(entry => ((SPICY_META[entry.key] && SPICY_META[entry.key].tier) || 1) <= cap);
    }
    if (!candidates.length) {
        candidates = compatible.length ? compatible : allEntries;
    }

    const mapped = candidates
        .map(entry => ({ entry, finalText: resolvePromptText(entry, actorPlayer, noPropsMode) }))
        .filter(item => item.finalText && item.finalText !== excludeText);
    const pool = mapped.length ? mapped : allEntries.map(e => ({ entry: e, finalText: e.rawText }));
    const texts = pool.map(item => item.finalText);
    const chosenText = drawNonRepeatingPersistentItem(texts, storageKey);
    const matched = pool.find(item => item.finalText === chosenText) || pool[0];
    return {
        key: matched ? matched.entry.key : '',
        text: chosenText
    };
}

function inferPartnerCountFromText(actionText, promptKey = '') {
    const meta = promptKey && SPICY_META[promptKey];
    if (meta && typeof meta.partners === 'number' && meta.partners > 0) return meta.partners;
    const str = String(actionText || '');
    if (/最多3名|三位参与者|三名胜利玩家/.test(str)) return 3;
    if (/选2位|另外2位|2位异性|二位参与者|两名玩家|2位玩家|两名胜利玩家/.test(str)) return 2;
    if (/指定玩家|一名玩家|左边|右边/.test(str)) return 1;
    return 0;
}

function buildPartnerCandidatePool(players, stage, actor, meta) {
    if (stage === 'victory' && gameState.winner) {
        const winMatches = players.filter(p => p.alignment === gameState.winner && (!meta.winnerGender || p.gender === meta.winnerGender));
        return winMatches.length ? winMatches : players.filter(p => p.alignment === gameState.winner);
    }
    return players.filter(p => !actor || p.id !== actor.id);
}

function drawDestinyPartners({ stage, actorId = null, promptKey = '', actionText = '', lockedFirstPartnerId = null, excludeIds = [] }) {
    const players = (typeof gameState !== 'undefined' && Array.isArray(gameState.players)) ? gameState.players : [];
    if (!players.length) return { loserRepId: null, partnerIds: [], canReroll: false };

    const meta = (promptKey && SPICY_META[promptKey]) || {};
    let loserRepId = null;
    let actor = actorId !== null && actorId !== undefined ? getPlayerById(actorId) : null;

    if (stage === 'victory' && gameState.winner && (meta.loserRep || /失败阵营指定一人/.test(actionText))) {
        const losers = players.filter(p => p.alignment !== gameState.winner && (!meta.loserGender || p.gender === meta.loserGender));
        const chosenLoser = randomItem(losers.length ? losers : players.filter(p => p.alignment !== gameState.winner));
        if (chosenLoser) {
            loserRepId = chosenLoser.id;
            actor = chosenLoser;
        }
    }

    const needed = inferPartnerCountFromText(actionText, promptKey);
    if (needed <= 0) return { loserRepId, partnerIds: [], canReroll: false };

    const pool = buildPartnerCandidatePool(players, stage, actor, meta);
    const picked = [];
    if (lockedFirstPartnerId !== null && lockedFirstPartnerId !== undefined && (!actor || lockedFirstPartnerId !== actor.id)) {
        picked.push(lockedFirstPartnerId);
    }

    const remainingPool = pool.filter(p => !picked.includes(p.id) && !excludeIds.includes(p.id));
    const sourcePool = remainingPool.length >= (needed - picked.length) ? remainingPool : pool.filter(p => !picked.includes(p.id));
    const orderedPool = actor && meta.pref === 'opposite'
        ? [...shuffle(sourcePool.filter(p => p.gender !== actor.gender)), ...shuffle(sourcePool.filter(p => p.gender === actor.gender))]
        : shuffle(sourcePool);

    for (const candidate of orderedPool) {
        if (picked.length >= needed) break;
        picked.push(candidate.id);
    }

    const unlockedCount = needed - (lockedFirstPartnerId !== null && lockedFirstPartnerId !== undefined ? 1 : 0);
    const unlockedPoolSize = pool.filter(p => p.id !== lockedFirstPartnerId).length;
    return { loserRepId, partnerIds: picked, canReroll: unlockedCount > 0 && unlockedPoolSize > unlockedCount };
}
