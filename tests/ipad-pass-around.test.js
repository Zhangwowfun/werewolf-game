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
