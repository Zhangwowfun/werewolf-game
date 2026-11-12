const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const GAME_TEXT_PATH = path.join(ROOT, 'content', 'game-text.md');
const SW_PATH = path.join(ROOT, 'sw.js');

function extractAllScripts(html) {
    const tagRegex = /<script(?:\s+src="([^"]+)")?>([\s\S]*?)<\/script>/g;
    const chunks = [];
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        if (match[1]) {
            const scriptPath = path.resolve(ROOT, match[1]);
            chunks.push(fs.readFileSync(scriptPath, 'utf8'));
        } else {
            chunks.push(match[2]);
        }
    }
    assert.ok(chunks.length >= 1, 'index.html should contain game scripts');
    return chunks.join('\n;\n');
}

function createHarness({ hangAudio = false } = {}) {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const scriptCode = extractAllScripts(html);
    const mdText = fs.readFileSync(GAME_TEXT_PATH, 'utf8');

    const storage = new Map();
    const alerts = [];
    const spoken = [];
    const timers = new Map();
    let nextTimerId = 1;

    function makeElement(id = '') {
        return {
            id,
            offsetWidth: 400,
            innerHTML: '',
            textContent: '',
            value: '',
            disabled: false,
            className: '',
            dataset: {},
            style: {
                cssText: '',
                setProperty(k, v) { this[k] = v; }
            },
            classList: {
                _set: new Set(),
                add(...cls) { cls.forEach(c => this._set.add(c)); },
                remove(...cls) { cls.forEach(c => this._set.delete(c)); },
                toggle(c, force) {
                    if (force === undefined) {
                        if (this._set.has(c)) { this._set.delete(c); return false; }
                        this._set.add(c); return true;
                    }
                    if (force) this._set.add(c); else this._set.delete(c);
                    return Boolean(force);
                },
                contains(c) { return this._set.has(c); }
            },
            children: [],
            parentNode: { insertBefore() {} },
            appendChild(child) { this.children.push(child); return child; },
            remove() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 }; }
        };
    }

    const elements = new Map();
    function getEl(id) {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
    }

    let nameInputs = [];
    let genderButtons = [];

    const containerEl = makeElement('name-inputs');
    containerEl.appendChild = function (row) {
        this.children.push(row);
        const genderMatch = row.innerHTML.match(/data-index="(\d+)"\s+data-gender="([^"]+)"/);
        const valueMatch = row.innerHTML.match(/value="([^"]*)"/);
        const idx = genderMatch ? Number(genderMatch[1]) : nameInputs.length;
        const gBtn = makeElement(`gender-${idx}`);
        gBtn.dataset.index = String(idx);
        gBtn.dataset.gender = genderMatch ? genderMatch[2] : 'male';
        gBtn.textContent = gBtn.dataset.gender === 'female' ? 'F' : 'M';
        const nInput = makeElement(`name-${idx}`);
        nInput.dataset.index = String(idx);
        const rawAttrVal = valueMatch ? valueMatch[1] : `玩家${idx + 1}`;
        nInput.value = rawAttrVal
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
        genderButtons.push(gBtn);
        nameInputs.push(nInput);
        return row;
    };
    Object.defineProperty(containerEl, 'innerHTML', {
        get() { return this._html || ''; },
        set(v) {
            this._html = v;
            if (v === '') {
                this.children = [];
                nameInputs = [];
                genderButtons = [];
            }
        }
    });
    elements.set('name-inputs', containerEl);

    class FakeAudio {
        constructor() {
            this.src = '';
            this.paused = true;
            this.ended = false;
            this.onended = null;
            this.onerror = null;
        }
        pause() {
            this.paused = true;
        }
        play() {
            this.paused = false;
            spoken.push({ type: 'audio', src: this.src });
            if (!hangAudio) {
                const self = this;
                const id = nextTimerId++;
                timers.set(id, {
                    type: 'timeout',
                    remainingMs: 50,
                    periodMs: 50,
                    fn: () => {
                        self.paused = true;
                        self.ended = true;
                        if (typeof self.onended === 'function') self.onended();
                    }
                });
            }
            return Promise.resolve();
        }
    }

    class FakeUtterance {
        constructor(text) {
            this.text = text;
            this.onend = null;
            this.onerror = null;
        }
    }

    const speechSynthesis = {
        cancel() {},
        speak(utterance) {
            spoken.push({ type: 'tts', text: utterance.text });
            if (!hangAudio) {
                const id = nextTimerId++;
                timers.set(id, {
                    type: 'timeout',
                    remainingMs: 50,
                    periodMs: 50,
                    fn: () => {
                        if (typeof utterance.onend === 'function') utterance.onend();
                    }
                });
            }
        }
    };

    const document = {
        getElementById(id) { return getEl(id); },
        createElement(tag) { return makeElement(tag); },
        querySelector(sel) {
            if (sel === '#screen-home .home-buttons') return getEl('home-buttons');
            if (sel === '#screen-privilege .bottom-bar') return getEl('screen-privilege-bottom');
            return getEl(sel);
        },
        querySelectorAll(sel) {
            if (sel === '.name-input') return nameInputs;
            if (sel === '.gender-toggle') return genderButtons;
            return [];
        },
        addEventListener() {}
    };

    const localStorage = {
        getItem(k) { return storage.has(k) ? storage.get(k) : null; },
        setItem(k, v) { storage.set(k, String(v)); },
        removeItem(k) { storage.delete(k); }
    };

    const sandbox = {
        console,
        Math,
        JSON,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Boolean,
        RegExp,
        Promise,
        Uint32Array,
        crypto: require('node:crypto').webcrypto,
        document,
        localStorage,
        Image: class FakeImage { constructor() { this.src = ''; } },
        Audio: FakeAudio,
        SpeechSynthesisUtterance: FakeUtterance,
        navigator: {
            onLine: true,
            wakeLock: { request: () => Promise.resolve({ release: () => Promise.resolve() }) }
        },
        alert(msg) { alerts.push(msg); },
        confirm() { return true; },
        fetch() {
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(mdText)
            });
        },
        setInterval(fn, ms) {
            const id = nextTimerId++;
            timers.set(id, { type: 'interval', remainingMs: ms, periodMs: ms, fn });
            return id;
        },
        clearInterval(id) { timers.delete(id); },
        setTimeout(fn, ms) {
            const id = nextTimerId++;
            timers.set(id, { type: 'timeout', remainingMs: ms, periodMs: ms, fn });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        addEventListener() {},
        removeEventListener() {}
    };
    sandbox.window = sandbox;
    sandbox.window.speechSynthesis = speechSynthesis;

    vm.createContext(sandbox);
    vm.runInContext(scriptCode, sandbox, { filename: 'index.html' });

    sandbox.__get = (expr) => vm.runInContext(expr, sandbox);
    sandbox.__exec = (code) => vm.runInContext(code, sandbox);

    function advanceTime(totalMs) {
        let elapsed = 0;
        const step = 50;
        while (elapsed < totalMs) {
            elapsed += step;
            for (const [id, entry] of [...timers.entries()]) {
                if (!timers.has(id)) continue;
                entry.remainingMs -= step;
                if (entry.remainingMs <= 0) {
                    if (entry.type === 'timeout') {
                        timers.delete(id);
                        entry.fn();
                    } else {
                        entry.remainingMs = entry.periodMs;
                        entry.fn();
                    }
                }
            }
        }
    }

    sandbox.renderNameInputs();
    sandbox.parseGameTextMarkdown(mdText);

    return {
        html,
        mdText,
        sandbox,
        getEl,
        alerts,
        spoken,
        storage,
        advanceTime,
        getNameInputs: () => nameInputs,
        getGenderButtons: () => genderButtons
    };
}

module.exports = { ROOT, INDEX_PATH, GAME_TEXT_PATH, SW_PATH, createHarness };
