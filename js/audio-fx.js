// 零体积 WebAudio 合成音效引擎：试音钟声、暗夜篝火心跳音、倒计时铜锣闪屏与计次音效

let partyAudioCtx = null;
let nightAmbienceNodes = null;
let nightHeartbeatTimer = null;
let ambienceEnabled = getStoredAmbiencePref();

function getStoredAmbiencePref() {
    try {
        if (typeof localStorage === 'undefined') return true;
        return localStorage.getItem('werewolf-ambience-sound') !== 'off';
    } catch (e) {
        return true;
    }
}

function setStoredAmbiencePref(enabled) {
    ambienceEnabled = Boolean(enabled);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('werewolf-ambience-sound', ambienceEnabled ? 'on' : 'off');
        }
    } catch (e) { /* 忽略不可用存储 */ }
}

function getPartyAudioContext() {
    if (typeof window === 'undefined') return null;
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
        try { navigator.audioSession.type = 'playback'; } catch (e) { /* 旧版忽略 */ }
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!partyAudioCtx) {
        try {
            partyAudioCtx = new Ctor();
        } catch (e) {
            return null;
        }
    }
    if ((partyAudioCtx.state === 'suspended' || partyAudioCtx.state === 'interrupted')
        && typeof partyAudioCtx.resume === 'function') {
        partyAudioCtx.resume().catch(() => {});
    }
    return partyAudioCtx;
}

function playSoundCheckBell() {
    const ctx = getPartyAudioContext();
    if (!ctx) return false;
    try {
        const now = ctx.currentTime;
        const freqs = [528, 792, 1056];
        freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = idx === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.18 / (idx + 1), now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.35 - idx * 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.4);
        });
        return true;
    } catch (e) {
        return false;
    }
}

function playCountdownGong() {
    triggerGongFlash();
    const ctx = getPartyAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        [196, 294, 392, 587].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.96, now + 1.5);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.24 / (idx + 1), now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 1.65);
        });
    } catch (e) { /* 静音降级 */ }
}

function triggerGongFlash() {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('app-root');
    if (!root || !root.classList) return;
    root.classList.remove('gong-flash');
    void root.offsetWidth;
    root.classList.add('gong-flash');
    setTimeout(() => {
        if (root && root.classList) root.classList.remove('gong-flash');
    }, 1300);
}

function playCounterTapSound(completed = false) {
    const ctx = getPartyAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(completed ? 880 : 620, now);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (completed ? 0.35 : 0.09));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (completed ? 0.38 : 0.1));
    } catch (e) { /* 静音降级 */ }
}

function playShortTickSound() {
    const ctx = getPartyAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
    } catch (e) { /* 静音降级 */ }
}

function pulseHeartbeatOnce(ctx, masterGain) {
    if (!ctx || !masterGain) return;
    try {
        const now = ctx.currentTime;
        [0, 0.24].forEach((offset, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(idx === 0 ? 58 : 48, now + offset);
            osc.frequency.exponentialRampToValueAtTime(32, now + offset + 0.18);
            gain.gain.setValueAtTime(0.001, now + offset);
            gain.gain.linearRampToValueAtTime(idx === 0 ? 0.09 : 0.06, now + offset + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + offset);
            osc.stop(now + offset + 0.22);
        });
    } catch (e) { /* 忽略 */ }
}

function startNightAmbience() {
    if (!ambienceEnabled) return;
    const ctx = getPartyAudioContext();
    if (!ctx || nightAmbienceNodes) return;
    try {
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.14, ctx.currentTime);
        masterGain.connect(ctx.destination);

        // 生成2秒柔和篝火粉红底噪循环，掩盖夜间手指触屏和放设备的细微声响
        const sampleRate = ctx.sampleRate || 44100;
        const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        for (let i = 0; i < data.length; i++) {
            const white = ((i * 9301 + 49297) % 233280) / 233280 * 2 - 1;
            b0 = 0.99 * b0 + white * 0.05;
            b1 = 0.96 * b1 + white * 0.08;
            const crackle = (i % 7919 === 0) ? 0.16 : 0;
            data[i] = (b0 + b1 + crackle) * 0.18;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, ctx.currentTime);
        noise.connect(filter);
        filter.connect(masterGain);
        noise.start();

        nightAmbienceNodes = { noise, filter, masterGain };
        pulseHeartbeatOnce(ctx, masterGain);
        nightHeartbeatTimer = setInterval(() => {
            if (!nightAmbienceNodes) return;
            pulseHeartbeatOnce(ctx, nightAmbienceNodes.masterGain);
        }, 1250);
    } catch (e) {
        stopNightAmbience();
    }
}

function duckNightAmbience(ducked) {
    if (!nightAmbienceNodes || !partyAudioCtx) return;
    try {
        const target = ducked ? 0.035 : 0.14;
        nightAmbienceNodes.masterGain.gain.setTargetAtTime(target, partyAudioCtx.currentTime, 0.12);
    } catch (e) { /* 忽略 */ }
}

function stopNightAmbience() {
    if (nightHeartbeatTimer) {
        clearInterval(nightHeartbeatTimer);
        nightHeartbeatTimer = null;
    }
    if (nightAmbienceNodes) {
        try { nightAmbienceNodes.noise.stop(); } catch (e) { /* 忽略 */ }
        try { nightAmbienceNodes.masterGain.disconnect(); } catch (e) { /* 忽略 */ }
        nightAmbienceNodes = null;
    }
}

function toggleAmbienceSound() {
    setStoredAmbiencePref(!ambienceEnabled);
    updateAmbienceToggleUI();
    if (ambienceEnabled) {
        playSoundCheckBell();
        if (typeof gameState !== 'undefined' && gameState.phase === PHASE.NIGHT) {
            startNightAmbience();
        }
    } else {
        stopNightAmbience();
    }
}

function updateAmbienceToggleUI() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('ambience-sound-toggle');
    if (btn) {
        btn.textContent = ambienceEnabled ? '夜间篝火心跳背景音：开启' : '夜间篝火心跳背景音：关闭';
    }
}
