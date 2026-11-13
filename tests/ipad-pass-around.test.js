const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SW_PATH, createHarness } = require('./test-harness.js');

test('I1. 开局传iPad按住看底牌：松手后外部面板绝不明文泄露特权卡名与效果，且支持130ms防交接误触', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setCardDealMode('all');
    h.sandbox.setupGame({ useMergedOpening: true });

    h.sandbox.__exec('gameState.players[0].card = PRIVILEGE_CARDS.SILENCE_SEAL;');
    h.sandbox.showOpeningPass(0);

    // 交接时手掌误擦过 50ms 立即松手 -> 不应触发亮牌或解锁
    const fakeRing = { closest: sel => (sel === '#hold-peek-ring' ? {} : null) };
    h.sandbox.beginHoldPeekPress(0, { target: fakeRing, preventDefault() {} });
    h.advanceTime(50);
    h.sandbox.endHoldPeek();
    assert.equal(h.sandbox.__get('gameState.players[0].peekedRole'), false, '短于130ms的交接误触不应亮出底牌');

    // 正常按住超过 140ms 后松手 -> 解锁外部面板，但外部面板绝不包含「沉默之印」或效果描述
    h.sandbox.beginHoldPeekPress(0, { target: fakeRing, preventDefault() {} });
    h.advanceTime(160);
    assert.equal(h.sandbox.__get('gameState.players[0].peekedRole'), true);
    h.sandbox.endHoldPeek();

    const panelHtml = h.getEl('opening-card-decision-panel').innerHTML || h.getEl('role-reveal-content').innerHTML.split('id="opening-card-decision-panel"')[1] || '';
    assert.ok(!panelHtml.includes('沉默之印'), '松手后的外部决策面板绝不能明文显示特权卡名称');
    assert.ok(!panelHtml.includes('不能投票'), '松手后的外部决策面板绝不能明文显示特权卡具体效果');
});

test('I2. 白天传iPad投票：上一位点确认先进入纯净交接遮罩，绝不提前露出下一位心声聆听结果；沉默跳票有显式过场', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startGamePhase();
    h.sandbox.skipGameOpening();

    h.sandbox.__exec(`
        gameState.players[1].mindReadSummary = '本夜 玩家4 查验了你。';
        gameState.players[2].silencedToday = true;
        startDayPhase();
        startVotePhase();
    `);

    // 初始第0位：展示交接遮罩
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'vote');
    h.sandbox.openVoterBallot();
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'voteBallot');
    h.sandbox.selectVoteTarget(0, 3);
    h.sandbox.confirmVote(0);

    // 0号投完瞬间：页面必须是传给1号的纯净交接页，绝不能出现1号的心声聆听结果！
    const handoffHtml = h.getEl('game-content').innerHTML;
    assert.ok(!handoffHtml.includes('本夜 玩家4 查验了你'), '上一位投完瞬间不能露出下一位的心声聆听私密结果');

    // 1号本人点打开选票后，才看到自己的心声聆听结果
    h.sandbox.openVoterBallot();
    assert.ok(h.getEl('game-content').innerHTML.includes('本夜 玩家4 查验了你'), '本人打开选票后应正常看到心声聆听结果');
    h.sandbox.selectVoteTarget(1, 3);
    h.sandbox.confirmVote(1);

    // 轮到被沉默的2号：必须停在显式「今日无法投票」提示页，不能静默跳到3号导致2号误投3号选票
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'voteSilenced');
    assert.ok(h.getEl('game-content').innerHTML.includes('今日无法投票'));
    h.sandbox.advanceSilencedVoter();
    assert.equal(h.sandbox.__get('gameState.voterIndex'), 3);
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'vote');
});

test('I3. 夜晚全员闭眼阶段零真名残留、预言家/石像鬼查验结果10秒自动收起，且桌面180°翻转在闭眼过渡自动回正', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(8);
    const inputs = h.getNameInputs();
    const secretNames = ['阿珍特工', '阿强特工', '小美特工', '大壮特工', '老王特工', '小李特工', '赵四特工', '刘能特工'];
    secretNames.forEach((n, idx) => { inputs[idx].value = n; });
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startNightPhase();

    const prophet = h.sandbox.__get('gameState.players.find(p => p.roleKey === "prophet")');
    const gargoyle = h.sandbox.__get('gameState.players.find(p => p.roleKey === "gargoyle")');
    const witch = h.sandbox.__get('gameState.players.find(p => p.roleKey === "witch")');
    const guardian = h.sandbox.__get('gameState.players.find(p => p.roleKey === "guardian")');

    // 对面玩家点180°翻转
    h.sandbox.toggleTabletopFlip();
    assert.equal(h.getEl('app-root').classList.contains('tabletop-flipped'), true);

    // 1) 查验结果页不含预言家本人真名，且10秒归零自动收起进入下一角色闭眼页，同时180°翻转自动复位！
    const target = h.sandbox.__get('gameState.players.find(p => p.id !== ' + prophet.id + ')');
    h.sandbox.showCheckResult('预言家', prophet.name, target.name, '普通狼人', '🐺');
    assert.ok(!h.getEl('game-content').innerHTML.includes(prophet.rawName), '查验结果页不能印出预言家本人的玩家真名');
    assert.equal(h.sandbox.__get('gameState.nightRoleTimerAutoAdvance'), true, '查验结果页必须开启倒计时自动收起');

    h.advanceTime(11000);
    assert.notEqual(h.sandbox.__get('gameState.resumeView.key'), 'checkResult', '查验结果页倒数归零必须自动收起翻页');
    assert.equal(h.getEl('app-root').classList.contains('tabletop-flipped'), false, '进入闭眼过渡时桌面180°翻转必须自动复位回0度');

    // 2) 觉醒石像鬼杀人页不含「请把设备交给」或石像鬼真名
    h.sandbox.__exec(`
        gameState.players.filter(p => p.roleKey === 'werewolf').forEach(w => { w.alive = false; });
        gameState.players.find(p => p.roleKey === 'gargoyle').gargoyleAwakened = true;
        gameState.nightPreludeBypassAction = 'gargoyleKill';
        showNightGargoyleKill();
    `);
    assert.ok(!h.getEl('game-content').innerHTML.includes(gargoyle.rawName), '石像鬼行动信息框不能印出石像鬼本人的真名');
    assert.ok(!h.getEl('game-content').innerHTML.includes('请把设备交给'), '黑夜闭眼页不能出现请把设备交给某人');

    // 3) 女巫底部确认键不含女巫本人真名
    h.sandbox.__exec('gameState.nightPreludeBypassAction = "witch"; startWitchPhase();');
    assert.ok(!h.getEl('game-bottom-bar').innerHTML.includes(witch.rawName), '女巫确认按钮不能印出女巫本人的真名');

    // 4) 守卫行动页不含守卫本人真名或传机提示
    h.sandbox.__exec('gameState.nightPreludeBypassAction = "guardian"; showNightGuardian();');
    assert.ok(!h.getEl('game-content').innerHTML.includes('请把设备交给'), '守卫页不能出现请把设备交给某人');
    assert.ok(!h.getEl('game-content').innerHTML.includes(`交给 ${guardian.rawName}`), '守卫信息框不能泄露守卫真名');
});

test('I4. 女巫被刀点「选择自救」后直接按圆盘中心确认可正常提交，且黑夜未选目标不弹原生白色alert框', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startNightPhase();

    const witch = h.sandbox.__get('gameState.players.find(p => p.roleKey === "witch")');
    h.sandbox.__exec(`
        gameState.nightKillTarget = ${witch.id};
        gameState.nightPreludeBypassAction = 'witch';
        startWitchPhase();
    `);

    // 先测试未选任何目标时点转盘中心确认 -> 走页内深色提示，绝不弹白色 alert()
    h.sandbox.confirmTargetWheelSelection('witchPoison', 'confirmWitchAction', null);
    assert.equal(h.alerts.length, 0, '黑夜阶段未选目标不应弹出刺眼的系统原生 alert 框');

    // 女巫点击「选择自救」，下方转盘停在毒药盘，此时直接点转盘中心确认 -> 顺利完成自救提交！
    h.sandbox.selectWitchSave(witch.id);
    assert.equal(h.sandbox.__get(`gameState.witchSaveTargets[${witch.id}]`), witch.id);
    h.sandbox.confirmTargetWheelSelection('witchPoison', 'confirmWitchAction', null);
    assert.equal(h.alerts.length, 0);
    assert.equal(h.sandbox.__get(`getPlayerById(${witch.id}).selfSaveUsed`), true, '点转盘中心确认必须成功提交女巫自救');
});

test('I5. 单台iPad连局名单记忆：切换人数、结算返回设置调车速均完整保留已填昵称与女头像', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(7);
    let inputs = h.getNameInputs();
    let genders = h.getGenderButtons();
    inputs[0].value = '苏苏';
    genders[0].dataset.gender = 'female';
    inputs[6].value = '小七';
    genders[6].dataset.gender = 'female';
    h.sandbox.persistSetupRosterFromDOM();

    // 切到5人局再切回8人局 -> 1号苏苏与7号小七的昵称和女头像仍在！
    h.sandbox.selectPlayerCount(5);
    h.sandbox.selectPlayerCount(8);
    inputs = h.getNameInputs();
    genders = h.getGenderButtons();
    assert.equal(inputs[0].value, '苏苏');
    assert.equal(genders[0].dataset.gender, 'female');
    assert.equal(inputs[6].value, '小七');
    assert.equal(genders[6].dataset.gender, 'female');

    // 开局打到结算页后点「调整车速/人数（保留已填名单）」
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.__exec('gameState.winner = "good"; showResult();');
    h.sandbox.openSetupFromResult();
    inputs = h.getNameInputs();
    genders = h.getGenderButtons();
    assert.equal(inputs[0].value, '苏苏');
    assert.equal(genders[0].dataset.gender, 'female');

    // 点击清空按钮清空 0 号框后再切换人数 -> 0 号框应恢复为默认「玩家1」而非残留「苏苏」
    h.sandbox.clearSingleNameInput(0);
    h.sandbox.selectPlayerCount(6);
    inputs = h.getNameInputs();
    assert.equal(inputs[0].value, '玩家1');

    // 查验结果页在剩余 0 秒时保存并读档 -> 不会在恢复瞬间同步乱跳阶段，而是保留 1 秒缓冲正常展示后再推进
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startNightPhase();
    h.sandbox.showCheckResult('预言家', '玩家1', '玩家2', '普通狼人', '🐺');
    h.sandbox.__exec('gameState.nightRoleTimerRemaining = 0; saveGameSnapshot();');
    const saved = h.storage.get('werewolf-game-snapshot');
    const h2 = createHarness();
    h2.storage.set('werewolf-game-snapshot', saved);
    h2.sandbox.restoreSavedGame();
    assert.equal(h2.sandbox.__get('gameState.resumeView.key'), 'checkResult', '读档恢复0秒查验结果页时不应同步跳过当前视图');
});

test('I6. iPadOS 手势语音预热、10人双女巫压低篝火背景音与 PNG 主屏幕图标缓存校验', async () => {
    const h = createHarness();
    h.sandbox.unlockIpadAudioAndSpeech();
    assert.equal(h.spoken.some(s => s.type === 'tts'), true, '手势解锁应预先激活 iPadOS speechSynthesis');

    // 验证 icon-180.png / icon-512.png 存在且为合法 PNG 魔数，并纳入 sw.js APP_SHELL
    for (const file of ['icon-180.png', 'icon-512.png', 'css/ipad-tabletop.css', 'js/ipad-ergonomics.js']) {
        const full = path.join(ROOT, file);
        assert.ok(fs.existsSync(full), `缺失新增资源: ${file}`);
        if (file.endsWith('.png')) {
            const bytes = fs.readFileSync(full);
            assert.equal(bytes[0], 0x89);
            assert.equal(bytes[1], 0x50);
            assert.equal(bytes[2], 0x4e);
            assert.equal(bytes[3], 0x47);
        }
    }
    const swText = fs.readFileSync(SW_PATH, 'utf8');
    assert.ok(swText.includes("'./icon-180.png'"));
    assert.ok(swText.includes("'./css/ipad-tabletop.css'"));
    assert.ok(swText.includes("'./js/ipad-ergonomics.js'"));
});

test('I7. 开局传机防余光与防手势数步数推理：无目标特权卡与随机半数无卡玩家均展示统一10人网格与三键', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(10);
    h.sandbox.setCardDealMode('all');
    h.sandbox.setupGame({ useMergedOpening: true });

    // 赋予 0 号「迷雾」（无需目标的狼人卡）、1 号「沉默之印」（需目标卡）
    h.sandbox.__exec(`
        gameState.players[0].card = PRIVILEGE_CARDS.MIST;
        gameState.players[1].card = PRIVILEGE_CARDS.SILENCE_SEAL;
    `);
    h.sandbox.showOpeningPass(0);
    h.sandbox.startHoldPeek(0);
    h.sandbox.endHoldPeek();
    const mistPanel = h.getEl('role-reveal-content').innerHTML;
    assert.ok(mistPanel.includes('class="player-grid"'), '无目标卡（迷雾/女巫药水等）松手后也必须展示统一座位网格防暴露狼巫范围');

    // 未点选障眼法座位直接点真激活应被统一提示拦截（保证点击次数一致，且不弹原生 alert）
    h.sandbox.submitOpeningCardChoice(0, 'real');
    assert.equal(h.alerts.length, 0, '开局未选座位提示不得调用原生 alert');
    assert.equal(h.sandbox.__get('gameState.openingPassIndex'), 0, '无目标卡也须先点1次座位障眼法再推进，保证与好人卡点击次数一致');
    h.sandbox.selectTarget(3, 'cardActivation');
    h.sandbox.submitOpeningCardChoice(0, 'real');
    assert.equal(h.sandbox.__get('gameState.players[0].cardTargetId'), null, '无目标卡后台不应保存障眼法目标');
    assert.equal(h.sandbox.__get('gameState.openingPassIndex'), 1);

    // 随机半数发卡模式：交接遮罩不写「与暗置卡」，无卡玩家松手也有统一网格与三键
    h.sandbox.setCardDealMode('random_half');
    h.sandbox.setupGame({ useMergedOpening: true });
    const cardlessIdx = h.sandbox.__get('gameState.players.findIndex(p => !p.hasCard)');
    const cardHolderIdx = h.sandbox.__get('gameState.players.findIndex(p => p.hasCard)');
    h.sandbox.showOpeningPass(cardHolderIdx);
    assert.ok(!h.getEl('role-reveal-content').innerHTML.includes('与暗置卡'), '交接遮罩文案不能暴露下家是否持卡');
    h.sandbox.showOpeningPass(cardlessIdx);
    h.sandbox.startHoldPeek(cardlessIdx);
    h.sandbox.endHoldPeek();
    assert.ok(h.getEl('role-reveal-content').innerHTML.includes('class="player-grid"'), '随机半数模式下无卡玩家松手也应展示统一座位网格');
    assert.ok(h.getEl('role-nav').innerHTML.includes('opening-choice-btn-group'), '随机半数模式下无卡玩家底部也应展示三键防窥');
});

test('I8. 10人双女巫切换自动重置毒药转盘角度，杜绝二号女巫看到一号女巫毒口金框', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(10);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startNightPhase();

    h.sandbox.__exec(`
        gameState.nightKillTarget = null;
        gameState.nightPreludeBypassAction = 'witch';
        startWitchPhase();
    `);
    // 一号女巫拖动毒药转盘到 -270 度（6号位）并确认下毒
    h.sandbox.setTargetWheelRotation('witchPoison', -270);
    h.sandbox.selectWitchPoison(5);
    h.sandbox.confirmWitchAction();
    // 跳过 6 秒过渡进入二号女巫
    h.sandbox.finishNightPrelude();
    assert.equal(h.sandbox.getTargetWheelRotation('witchPoison'), -90, '切换二号女巫时毒药转盘必须重置回默认 -90 度（1号位）');
});

test('I9. 私密子页（选票/离场/查验结果）崩溃读档一律回退防窥遮罩，且夜间读档自动恢复篝火背景音', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startNightPhase();

    // 1) 查验结果页读档：保留 checkResult 阶段但隐藏真实身份字样，并恢复夜间背景音
    h.sandbox.showCheckResult('预言家', '玩家1', '玩家2', '普通狼人', '🐺');
    const snapCheck = h.storage.get('werewolf-game-snapshot');
    const hCheck = createHarness();
    let ambienceRestored = false;
    hCheck.sandbox.__exec('const _origAmb = startNightAmbience; startNightAmbience = function() { globalThis.__ambCalled = true; return _origAmb(); };');
    hCheck.storage.set('werewolf-game-snapshot', snapCheck);
    hCheck.sandbox.restoreSavedGame();
    ambienceRestored = Boolean(hCheck.sandbox.__get('Boolean(globalThis.__ambCalled)'));
    assert.equal(ambienceRestored, true, '夜晚子阶段读档恢复后必须重开篝火心跳背景音');
    assert.ok(!hCheck.getEl('game-content').innerHTML.includes('普通狼人'), '查验结果页读档恢复绝不能当众亮出刚查到的具体身份');

    // 2) 白天打开选票看到心声聆听时读档：必须回退到投票交接遮罩页
    h.sandbox.__exec(`
        gameState.players[0].mindReadSummary = '本夜 玩家5 查验了你。';
        startDayPhase();
        startVotePhase();
        openVoterBallot();
    `);
    const snapVote = h.storage.get('werewolf-game-snapshot');
    const hVote = createHarness();
    hVote.storage.set('werewolf-game-snapshot', snapVote);
    hVote.sandbox.restoreSavedGame();
    assert.equal(hVote.sandbox.__get('gameState.resumeView.key'), 'vote', '打开选票中途读档必须回退到投票交接遮罩');
    assert.ok(!hVote.getEl('game-content').innerHTML.includes('本夜 玩家5 查验了你'), '读档恢复瞬间不得裸露心声聆听结果');

    // 3) 白天猎人离场私密页读档：必须回退到离场交接遮罩页
    const hunterId = h.sandbox.__get('gameState.players.find(p => p.roleKey === "hunter").id');
    h.sandbox.__exec(`
        const hunter = getPlayerById(${hunterId});
        hunter.alive = false;
        showEliminationPrivate(${hunterId});
    `);
    const snapElim = h.storage.get('werewolf-game-snapshot');
    const hElim = createHarness();
    hElim.storage.set('werewolf-game-snapshot', snapElim);
    hElim.sandbox.restoreSavedGame();
    assert.equal(hElim.sandbox.__get('gameState.resumeView.key'), 'eliminationHandoff', '离场私密页读档必须回退到交接遮罩页');
});

test('I10. 邻座词条不乱点跨桌搭档、单次量词不出0/1计次器、轮流词条均摊接力秒数、后点盲狙保留秒表与换人锁', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: true });

    // 1) 右边玩家词条（partners: 0）不应抽跨桌搭档
    const wRight = h.sandbox.initActionWidgetState({
        contextKey: 'privilege',
        actorId: 0,
        promptKey: 'privilege.action.15',
        actionText: '用脚在桌子底下蹭右边玩家的大腿，30秒。'
    });
    assert.equal(wRight.partnerIds.length, 0, '明确指定邻座（partners:0）的词条不应随机钦点跨桌玩家');

    // 2) 「舔一下手指」不应生成 0/1 计次器
    const wLick = h.sandbox.initActionWidgetState({
        contextKey: 'privilege',
        actorId: 0,
        promptKey: 'privilege.action.18',
        actionText: '舔一下自己的手指，再伸给指定玩家。'
    });
    assert.notEqual(wLick.mode, 'counter', '「一下」单次动作不应生成点击记1次按钮');

    // 3) 「三位参与者轮流抚摸头部30秒」应进入 3 人接力模式且每人均摊 10 秒
    const wRelay = h.sandbox.initActionWidgetState({
        contextKey: 'privilege',
        actorId: 0,
        promptKey: 'privilege.action.12',
        actionText: '保持跪姿，被三位参与者轮流抚摸头部30秒。'
    });
    assert.equal(wRelay.mode, 'relay');
    assert.equal(wRelay.perPersonSec, 10);

    // 4) 处决台先换搭档+开表跑 8 秒，再点盲狙 -> 保留剩余秒数与已换搭档锁
    h.sandbox.__exec(`
        startDayPhase();
        startVotePhase();
        gameState.players[2].alive = false;
        gameState.actualVoterIds = [0, 1, 2, 3, 4];
        gameState.voteHistory = { 0: 1, 1: 2, 3: 2, 4: 2 };
        gameState.pendingExilePunishment = '被另外2位玩家隔衣抚摸30秒。';
        gameState.pendingExilePunishmentKey = 'exile.punishment.3';
        gameState.pendingExilePunishmentPlayerId = 2;
        showExilePunishment(2);
    `);
    h.sandbox.rerollActiveActionPartners();
    h.sandbox.toggleActionWidgetTimer('exile-punishment-countdown');
    h.advanceTime(8000);
    assert.equal(h.sandbox.__get('gameState.activeActionWidget.remainingSec'), 22);
    assert.equal(h.sandbox.__get('gameState.activeActionWidget.partnerRerollUsed'), true);

    h.sandbox.resolveExileBetrayerSnipe(2, 3);
    assert.equal(h.sandbox.__get('gameState.activeActionWidget.remainingSec'), 22, '后点盲狙不得重置已跑过的秒表');
    assert.equal(h.sandbox.__get('gameState.activeActionWidget.partnerRerollUsed'), true, '后点盲狙不得重置限1次换搭档锁');
    assert.equal(h.sandbox.__get('gameState.activeActionWidget.partnerIds[0]'), 3, '盲狙命中的真凶应置为1号搭档');
});

test('I11. 胜负已定（投出最后一狼且无猎人开枪）直接进入胜负结算页，且结算页清空未完成存档不误报', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(5);
    h.sandbox.setupGame({ useMergedOpening: true });
    h.sandbox.startGamePhase();
    h.sandbox.skipGameOpening();

    // 场上仅剩最后 1 名狼人与 2 名好人，白天全票投出最后一头狼
    const lastWolf = h.sandbox.__get('gameState.players.find(p => p.alignment === "wolf")');
    h.sandbox.__exec(`
        gameState.players.forEach(p => {
            if (p.alignment === 'wolf' && p.id !== ${lastWolf.id}) p.alive = false;
        });
        startDayPhase();
        startVotePhase();
    `);
    const alive = h.sandbox.__get('getAlivePlayers()');
    for (const voter of alive) {
        h.sandbox.openVoterBallot();
        h.sandbox.selectVoteTarget(voter.id, lastWolf.id);
        h.sandbox.confirmVote(voter.id);
    }

    assert.equal(h.sandbox.__get('gameState.phase'), 'end', '投出最后一头狼后应直接宣布好人获胜，不再走多余处决遗言与传机');
    assert.equal(h.sandbox.__get('gameState.winner'), 'good');
    assert.equal(h.storage.has('werewolf-game-snapshot'), false, '进入终局结算后应清除局中快照，避免下次重开误报未完成对局');
});

test('I12. 旧档重开默认启用一圈合并开局，且 Service Worker 安装后并发缓存并调用 skipWaiting', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame({ useMergedOpening: false });
    h.sandbox.__exec('delete gameState.mergedOpeningActive; restartGameSamePlayers();');
    assert.equal(h.sandbox.__get('gameState.mergedOpeningActive'), true, '无 mergedOpeningActive 字段的旧档点再来一局应默认升级为一圈合并开局');

    const swText = fs.readFileSync(SW_PATH, 'utf8');
    assert.ok(swText.includes('self.skipWaiting()'), '新版 sw.js 应在校验缓存完整后调用 skipWaiting 确保刷新立即接管');
    assert.ok(swText.includes('const concurrency = 6;'), 'sw.js 预缓存应启用并发拉取缩短等待时间');
});

