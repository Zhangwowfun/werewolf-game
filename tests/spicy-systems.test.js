const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SW_PATH, createHarness } = require('./test-harness.js');

test('S1. 三档车速升温曲线、无道具自动替换与终局去水题严格生效', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    const genders = h.getGenderButtons();
    genders[0].dataset.gender = 'female';
    genders[1].dataset.gender = 'female';

    // 微醺档：全程仅抽 L1 温和破冰题
    h.sandbox.setSpiceTier('mild');
    h.sandbox.setupGame({ useMergedOpening: true });
    for (let i = 0; i < 30; i++) {
        const picked = h.sandbox.selectSmartPrompt('privilege.action', 'privilege', 'test-mild-priv', h.sandbox.__get('gameState.players[0]'));
        const meta = h.sandbox.__get(`SPICY_META[${JSON.stringify(picked.key)}]`);
        assert.equal(meta.tier, 1, `微醺档不应抽出高于1档的动作: ${picked.key}`);
    }

    // 热辣档终局：锁定2档且绝不抽出纯喝水(victory.privilege.3)或纯真心话(victory.privilege.1)
    h.sandbox.setSpiceTier('flirty');
    h.sandbox.__exec('gameState.spiceConfig.maxTier = "flirty"; gameState.winner = "good";');
    for (let i = 0; i < 30; i++) {
        const picked = h.sandbox.selectSmartPrompt('victory.privilege', 'victory', 'test-flirty-vic');
        assert.notEqual(picked.key, 'victory.privilege.1', '热辣档终局不应抽出纯真心话水题');
        assert.notEqual(picked.key, 'victory.privilege.3', '热辣档终局不应抽出纯喝一杯酒水题');
    }

    // 无道具模式：冰块/情趣内衣/鞭子自动替换为徒手可执行文本
    h.sandbox.__exec('gameState.spiceConfig.noPropsMode = true;');
    const resolvedIce = h.sandbox.resolvePromptText(
        { key: 'exile.punishment.23', rawText: '闭眼，被2位玩家用冰块摩擦奶头30秒。' },
        { gender: 'female' },
        true
    );
    assert.ok(!resolvedIce.includes('用冰块'), '无道具模式应自动替换冰块道具词条');
});

test('S2. 男女比例智能过滤、天意抽人半杯换人与全员发卡模式', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(5);
    // 全男局 + 全员发卡模式
    h.sandbox.setCardDealMode('all');
    h.sandbox.setSpiceTier('wild');
    h.sandbox.setupGame({ useMergedOpening: true });

    const players = h.sandbox.__get('gameState.players');
    assert.equal(players.filter(p => p.hasCard).length, 5, '全员发卡模式下 5 名男玩家均应获得特权卡');

    // 男玩家被放逐：绝不能抽到仅限女性生理结构的词条 (exile.punishment.12 / 13)
    const maleActor = players[0];
    for (let i = 0; i < 40; i++) {
        const picked = h.sandbox.selectSmartPrompt('exile.punishment', 'exile', 'test-male-exile', maleActor);
        assert.notEqual(picked.key, 'exile.punishment.12', '男玩家不应抽到女向专属词条 12');
        assert.notEqual(picked.key, 'exile.punishment.13', '男玩家不应抽到女向专属词条 13');
    }

    // 天意抽人与自罚半杯酒换搭档（限1次）
    const widget = h.sandbox.initActionWidgetState({
        contextKey: 'privilege',
        actorId: 0,
        promptKey: 'privilege.action.16',
        actionText: '坐在指定玩家大腿上，说一句骚话。'
    });
    assert.equal(widget.partnerIds.length, 1);
    assert.notEqual(widget.partnerIds[0], 0);
    const firstPartner = widget.partnerIds[0];
    h.sandbox.rerollActiveActionPartners();
    assert.equal(h.sandbox.__get('gameState.players[0].drinksCount'), 0.5, '换搭档应记自罚 0.5 杯酒');
    assert.equal(widget.partnerRerollUsed, true);
    assert.notEqual(widget.partnerIds[0], firstPartner, '人数充足时换搭档应抽到不同玩家');
});

test('S3. 就位再开表、多人轮流接力秒表与大号计次器精确运行', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });

    // 多人轮流接力秒表：「每人10秒」初始暂停不抢跑，点开始才倒数，支持切下一位重置10秒
    const relay = h.sandbox.initActionWidgetState({
        contextKey: 'exile',
        actorId: 0,
        promptKey: 'exile.punishment.6',
        actionText: '蒙眼，最多3名玩家轮流亲脖子，每人10秒。'
    });
    assert.equal(relay.mode, 'relay');
    assert.equal(relay.started, false, '翻牌初始必须暂停，等待摆好姿势再开表');
    h.advanceTime(5000);
    assert.equal(relay.remainingSec, 10, '未点开始前秒表绝不偷跑');

    h.sandbox.toggleActionWidgetTimer('exile-punishment-countdown');
    h.advanceTime(10000);
    assert.equal(relay.remainingSec, 0);
    assert.equal(relay.started, false);
    h.sandbox.nextRelayPerson('exile-punishment-countdown');
    assert.equal(relay.relayIndex, 1);
    assert.equal(relay.remainingSec, 10, '切下一位接力应重置为完整的 10 秒');

    // 计次器：识别「10个深蹲」并逐次累加
    const counter = h.sandbox.initActionWidgetState({
        contextKey: 'victory',
        promptKey: 'victory.privilege.17',
        actionText: '失败阵营每人做十个深蹲，每做一次喊「我骚」'
    });
    assert.equal(counter.mode, 'counter');
    assert.equal(counter.targetCount, 10);
    for (let i = 0; i < 10; i++) h.sandbox.incrementActionCounter();
    assert.equal(counter.currentCount, 10);
});

test('S4. 开局一圈传机 + 虚晃一枪空城计（首轮潜伏、第2轮引爆）+ 翻题反悔罚酒1杯', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    const genders = h.getGenderButtons();
    genders[0].dataset.gender = 'female';
    genders[1].dataset.gender = 'female';
    h.sandbox.setupGame({ useMergedOpening: true });

    // 玩家 0 选择虚晃一枪（空城计），强制指定其特权卡为 DOUBLE_VOTE 贴给自己
    h.sandbox.__exec(`
        gameState.players[0].card = PRIVILEGE_CARDS.DOUBLE_VOTE;
        gameState.players[1].card = PRIVILEGE_CARDS.IMMUNITY;
    `);
    h.sandbox.startHoldPeek(0);
    h.sandbox.selectTarget(0, 'cardActivation');
    h.sandbox.submitOpeningCardChoice(0, 'bluff');

    // 玩家 1 选择真激活，随后在公开翻题后反悔作废 -> 罚酒 1 杯
    h.sandbox.startHoldPeek(1);
    h.sandbox.selectTarget(1, 'cardActivation');
    h.sandbox.submitOpeningCardChoice(1, 'real');

    for (let i = 2; i < 6; i++) {
        h.sandbox.startHoldPeek(i);
        h.sandbox.advanceOpeningPass(i);
    }

    // 进入公开动作确认：玩家 0 完成动作（空城计生效于第2轮）
    assert.equal(h.sandbox.__get('gameState.pendingPrivilegeHolderId'), 0);
    h.sandbox.drawPrivilegePublicAction(0);
    h.sandbox.confirmPrivilegePublicAction(0);
    assert.equal(h.sandbox.__get('gameState.players[0].cardBluff'), true);
    assert.equal(h.sandbox.__get('gameState.players[0].cardEffectiveDay'), 2);

    // 玩家 1 翻开动作后点反悔 -> 卡作废且罚酒 1 杯
    assert.equal(h.sandbox.__get('gameState.pendingPrivilegeHolderId'), 1);
    h.sandbox.drawPrivilegePublicAction(1);
    h.sandbox.cancelPrivilegePublicAction(1);
    assert.equal(h.sandbox.__get('gameState.players[1].cardUsed'), true);
    assert.equal(h.sandbox.__get('gameState.players[1].drinksCount'), 1, '翻开题目后反悔必须记罚酒 1 杯');

    // 验证第 1 天投票时玩家 0 的 DOUBLE_VOTE 潜伏不触发，第 2 天投票时自动引爆！
    h.sandbox.skipGameOpening();
    const baseP0 = h.sandbox.__get('gameState.players[0].baseVotePower');
    h.sandbox.__exec('gameState.dayNumber = 1; applyDayCards();');
    assert.equal(h.sandbox.__get('gameState.players[0].votePower'), baseP0, '空城计卡在第1天必须潜伏不触发');
    assert.equal(h.sandbox.__get('gameState.players[0].cardUsed'), false);

    h.sandbox.__exec('gameState.dayNumber = 2; gameState.players[0].votePower = gameState.players[0].baseVotePower; applyDayCards();');
    assert.equal(h.sandbox.__get('gameState.players[0].votePower'), baseP0 + 1, '空城计卡在第2天必须自动爆发 +1 票');
    assert.equal(h.sandbox.__get('gameState.players[0].cardUsed'), true);
});

test('S5. 处决台盲狙抓背刺真凶 + 认怂罚酒2杯禁遗言禁猎枪 + 终局换题限1次', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startGamePhase();
    h.sandbox.skipGameOpening();

    // 设玩家 2 为猎人，进入第 1 天投票：玩家 0 投 1（无辜），玩家 3、4、5 投猎人(2)
    h.sandbox.__exec(`
        const p2 = gameState.players[2];
        p2.role = ROLE.HUNTER;
        p2.roleKey = 'hunter';
        p2.alignment = 'good';
        p2.canShoot = true;
        startDayPhase();
        startVotePhase();
    `);

    const votes = [[0, 1], [1, 2], [2, 0], [3, 2], [4, 2], [5, 2]];
    for (const [voterId, targetId] of votes) {
        h.sandbox.selectVoteTarget(voterId, targetId);
        h.sandbox.confirmVote(voterId);
    }

    // 玩家 2 被放逐进入处决惩罚页
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'exilePunishment');
    // 玩家 2 盲狙玩家 3（真投了 2！）-> 命中并锁定玩家 3 为 1 号陪罚搭档
    h.sandbox.resolveExileBetrayerSnipe(2, 3);
    assert.equal(h.sandbox.__get('gameState.exileBetrayerState.hit'), true);
    assert.equal(h.sandbox.__get('gameState.exileBetrayerState.lockedPartnerId'), 3);

    // 玩家 2（猎人）选择「认怂不做」-> 罚酒 2 杯 + 剥夺遗言 + 猎枪哑火直接进下一夜！
    h.sandbox.cowardSkipExilePunishment(2);
    assert.equal(h.sandbox.__get('gameState.players[2].drinksCount'), 2);
    assert.equal(h.sandbox.__get('gameState.players[2].canShoot'), false, '认怂猎人的猎枪必须直接哑火');
    assert.equal(h.sandbox.__get('gameState.phase'), 'night', '认怂后必须直接跳过30秒遗言和开枪确认进入下一夜');

    // 验证终局特权最多换题 1 次
    h.sandbox.__exec('gameState.winner = "wolf"; showResult(); drawVictoryPrivilege();');
    const firstVic = h.sandbox.__get('gameState.victoryPrivilege');
    assert.ok(firstVic.length > 0);
    h.sandbox.replaceVictoryPrivilege();
    const secondVic = h.sandbox.__get('gameState.victoryPrivilege');
    assert.equal(h.sandbox.__get('gameState.victoryRedrawUsed'), true);
    // 再次点击换题无效
    h.sandbox.replaceVictoryPrivilege();
    assert.equal(h.sandbox.__get('gameState.victoryPrivilege'), secondVic, '终局胜利特权整局最多允许换题 1 次');
});

test('S6. 暗夜防照脸开关、邻座盲撩赌酒、赛后封号战绩榜幂等同步与 SW 缓存清单完整性', () => {
    const h = createHarness({ hangAudio: true });
    h.sandbox.selectPlayerCount(6);
    const inputs = h.getNameInputs();
    inputs[0].value = 'toString';
    inputs[1].value = '__proto__';
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startGamePhase();
    // 即使在开场语音播放中（未结束前），暗夜纯黑护眼罩也已立即挂载
    assert.equal(h.getEl('app-root').classList.contains('night-stealth-mode'), true);
    h.sandbox.skipGameOpening();

    // 进入夜晚保持挂载 night-stealth-mode，天亮自动移除
    assert.equal(h.getEl('app-root').classList.contains('night-stealth-mode'), true);
    h.sandbox.startDayPhase();
    assert.equal(h.getEl('app-root').classList.contains('night-stealth-mode'), false);

    // 暗夜邻座盲撩结算赌酒
    h.sandbox.settleBlindFlirtBet(2, 3, true);
    assert.equal(h.sandbox.__get('gameState.players[3].drinksCount'), 1);
    assert.equal(h.sandbox.__get('gameState.blindFlirtResolvedDay'), 1);

    // 结算页封号与连局总榜幂等记账（含特殊名字 toString / __proto__ 安全写入，且多次调用不重复记局数）
    h.sandbox.__exec('gameState.winner = "good"; showResult(); showResult();');
    const awards = h.sandbox.computePartyAwards();
    assert.ok(awards.length >= 2, '有互动和罚酒时结算页应生成趣味封号');
    const board = h.sandbox.readPartyLeaderboard();
    assert.equal(board['toString'].games, 1, '特殊名字 toString 战绩必须正常记为数字 1');
    assert.equal(board['__proto__'].games, 1, '特殊名字 __proto__ 战绩不能丢失');

    // 校验 sw.js 中声明的所有 APP_SHELL 本地文件均真实存在
    const swText = fs.readFileSync(SW_PATH, 'utf8');
    const shellMatch = swText.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shellMatch);
    const paths = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(p => p !== './');
    assert.ok(paths.includes('./css/spicy-immersive.css'));
    assert.ok(paths.includes('./js/spicy-prompts.js'));
    for (const rel of paths) {
        assert.ok(fs.existsSync(path.resolve(ROOT, rel)), `SW 预缓存资源缺失: ${rel}`);
    }
});
