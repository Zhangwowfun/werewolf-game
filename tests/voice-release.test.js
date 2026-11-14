const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./test-harness.js');

for (const [slot, ordinal] of [[1, '一'], [2, '二']]) {
    test(`新语音发布：${ordinal}号女巫录音加载失败仍播报正确编号`, () => {
        const h = createHarness();
        h.sandbox.speakWitchTurnVoice({ witchOrder: slot }, 2);
        const audio = h.sandbox.ensureGodVoiceAudio();
        assert.equal(audio.src, `audio/god/witchAction_${slot}.mp3`);
        assert.equal(typeof audio.onerror, 'function');
        audio.onerror();
        assert.ok(h.spoken.some(item => item.type === 'tts'
            && item.text.includes(`${ordinal}号女巫请睁眼`)));
    });
}

test('新语音发布：入夜首段缓冲覆盖最长闭眼播报', () => {
    const h = createHarness({ hangAudio: true });
    h.sandbox.selectPlayerCount(6);
    h.sandbox.setupGame();
    h.sandbox.startNightPhase();
    h.advanceTime(9500);
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'nightPrelude');
    h.advanceTime(500);
    assert.equal(h.sandbox.__get('gameState.resumeView.key'), 'nightRole');
    assert.equal(h.sandbox.__get('gameState.nightRoleNextAction'), 'afterProphet');
});

test('新语音发布：已切换阶段的旧录音错误不能重播上一位女巫', () => {
    const h = createHarness();
    h.sandbox.speakWitchTurnVoice({ witchOrder: 1 }, 2);
    const staleError = h.sandbox.ensureGodVoiceAudio().onerror;
    h.sandbox.speakWitchTurnVoice({ witchOrder: 2 }, 2);
    staleError();
    assert.equal(h.spoken.filter(item => item.type === 'tts').length, 0);
});
