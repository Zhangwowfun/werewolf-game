const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { SW_PATH, createHarness } = require('./test-harness.js');

test('1. 夜间空等伪装阶段（未觉醒石像鬼/死人）倒计时归零后必须自动推进，真人阶段归零仍停表保护', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.startNightPhase();

    // Skip 5s prelude -> prophet -> gargoyleCheck -> wolf -> enters gargoyleKill (unawakened on Night 1!)
    h.sandbox.finishNightPrelude(); // prophet
    h.sandbox.finishNightRoleTimer(); // -> gargoyleCheck prelude
    h.sandbox.finishNightPrelude(); // gargoyleCheck
    h.sandbox.finishNightRoleTimer(); // -> wolf prelude
    h.sandbox.finishNightPrelude(); // wolf

    // Live wolf phase: letting 15s pass WITHOUT clicking must HOLD at 0s (protect live player!)
    h.advanceTime(15000);
    assert.equal(h.sandbox.__get('gameState.nightRoleNextAction'), 'afterWolf', '真人狼人阶段超时应停表等待确认，不强制跳过');

    // Now wolf finishes -> enters gargoyleKill prelude (5s) -> unawakened gargoyle wait phase
    h.sandbox.finishNightRoleTimer();
    h.advanceTime(6000); // 5s prelude auto-finishes into showNightRoleWait for gargoyleKill
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'nightWait');

    // Nobody at the table has eyes open! Wait 15s: MUST automatically advance to witch prelude/phase!
    h.advanceTime(15000);
    assert.notEqual(
        h.sandbox.__get('gameState.resumeView.key'),
        'nightWait',
        '未觉醒石像鬼空等阶段归零后不能永久停表卡死，必须自动推进到女巫阶段'
    );
});

test('2. 女巫同时拥有解药与毒药时只渲染单个可切换转盘，且底部无静默吞药按钮', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.startNightPhase();

    const players = h.sandbox.__get('gameState.players');
    const witch = players.find(p => p.roleKey === 'witch');
    const target = players.find(p => p.id !== witch.id && p.roleKey !== 'werewolf');

    h.sandbox.__exec(`
        gameState.nightKillTarget = ${target.id};
        gameState.nightPreludeBypassAction = 'witch';
        showNextWitch();
    `);

    const contentHtml = h.getEl('game-content').innerHTML;
    const wheelCount = (contentHtml.match(/class="target-wheel-shell"/g) || []).length;
    assert.equal(wheelCount, 1, '女巫界面同一时间只能渲染 1 个完整转盘，防止双转盘横向挤压被裁切');

    // Select save target, ensure bottom bar has no finishNightRoleTimer trap
    h.sandbox.selectWitchSave(target.id);
    const bottomHtml = h.getEl('game-bottom-bar').innerHTML;
    assert.ok(!bottomHtml.includes('finishNightRoleTimer()'), '女巫操作页底部不应保留会静默清空已选药水的「直接继续」按钮');
});

test('3. 转盘外圈玩家卡片保持永远水平正立，中心确认区不随盘歪转', () => {
    const h = createHarness();
    assert.ok(
        !h.html.includes('transform: translate(-50%, -50%) rotate(var(--wheel-rotation))'),
        '.target-wheel-center 不应随盘旋转导致文字与指针歪斜'
    );
    const styleAtTop = h.sandbox.targetWheelNodeStyle(0, 6, -90);
    assert.match(
        styleAtTop,
        /rotate\(-90deg\)\s+translateX\(var\(--target-wheel-radius\)\)\s+rotate\(90deg\)/,
        '转到顶部准星(-90deg)的卡片必须反向旋转 +90deg 回正，不能 180 度大头朝下'
    );
});

test('4. 狼人与觉醒石像鬼点击「不杀人」不会弹窗报错拦截空刀', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.startNightPhase();

    h.sandbox.__exec(`
        gameState.nightPreludeBypassAction = 'wolf';
        showNightWolfKill();
    `);
    const contentHtml = h.getEl('game-content').innerHTML;
    assert.ok(
        contentHtml.includes('skipNightWolfKill') || !contentHtml.includes('selectNightKill(null)'),
        '狼人「不杀人」按钮应直接支持空刀确认而非置空导致确认弹窗报错'
    );
    if (typeof h.sandbox.skipNightWolfKill === 'function') {
        h.sandbox.skipNightWolfKill();
    } else {
        h.sandbox.selectNightKill(null);
        h.sandbox.confirmTargetWheelSelection('nightKill', 'confirmNightKill', null);
    }
    assert.equal(h.alerts.length, 0, '狼人选择空刀不应弹出报错框');
});

test('5. 夜间猎人被刀与心声聆听不得在闭眼夜静默卡屏，猎人在天亮死讯后统一暗确认且保留同归于尽判好人胜', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();

    // Force 1v1 endgame: 1 werewolf + 1 hunter alive, plus mind-read active
    const players = h.sandbox.__get('gameState.players');
    const wolf = players.find(p => p.roleKey === 'werewolf');
    const hunter = players.find(p => p.roleKey === 'hunter');
    const prophet = players.find(p => p.roleKey === 'prophet');
    players.forEach(p => {
        p.alive = (p.id === wolf.id || p.id === hunter.id);
    });
    // Put MIND_READ on wolf or hunter
    prophet.hasCard = true;
    prophet.card = h.sandbox.__get('PRIVILEGE_CARDS.MIND_READ');
    prophet.cardActivated = true;
    prophet.cardTargetId = hunter.id;
    prophet.cardUsed = false;

    h.sandbox.startNightPhase();
    // Wolf kills Hunter tonight
    h.sandbox.__exec(`gameState.nightKillTarget = ${hunter.id};`);
    h.sandbox.processNightDeaths();

    // Must go directly to 15s nightTransition (NOT stuck in mindReadHandoff!)
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'nightTransition', '夜间结算不应被心声聆听静默拦截卡在闭眼夜');

    // Advance 15s transition -> MUST enter PHASE.DAY and announce dayStart (NOT stuck in hunterNightHandoff!)
    h.advanceTime(16000);
    assert.equal(h.sandbox.__get('gameState.phase'), 'day', '15秒闭眼过渡结束后必须准时进入白天并播报天亮语音');
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'dayOverview', '天亮应先展示死亡公告页');

    // Now run Dawn Death Confirmations: Hunter shoots the last Wolf -> 1v1 mutual kill -> GOOD wins!
    h.sandbox.beginDawnDeathConfirmations();
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'dawnEliminationHandoff');
    h.sandbox.showDawnEliminationPrivate(hunter.id);
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'dawnEliminationPrivate');
    h.sandbox.showDawnHunterShoot(hunter.id);
    h.sandbox.selectTarget(wolf.id, 'hunterShoot');
    h.sandbox.confirmDawnHunterShoot(hunter.id);
    h.sandbox.continueAfterDawnHunterResult();
    assert.equal(h.sandbox.__get('gameState.winner'), 'good', '1v1夜间猎人挨刀后天亮开枪带走最后一狼，同归于尽必须判好人胜');
});

test('6. 10人局双女巫分配独立一号/二号编号并分步语音唤醒，避免同时睁眼互认', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(10);
    h.sandbox.setupGame();

    const witches = h.sandbox.__get('gameState.players.filter(p => p.roleKey === "witch")');
    assert.equal(witches.length, 2);
    const orders = Array.from(witches.map(w => w.witchOrder)).sort((a, b) => a - b);
    assert.deepEqual(orders, [1, 2], '10人局两名女巫必须分配独立的 1 号与 2 号顺序');

    h.spoken.length = 0;
    h.sandbox.startNightPhase();
    h.sandbox.__exec(`
        gameState.nightPreludeBypassAction = 'witch';
        startWitchPhase();
    `);
    assert.ok(
        h.spoken.some(s => (s.type === 'tts' && s.text.includes('一号女巫请睁眼')) || (s.type === 'audio' && s.src.includes('witchAction_1.mp3'))),
        '第一位女巫行动必须播报独立的 1 号女巫语音而非无编号通用录音'
    );
    h.sandbox.skipWitchAction();
    h.sandbox.finishNightPrelude();
    assert.ok(
        h.spoken.some(s => (s.type === 'tts' && s.text.includes('二号女巫请睁眼')) || (s.type === 'audio' && s.src.includes('witchAction_2.mp3'))),
        '第二位女巫行动必须播报独立的 2 号女巫语音'
    );
});

test('7. 开局语音异常超时保底、清空旧局残留按钮、读档重开保留自定义名字与女生头像且无 &amp; 二次转义', () => {
    const h = createHarness({ hangAudio: true });
    h.sandbox.selectPlayerCount(5);
    const inputs = h.getNameInputs();
    const genders = h.getGenderButtons();
    inputs[0].value = 'Tom & Jerry';
    genders[0].dataset.gender = 'female';
    inputs[1].value = "阿狸 '1'";
    genders[1].dataset.gender = 'female';

    // Simulate leftover stale DOM in screen-game before starting
    h.getEl('game-bottom-bar').innerHTML = '<button onclick="staleAction()">旧按钮</button>';
    h.sandbox.setupGame();
    h.sandbox.startGamePhase();

    assert.ok(!h.getEl('game-bottom-bar').innerHTML.includes('staleAction'), '进入新局开场时必须立即清空上一局残留按钮');

    // Even when audio hangs forever, safety timeout advances into Night 1!
    h.advanceTime(12000);
    assert.ok(h.sandbox.__get('gameState.resumeView') !== null, '语音卡住时超时保底必须正常推进进入第一夜');

    // Simulate browser reload -> restoreSavedGame -> finish -> restartGameSamePlayers
    const savedRaw = h.storage.get('werewolf-game-snapshot');
    assert.ok(savedRaw, '应已保存对局快照');

    const h2 = createHarness();
    h2.storage.set('werewolf-game-snapshot', savedRaw);
    h2.sandbox.restoreSavedGame();
    h2.sandbox.restartGameSamePlayers();

    const newPlayers = h2.sandbox.__get('gameState.players');
    assert.equal(newPlayers[0].gender, 'female', '读档后再来一局必须保留女性头像设置');
    assert.equal(newPlayers[1].gender, 'female', '读档后再来一局必须保留女性头像设置');
    assert.ok(!newPlayers[0].name.includes('&amp;amp;'), '特殊字符昵称不能发生二次 HTML 转义');
    assert.equal(newPlayers[0].rawName, 'Tom & Jerry', '原始昵称应完整保留');
});

test('8. 6/9人局双票权不再零收益，无村民局嫁祸/迷雾不报局外角色，技能封印可封夜间猎枪，且内置文案与 md 完全一致', () => {
    const h = createHarness();

    // 8a: 6-player DOUBLE_VOTE on good player (base 2.0 -> 3.0)
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.__exec(`
        const good = gameState.players.find(p => p.alignment === 'good');
        const holder = gameState.players[0];
        holder.hasCard = true;
        holder.card = PRIVILEGE_CARDS.DOUBLE_VOTE;
        holder.cardActivated = true;
        holder.cardTargetId = good.id;
        holder.cardUsed = false;
        applyDayCards();
    `);
    const boostedPower = h.sandbox.__get('gameState.players.find(p => p.alignment === "good").votePower');
    assert.ok(boostedPower > 2.0, `6人局好人基础票为 2.0，激活双票权后票数(${boostedPower})必须高于 2.0`);

    // 8b: 6-player (no villager!) FRAME_UP and MIST must only return roles in 6-player config
    const valid6pRoleKeys = new Set(['gargoyle', 'werewolf', 'prophet', 'witch', 'hunter']);
    for (let i = 0; i < 40; i++) {
        const mistRole = h.sandbox.getMistDisguiseRole
            ? h.sandbox.getMistDisguiseRole('prophet')
            : h.sandbox.getRandomRole();
        assert.ok(valid6pRoleKeys.has(mistRole.key), `6人无村民局迷雾不应报出局外角色: ${mistRole.key}`);
    }
    if (typeof h.sandbox.getFrameUpDisguiseRole === 'function') {
        for (let i = 0; i < 20; i++) {
            const frameRole = h.sandbox.getFrameUpDisguiseRole('prophet');
            assert.ok(valid6pRoleKeys.has(frameRole.key) && frameRole.key !== 'villager', '6人无村民局嫁祸不应显示为不存在的村民');
        }
    } else {
        assert.fail('缺少按本局实际阵容伪装的 getFrameUpDisguiseRole 实现');
    }

    // 8c: NO_SKILL on Hunter seals night gunshot
    h.sandbox.__exec(`
        const hunter = gameState.players.find(p => p.roleKey === 'hunter');
        hunter.alive = false;
        hunter.canShoot = true;
        hunter.skillSealed = true;
        gameState.deathCauses[hunter.id] = 'knife';
    `);
    assert.equal(
        h.sandbox.__get('nightHunterCanShoot(gameState.players.find(p => p.roleKey === "hunter"))'),
        false,
        '被技能封印的猎人当夜被刀不应触发猎枪'
    );

    // 8d: DEFAULT_GAME_TEXT in index.html must match content/game-text.md 100%
    const parsedMd = h.sandbox.parseGameTextMarkdown(h.mdText);
    const defaultText = JSON.parse(h.sandbox.__get('JSON.stringify(DEFAULT_GAME_TEXT)'));
    assert.deepEqual(defaultText, JSON.parse(JSON.stringify(parsedMd)), 'index.html 内置 DEFAULT_GAME_TEXT 必须与 content/game-text.md 保持 100% 同步');
});

test('9. 转盘悬停不篡改已选目标、跨界面不吞首次点击、女巫切标签不缩减重置总时长', () => {
    const h = createHarness();
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.startNightPhase();

    const players = h.sandbox.__get('gameState.players');
    const witch = players.find(p => p.roleKey === 'witch');
    const target = players.find(p => p.id !== witch.id);

    h.sandbox.__exec(`
        gameState.nightKillTarget = ${target.id};
        gameState.nightPreludeBypassAction = 'witch';
        showNextWitch();
    `);

    // Let timer tick down by 8s, switch tab -> resetNightRoleTimer must restore full NIGHT_ROLE_PHASE_SECONDS
    const fullSeconds = h.sandbox.__get('NIGHT_ROLE_PHASE_SECONDS');
    h.advanceTime(8000);
    assert.equal(h.sandbox.__get('gameState.nightRoleTimerRemaining'), fullSeconds - 8);
    h.sandbox.switchWitchTab('poison');
    h.sandbox.resetNightRoleTimer();
    assert.equal(h.sandbox.__get('gameState.nightRoleTimerRemaining'), fullSeconds, '女巫切标签后触发重置应恢复完整阶段总秒数而非剩余秒数');

    // Hovering with buttons === 0 must clear stale drag state and never overwrite target
    const shellMock = {
        dataset: { playerIds: '0,1,2,3,4,5' },
        style: { setProperty() {} },
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 })
    };
    h.sandbox.selectTarget(target.id, 'witchPoison');
    h.sandbox.targetWheelPointerDown({
        pointerId: 1, clientX: 200, clientY: 50,
        currentTarget: shellMock, target: { closest: () => ({}) }
    }, 'witchPoison');
    h.sandbox.targetWheelPointerMove({
        pointerId: 1, buttons: 0, clientX: 350, clientY: 200, currentTarget: shellMock
    }, 'witchPoison');
    assert.equal(h.sandbox.__get('gameState.witchPoisonTarget'), target.id, '松开鼠标悬停移动不应篡改已选目标');

    // Resetting game clears any lingering suppressClick so first click on privilege card works
    h.sandbox.__exec('targetWheelSuppressClick = true;');
    h.sandbox.resetGame();
    h.sandbox.selectPlayerCount(5);
    h.sandbox.setupGame();
    h.sandbox.selectTarget(1, 'cardActivation');
    assert.equal(h.sandbox.__get('gameState.selectedTarget'), 1, '重开新局后首次点击选人不应被残留防误触标志吞掉');
});

test('10. Service Worker Range 分段请求严格符合 HTTP 206 / 416 规范（含后缀 bytes=-N 与非法 bytes=-0）', async () => {
    const swCode = fs.readFileSync(SW_PATH, 'utf8');
    const fnMatch = swCode.match(/function toRangeResponse\(request, response\)\s*\{[\s\S]*?\n\}/);
    assert.ok(fnMatch, 'sw.js 应包含 toRangeResponse 函数');
    const ctx = { Response, Headers, Number, String, Math, Promise };
    vm.createContext(ctx);
    vm.runInContext(fnMatch[0], ctx);

    const payload = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) payload[i] = i % 251;
    const makeRes = () => new Response(payload, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });

    const r1 = await ctx.toRangeResponse(new Request('https://x/a.mp3', { headers: { Range: 'bytes=0-199' } }), makeRes());
    assert.equal(r1.status, 206);
    assert.equal(r1.headers.get('Content-Range'), 'bytes 0-199/1000');
    assert.equal((await r1.arrayBuffer()).byteLength, 200);

    const rSuffix = await ctx.toRangeResponse(new Request('https://x/a.mp3', { headers: { Range: 'bytes=-200' } }), makeRes());
    assert.equal(rSuffix.status, 206);
    assert.equal(rSuffix.headers.get('Content-Range'), 'bytes 800-999/1000');
    const suffixBytes = new Uint8Array(await rSuffix.arrayBuffer());
    assert.equal(suffixBytes.length, 200);
    assert.equal(suffixBytes[0], 800 % 251);

    const rInvalid1 = await ctx.toRangeResponse(new Request('https://x/a.mp3', { headers: { Range: 'bytes=-0' } }), makeRes());
    assert.equal(rInvalid1.status, 416);

    const rInvalid2 = await ctx.toRangeResponse(new Request('https://x/a.mp3', { headers: { Range: 'bytes=-' } }), makeRes());
    assert.equal(rInvalid2.status, 416);
});


