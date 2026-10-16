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
    checked: false,
    style: {},
    attributes: {},
    listeners: {},
    // js/pomodoro.js renderDisplay(), `#pomo-time` görünürlüğünü .visually-hidden
    // sınıfıyla değiştirir (kadran modunda dijital metin erişilebilir kalır).
    classList: {
      _has: {},
      toggle(name, force) {
        const on = force === undefined ? !this._has[name] : !!force;
        if (on) this._has[name] = true; else delete this._has[name];
      },
      contains(name) { return !!this._has[name]; }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      this.checked = !this.checked; // gerçek DOM: tıklama kutuyu çevirir
      (this.listeners.change || []).slice().forEach((fn) => fn({ type: 'change', target: this }));
      (this.listeners.click || []).slice().forEach((fn) => fn({ type: 'click', target: this }));
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
    FocusApp: { persist: (key, value) => S.save(key, value) }, // js/app.js persist gövdesi (uyarı DOM'u hariç)
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
      assert.equal(app.elements['pomo-status'].textContent, 'Odak tamamlandı — kısa mola sırada. Başlat ile başlatın.');
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
      assert.equal(app.elements['pomo-status'].textContent, 'Mola bitti — odak sırada. Başlat ile başlatın.');
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
      assert.equal(app.elements['pomo-status'].textContent, 'Odak tamamlandı — kısa mola sırada. Başlat ile başlatın.');
    } finally {
      app.cleanup();
    }
  });
});

/* ── zil sesi açma/kapama (sessize alma) ── */
describe('zil sesi açma/kapama', () => {
  it('eski kayıtlarda alan yoksa zil sesi varsayılan açıktır ve durum görünür', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now) }); // settings.bellSound alanı yok
    try {
      assert.equal(app.elements['pomo-sound'].checked, true);
      assert.equal(app.elements['pomo-sound-state'].textContent, 'Açık');
    } finally {
      app.cleanup();
    }
  });

  it('paneldeki anahtar tercihi değiştirir, durumu gösterir ve FocusStorea yazar', () => {
    const app = boot();
    try {
      app.elements['pomo-sound'].click(); // kapat
      assert.equal(app.elements['pomo-sound'].checked, false);
      assert.equal(app.elements['pomo-sound-state'].textContent, 'Kapalı');
      assert.equal(S.load(S.KEYS.pomodoro, null).settings.bellSound, false);

      app.elements['pomo-sound'].click(); // aç
      assert.equal(app.elements['pomo-sound'].checked, true);
      assert.equal(app.elements['pomo-sound-state'].textContent, 'Açık');
      assert.equal(S.load(S.KEYS.pomodoro, null).settings.bellSound, true);
    } finally {
      app.cleanup();
    }
  });

  it('sessizde zil çalmaz; faz tamamlanır, duyuru ve olay sürer', () => {
    const now = 1790860800000;
    const saved = runningFocus(now);
    saved.settings = Object.assign({}, saved.settings, { bellSound: false });
    const app = boot({ now, saved });
    try {
      app.tap();                 // jest bile sessizde ses yolu kurmaz
      app.clock.now = now + 1500;
      app.tick();

      assert.equal(app.rec.contexts.length, 0, 'sessizde jest bile ses yolu kurulmaz');
      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-status'].textContent, 'Odak tamamlandı — kısa mola sırada. Başlat ile başlatın.');
      assert.equal(app.dispatched.length, 1);
    } finally {
      app.cleanup();
    }
  });

  it('kayıtlı sessiz tercihi yeniden yüklemede korunur', () => {
    const now = 1790860800000;
    const saved = runningFocus(now);
    saved.settings = Object.assign({}, saved.settings, { bellSound: false });
    const app = boot({ now, saved });
    try {
      assert.equal(app.elements['pomo-sound'].checked, false);
      assert.equal(app.elements['pomo-sound-state'].textContent, 'Kapalı');
    } finally {
      app.cleanup();
    }
  });

  it('sessizde "Başlat"a basmak da ses yolu kurmaz', () => {
    const now = 1790860800000;
    const saved = runningFocus(now);
    saved.running = false;
    saved.endAt = null;
    saved.settings = Object.assign({}, saved.settings, { bellSound: false });
    const app = boot({ now, saved });
    try {
      app.pressStart();
      assert.equal(app.rec.contexts.length, 0, 'sessizde Başlat ses yolu kurmaz');
      assert.equal(app.elements['pomo-start'].textContent, 'Duraklat');
    } finally {
      app.cleanup();
    }
  });

  it('sessizden açılınca sonraki sürede zil yeniden çalar', () => {
    const now = 1790860800000;
    const saved = runningFocus(now);
    saved.settings = Object.assign({}, saved.settings, { bellSound: false });
    const app = boot({ now, saved });
    try {
      app.tap();                 // jest ama ses yolu sessizde kurulmaz
      app.clock.now = now + 1500;
      app.tick();                // 1. tamamlanma: sessiz
      assert.equal(app.rec.contexts.length, 0, 'sessizde jest bile ses yolu kurulmaz');

      app.elements['pomo-sound'].click(); // zil sesini aç: jest içinde ses yolu kurulur
      assert.equal(app.rec.contexts.length, 1);
      assert.equal(app.rec.contexts[0].oscillators.length, 0, 'açmak tek başına zil çaldırmaz');

      app.pressStart();          // elle geçiş: mola yalnızca kullanıcı başlatınca çalışır
      assert.equal(app.elements['pomo-start'].textContent, 'Duraklat');

      app.clock.now = now + 302000;
      app.tick();                // 2. tamamlanma (elle başlatılan mola bitti): zil çalar
      assert.equal(app.rec.contexts[0].oscillators.length, 3);
    } finally {
      app.cleanup();
    }
  });
});

/* ── elle faz geçişi: süre bitince sıradaki faz otomatik başlamaz ── */
describe('elle faz geçişi — otomatik başlama yok', () => {
  it('odak bitince mola hazır bekler; Başlat bastırılmadan ekstra tick fazı ilerletmez', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now) });
    try {
      app.tap();                 // zil duyulsun diye ses yolu açılır
      app.clock.now = now + 1500;
      app.tick();                // odak biter

      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat', 'sıradaki faz çalışmaz, Başlat bekler');
      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.running, false, 'sayaç tamamlanınca durur');
      assert.equal(st.endAt, null);
      assert.equal(st.phase, 'short');
      assert.equal(st.remainingMs, 5 * 60000, 'mola tam süresiyle hazır bekler');

      const oscBefore = app.rec.contexts[0].oscillators.length;
      app.clock.now = now + 3600000;  // 1 saat sonra; kullanıcı başlatmadı
      app.tick();
      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola', 'mola otomatik başlamaz');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');
      assert.equal(app.rec.contexts[0].oscillators.length, oscBefore, 'ekstra tick zil çaldırmaz');
    } finally {
      app.cleanup();
    }
  });

  it('mola bitince odak hazır bekler; mola tamamlanması zinciri işaretlemez', () => {
    const now = 1790860800000;
    const saved = Object.assign(runningFocus(now), { phase: 'short', endAt: now + 1000 });
    const app = boot({ now, saved });
    try {
      app.tap();
      app.clock.now = now + 1500;
      app.tick();

      assert.equal(app.elements['pomo-phase'].textContent, 'Odak');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');
      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.running, false);
      assert.equal(st.phase, 'focus');
      assert.equal(st.remainingMs, 25 * 60000);
      assert.equal(app.dispatched.length, 0, 'mola tamamlanması günü işaretlemez');
    } finally {
      app.cleanup();
    }
  });

  it('Başlat ile mola çalışır; bitince odak yine bekler (elle döngü)', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now) });
    try {
      app.tap();
      app.clock.now = now + 1500;
      app.tick();                // odak biter → mola hazır, bekler

      app.pressStart();          // kullanıcı molayı başlatır
      assert.equal(app.elements['pomo-start'].textContent, 'Duraklat');

      app.clock.now = now + 1500 + 5 * 60000 + 1000;
      app.tick();                // mola biter → odak hazır, bekler
      assert.equal(app.elements['pomo-phase'].textContent, 'Odak');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');
      assert.equal(S.load(S.KEYS.pomodoro, null).running, false);
      assert.equal(app.elements['pomo-status'].textContent, 'Mola bitti — odak sırada. Başlat ile başlatın.');
    } finally {
      app.cleanup();
    }
  });
});

/* ── elle faz seçimi: Odak / Kısa mola / Uzun mola düğmeleri ── */
describe('faz seçimi — kullanıcı fazı elle değiştirebilir', () => {
  const pressed = (app, phase) =>
    app.elements['pomo-phase-' + phase].attributes['aria-pressed'];

  it('açılışta seçici güncel fazı işaret eder (varsayılan: Odak)', () => {
    const app = boot();
    try {
      assert.equal(pressed(app, 'focus'), 'true');
      assert.equal(pressed(app, 'short'), 'false');
      assert.equal(pressed(app, 'long'), 'false');
    } finally {
      app.cleanup();
    }
  });

  it('duraklatılmış sayaçta faz değişir: tam süre yüklenir, kalıcılaşır, duyurulur', () => {
    const app = boot();
    try {
      app.elements['pomo-phase-short'].click();

      assert.equal(app.elements['pomo-phase'].textContent, 'Kısa mola');
      assert.equal(app.elements['pomo-time'].textContent, '05:00');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');
      assert.equal(app.elements['pomo-status'].textContent, 'Kısa mola seçildi. Başlat ile başlatın.');
      assert.equal(pressed(app, 'focus'), 'false');
      assert.equal(pressed(app, 'short'), 'true');

      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.phase, 'short');
      assert.equal(st.remainingMs, 5 * 60000);
      assert.equal(st.running, false);
      assert.equal(st.endAt, null);
    } finally {
      app.cleanup();
    }
  });

  it('çalışan odak bölünür: sayaç durur, döngü sayacı korunur, zincir işaretlenmez', () => {
    const now = 1790860800000;
    const saved = Object.assign(runningFocus(now), { focusInCycle: 2 });
    const app = boot({ now, saved });
    try {
      app.tap();
      app.elements['pomo-phase-long'].click();

      assert.equal(app.elements['pomo-phase'].textContent, 'Uzun mola');
      assert.equal(app.elements['pomo-time'].textContent, '15:00');
      assert.equal(app.elements['pomo-cycle'].textContent, 'Döngü 3/4', 'elle seçim odak saymaz');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');

      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.running, false, 'çalışan sayaç faz seçimiyle durur');
      assert.equal(st.endAt, null);
      assert.equal(st.phase, 'long');
      assert.equal(st.remainingMs, 15 * 60000);
      assert.equal(st.focusInCycle, 2);
      assert.equal(app.dispatched.length, 0, 'yarım kalan odak zinciri işaretlemez');
    } finally {
      app.cleanup();
    }
  });

  it('aynı faz seçimi no-op: çalışan sayaç da duraklatılmış ilerleme de bozulmaz', () => {
    const now = 1790860800000;
    const app = boot({ now, saved: runningFocus(now) });
    try {
      app.elements['pomo-phase-focus'].click();

      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.running, true);
      assert.equal(st.endAt, now + 1000);
      assert.equal(app.elements['pomo-status'].textContent, '');
    } finally {
      app.cleanup();
    }

    // Duraklatılmış ilerleme de korunur: yarılanmış odak tam süreye dönmez.
    const paused = boot({
      now,
      saved: {
        settings: { focusMin: 25, shortMin: 5, longMin: 15 },
        phase: 'focus', focusInCycle: 0, running: false,
        remainingMs: 60000, endAt: null
      }
    });
    try {
      paused.elements['pomo-phase-focus'].click();
      assert.equal(paused.elements['pomo-time'].textContent, '01:00', 'kalan süre sıfırlanmaz');
      assert.equal(S.load(S.KEYS.pomodoro, null).remainingMs, 60000);
      assert.equal(paused.elements['pomo-status'].textContent, '');
    } finally {
      paused.cleanup();
    }
  });

  it('seçilen faz Başlat ile tam süresiyle çalışır; bitince odak yine bekler', () => {
    const now = 1790860800000;
    const app = boot({ now });
    try {
      app.tap();
      app.elements['pomo-phase-short'].click();
      app.pressStart();

      assert.equal(app.elements['pomo-start'].textContent, 'Duraklat');
      const running = S.load(S.KEYS.pomodoro, null);
      assert.equal(running.running, true);
      assert.equal(running.endAt, now + 5 * 60000, 'mola tam süresiyle başlar');

      app.clock.now = now + 5 * 60000 + 250;
      app.tick();                // mola biter → odak hazır, bekler

      assert.equal(app.elements['pomo-phase'].textContent, 'Odak');
      assert.equal(app.elements['pomo-start'].textContent, 'Başlat');
      assert.equal(pressed(app, 'focus'), 'true', 'seçici otomatik geçişi de yansıtır');
      assert.equal(app.dispatched.length, 0, 'mola bitiş zinciri işaretlemez');
    } finally {
      app.cleanup();
    }
  });
});

describe('saat görünümü — dijital/kadran seçimi', () => {
  it('varsayılan dijital: kadran gizli, dijital metin görünür; seçici dijitali işaretli', () => {
    const app = boot({});
    try {
      assert.ok('hidden' in app.elements['pomo-dial'].attributes, 'varsayılan modda kadran gizli olmalı');
      assert.equal(app.elements['pomo-time'].classList.contains('visually-hidden'), false,
        'dijital metin varsayılan modda gizlenmez');
      assert.equal(app.elements['pomo-display-digital'].attributes['aria-pressed'], 'true');
      assert.equal(app.elements['pomo-display-dial'].attributes['aria-pressed'], 'false');
    } finally {
      app.cleanup();
    }
  });

  it('Kadran seçimi kadranı gösterir, dijitali erişilebilir biçimde gizler ve kalıcılaşır', () => {
    const app = boot({});
    try {
      app.elements['pomo-display-dial'].click();

      const st = S.load(S.KEYS.pomodoro, null);
      assert.equal(st.settings.displayMode, 'dial', 'görünüm ayarı kalıcılaşmadı');
      assert.ok(!('hidden' in app.elements['pomo-dial'].attributes), 'kadran gösterilmedi');
      assert.equal(app.elements['pomo-time'].classList.contains('visually-hidden'), true,
        'dijital metin kadran modunda görünmez olmalı');
      assert.equal(app.elements['pomo-display-dial'].attributes['aria-pressed'], 'true');
      assert.equal(app.elements['pomo-display-digital'].attributes['aria-pressed'], 'false');
    } finally {
      app.cleanup();
    }
  });

  it('kayıtlı kadran modu yeniden yüklenir; Dijital seçimi geri döndürür', () => {
    const app = boot({
      saved: {
        settings: { focusMin: 25, shortMin: 5, longMin: 15, displayMode: 'dial' },
        phase: 'focus', focusInCycle: 0, running: false, remainingMs: 25 * 60000, endAt: null
      }
    });
    try {
      assert.ok(!('hidden' in app.elements['pomo-dial'].attributes), 'kayıtlı kadran modu geri yüklenmedi');
      assert.equal(app.elements['pomo-time'].classList.contains('visually-hidden'), true);

      app.elements['pomo-display-digital'].click();
      assert.equal(S.load(S.KEYS.pomodoro, null).settings.displayMode, 'digital');
      assert.ok('hidden' in app.elements['pomo-dial'].attributes);
      assert.equal(app.elements['pomo-time'].classList.contains('visually-hidden'), false);
    } finally {
      app.cleanup();
    }
  });

  it('kadran modunda render kolları ve halka offsetini kalan süreden hesaplar', () => {
    const now = 1790860800000;
    const app = boot({
      now,
      saved: {
        settings: { focusMin: 25, shortMin: 5, longMin: 15, displayMode: 'dial' },
        phase: 'focus', focusInCycle: 0, running: true,
        remainingMs: 25 * 60000, endAt: now + 25 * 60000
      }
    });
    try {
      // Başlangıç: kalan %100 → iki kol da 12 yönünde (0°), halka dolu (offset 0).
      assert.equal(app.elements['pomo-dial-min'].attributes['transform'], 'rotate(0.0 60 60)');
      assert.equal(app.elements['pomo-dial-sec'].attributes['transform'], 'rotate(0.0 60 60)');
      assert.equal(app.elements['pomo-dial-ring'].style.strokeDashoffset, '0.0');

      // 5 dk geçti: kalan 20:00/25:00 → akrep 72° (saat yönü), saniye 12'de,
      // halka kalan oranı gösterir (offset = Çevre·elapsed oranı).
      app.clock.now = now + 5 * 60000;
      app.tick();
      assert.equal(app.elements['pomo-dial-min'].attributes['transform'], 'rotate(72.0 60 60)');
      assert.equal(app.elements['pomo-dial-sec'].attributes['transform'], 'rotate(0.0 60 60)');
      assert.equal(app.elements['pomo-dial-ring'].style.strokeDashoffset, '59.1');
    } finally {
      app.cleanup();
    }
  });
});
