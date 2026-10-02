'use strict';
/* js/pomodoro.js — uyarı zili (süre dolduğunda) ve ses kilidi için kalıcı
   regresyon testleri. Tarayıcı DOM'u ve Web Audio API elle taklit edilir;
   yeni bağımlılık yok. Çalıştırma: node --test tests/
   (Node'un yerleşik test çalıştırıcısı) */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

const POMODORO = require.resolve('../js/pomodoro.js');

/* ── taklit DOM: elemanlar, document, window ── */
function makeElement(id) {
  return {
    id,
    textContent: '',
    value: '',
    style: {},
    attributes: {},
    listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      (this.listeners.click || []).slice().forEach((fn) => fn({ type: 'click' }));
    }
  };
}

/* ── taklit Web Audio: otomatik oynatma politikası taklidiyle ──
   Gerçek tarayıcıda context dokunuşsuz 'suspended' doğar; yalnız resume()
   onu 'running' yapar ve askıdayken çalınan hiçbir şey duyulmaz. Vuruşlar
   kayda alınır ki test zilin gerçekten "duyulabilir" anda kurulduğunu görsün. */
function makeAudioEnv(broken) {
  const rec = { constructed: 0, resumes: 0, contexts: [] };
  const policy = { gesture: false }; // tarayıcı kuralı: etkileşim yoksa context 'running'a geçmez
  function AudioContextStub() {
    rec.constructed += 1;
    const self = this;
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = { id: 'destination' };
    this.oscillators = [];
    this.gains = [];
    rec.contexts.push(this);
    this.resume = function () { rec.resumes += 1; if (policy.gesture) self.state = 'running'; };
    this.createOscillator = function () {
      const osc = {
        frequency: { value: 0 },
        startedAt: null,
        stoppedAt: null,
        connect(node) { return node; },
        start(when) { osc.startedAt = when; },
        stop(when) { osc.stoppedAt = when; }
      };
      self.oscillators.push(osc);
      return osc;
    };
    this.createGain = function () {
      const gain = {
        gain: {
          value: 0,
          events: [],
          setValueAtTime(v, t) { gain.gain.events.push(['set', v, t]); },
          exponentialRampToValueAtTime(v, t) { gain.gain.events.push(['exp', v, t]); }
        },
        connect(node) { return node; }
      };
      self.gains.push(gain);
      return gain;
    };
  }
  const Ctor = broken
    ? function BrokenAudioContext() { throw new Error('AudioContext yok'); }
    : AudioContextStub;
  return { rec, Ctor, policy };
}

/* ── ortam kurulumu: taklitleri yükler, js/pomodoro.js'i taze örnekler,
   cleanup() tüm global değerleri geri alır. Zamanlayıcılar kayda alınır
   (gerçek setInterval değil) ki süreç asılı kalmasın ve tick elle sürülsün. ── */
function boot(opts = {}) {
  const { saved = null, brokenAudio = false, now = 1790860800000 } = opts;

  const elements = {};
  const documentListeners = {};
  const dispatched = [];
  const timers = [];
  const clock = { now };

  const doc = {
    title: 'Odak',
    getElementById(id) {
      return (elements[id] = elements[id] || makeElement(id));
    },
    addEventListener(type, fn) {
      (documentListeners[type] = documentListeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      documentListeners[type] = (documentListeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent(ev) { dispatched.push(ev); return true; }
  };

  const { rec, Ctor, policy } = makeAudioEnv(brokenAudio);
  const win = {
    FocusStore: S,
    FocusApp: { persist: () => true },
    AudioContext: Ctor,
    addEventListener() {}
  };

  const backing = new Map();
  if (saved) backing.set(S.KEYS.pomodoro, JSON.stringify(saved));

  const prevDesc = (key) => Object.getOwnPropertyDescriptor(globalThis, key);
  const savedDesc = {
    window: prevDesc('window'),
    document: prevDesc('document'),
    CustomEvent: prevDesc('CustomEvent'),
    setInterval: prevDesc('setInterval'),
    localStorage: prevDesc('localStorage')
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  };
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { backing.set(k, String(v)); }
  };
  const realNow = Date.now;
  Date.now = () => clock.now;

  delete require.cache[POMODORO];
  require(POMODORO);
  win.FocusPomodoro.init();

  function cleanup() {
    Date.now = realNow;
    for (const key of Object.keys(savedDesc)) {
      if (savedDesc[key]) Object.defineProperty(globalThis, key, savedDesc[key]);
      else delete globalThis[key];
    }
  }

  return {
    clock,
    cleanup,
    elements,
    rec,
    dispatched,
    // Kullanıcı jesti: politika kilidini açar, sonra olayın dinleyicileri çalışır.
    tap: () => {
      policy.gesture = true;
      (documentListeners.pointerdown || []).slice().forEach((fn) => fn({ type: 'pointerdown' }));
    },
    pressStart: () => {
      policy.gesture = true;
      elements['pomo-start'].click();
    },
    listenerCount: (type) => (documentListeners[type] || []).length,
    tick: () => timers.slice().forEach((t) => t.fn())
  };
}

const runningFocus = (now) => ({
  settings: { focusMin: 25, shortMin: 5, longMin: 15 },
  phase: 'focus',
  focusInCycle: 0,
  running: true,
  remainingMs: 60000,
  endAt: now + 1000
});

/* ── uyarı zili: süre dolduğunda çalar ── */
describe('uyarı zili — süre dolduğunda çalar', () => {
  it('üç vuruşlu zil; ses yolu açıktır, faz geçişi ve duyuru yapılır', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now) });
    try {
      app.tap();        // kullanıcı dokunuşu → ses kilidi açılır
      app.clock.now = now + 1500;    // süre doldu
      app.tick();

      assert.equal(app.rec.contexts.length, 1);
      const ctx = app.rec.contexts[0];
      assert.equal(ctx.state, 'running'); // eski hâl: 'suspended' → sessiz zil

      const osc = ctx.oscillators;
      assert.equal(osc.length, 3);
      assert.deepEqual(osc.map((o) => o.frequency.value), [880, 880, 660]);
      assert.deepEqual(
        osc.map((o) => Math.round((o.stoppedAt - o.startedAt) * 100) / 100),
        [0.3, 0.3, 0.6]
      );
      const starts = osc.map((o) => o.startedAt);
      assert.ok(starts[0] < starts[1] && starts[1] < starts[2], 'vuruşlar art ardadır');

      for (const g of ctx.gains) {
        const ev = g.gain.events;
        assert.equal(ev.length, 2);          // atak + sönüş zarfı
        assert.equal(ev[0][0], 'set');
        assert.ok(ev[0][1] > 0, 'ses düzeyi pozitif');
        assert.equal(ev[1][0], 'exp');
        assert.ok(ev[1][1] > 0 && ev[1][1] < ev[0][1], 'zarf sönerek biter');
        assert.ok(ev[1][2] > ev[0][2], 'sönüş ataktan sonra gelir');
      }

      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-status'].textContent, 'Odak tamamlandı — kısa mola başladı.');
      assert.equal(app.dispatched.length, 1);
      assert.equal(app.dispatched[0].type, 'focus:pomodoro-completed');
    } finally {
      app.cleanup();
    }
  });

  it('mola bitince de zil çalar ve duyuru farklıdır', () => {
    const now = 1790860800000;
    const saved = Object.assign(runningFocus(now), {
      phase: 'short',
      endAt: now + 1000
    });
    const app = boot({ now, saved });
    try {
      app.tap();
      app.clock.now = now + 1500;
      app.tick();

      assert.equal(app.rec.contexts[0].oscillators.length, 3);
      assert.equal(app.elements['pomo-phase'].textContent, 'Odak');
      assert.equal(app.elements['pomo-status'].textContent, 'Mola bitti — odak başladı.');
    } finally {
      app.cleanup();
    }
  });

  it('sayfa kapalıyken tamamlanan fazlar zil çalmaz (sessiz geriye dönüş)', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now - 60000) }); // endAt geçmişte
    try {
      assert.equal(app.rec.contexts.length, 0, 'yükleme anında zil çalmaz');
      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-status'].textContent, '');
    } finally {
      app.cleanup();
    }
  });
});

/* ── ses kilidi: tarayıcı otomatik oynatma politikası ── */
describe('ses kilidi (otomatik oynatma politikası)', () => {
  it('ilk dokunuş ses yolunu açar ve kilitleme tek seferliktir', () => {
    const app = boot();
    try {
      assert.equal(app.rec.contexts.length, 0, 'dokunuşsuz ses yolu kurulmaz');
      assert.equal(app.listenerCount('pointerdown'), 1);
      assert.equal(app.listenerCount('keydown'), 1);

      app.tap();
      assert.equal(app.rec.contexts.length, 1);
      assert.equal(app.rec.contexts[0].state, 'running');
      assert.equal(app.rec.resumes, 1);

      assert.equal(app.listenerCount('pointerdown'), 0, 'kilitleme tek seferliktir');
      assert.equal(app.listenerCount('keydown'), 0);

      app.tap();                 // dinleyici kalktı: sorun yok
      assert.equal(app.rec.contexts.length, 1, 'yeni context açılmaz');
    } finally {
      app.cleanup();
    }
  });

  it('"Başlat"a basmak da sesi açar (buton yolu)', () => {
    const app = boot();
    try {
      app.pressStart();
      assert.equal(app.rec.contexts.length, 1);
      assert.equal(app.rec.contexts[0].state, 'running');
      assert.equal(app.elements['pomo-start'].textContent, 'Duraklat');
    } finally {
      app.cleanup();
    }
  });
});

/* ── ses altyapısı yoksa akış bozulmaz ── */
describe('ses altyapısı yoksa akış bozulmaz', () => {
  it('AudioContext kurulamasa bile faz tamamlanır, sessiz devam edilir', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now), brokenAudio: true });
    try {
      app.tap();     // hata yutulur, sayfa çalışmaya devam eder
      app.clock.now = now + 1500;
      app.tick();                  // fırlatmamalı

      assert.equal(app.rec.contexts.length, 0);
      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-status'].textContent, 'Odak tamamlandı — kısa mola başladı.');
    } finally {
      app.cleanup();
    }
  });
});