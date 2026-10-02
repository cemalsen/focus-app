/* Pomodoro geri sayım aracı.
   Saf faz/süre mantığı FocusStore'da; burada DOM, zamanlama ve kalıcılık var.
   Zaman ölçümü duvara saate (endAt damgası) dayanır; sekme arka planda
   yavaşlasa ya da makine uyusa bile geri sayım şaşmaz. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var BASE_TITLE = document.title;
  var TICK_MS = 250;

  var els = {};
  var state = null;
  var ticker = null;
  var audioCtx = null;

  function defaultState() {
    return {
      settings: { focusMin: 25, shortMin: 5, longMin: 15 },
      phase: 'focus',            // 'focus' | 'short' | 'long'
      focusInCycle: 0,           // döngü içinde tamamlanan odak sayısı (0..3)
      running: false,
      remainingMs: 25 * 60000,
      endAt: null
    };
  }

  function loadState() {
    var saved = S.load(S.KEYS.pomodoro, null);
    if (!saved || typeof saved !== 'object') return defaultState();
    var st = Object.assign(defaultState(), saved);
<<<<<<< HEAD
=======
    // Ayarlar alan alan birleştirilir; bozuk/güncellenmiş kayıt varsayılanı düşürür.
    st.settings = Object.assign(defaultState().settings,
      saved.settings && typeof saved.settings === 'object' ? saved.settings : {});
    if (st.phase !== 'focus' && st.phase !== 'short' && st.phase !== 'long') st.phase = 'focus';
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    st.settings.focusMin = S.clampMinutes(st.settings.focusMin, 1, 180, 25);
    st.settings.shortMin = S.clampMinutes(st.settings.shortMin, 1, 60, 5);
    st.settings.longMin = S.clampMinutes(st.settings.longMin, 1, 90, 15);
    if (st.running && st.endAt) {
      // Sayfa kapalıyken geçen süre: fazları peş peşe tamamlanmış say.
      var guard = 0;
      while (st.running && st.endAt != null && st.endAt <= Date.now() && guard++ < 32) {
        st = applyCompletion(st);
      }
    } else {
      st.running = false;
      st.endAt = null;
    }
    return st;
  }

  function persist() {
    return window.FocusApp.persist(S.KEYS.pomodoro, state);
  }

  /* Bir faz bitince: sayaç artar, sıradaki fase geçilir. Dönen değer yeni durumdur. */
  function applyCompletion(st) {
    var finished = st.phase;
    if (finished === 'focus') {
      st.focusInCycle += 1;
      st.phase = S.breakAfter(st.focusInCycle);
      if (st.focusInCycle >= S.CYCLE_LEN) st.focusInCycle = 0;
    } else {
      st.phase = 'focus';
    }
    st.remainingMs = S.phaseMinutes(st.phase, st.settings) * 60000;
<<<<<<< HEAD
    if (st.running) st.endAt = Date.now() + st.remainingMs;
=======
    // Sonraki bitiş bir önceki bitişe zincirlenir; Date.now()'a sabitlenirse
    // uyku/sekme yavaşlaması sonrası bekleyen fazlar tek tek düşer.
    if (st.running) st.endAt = (st.endAt || Date.now()) + st.remainingMs;
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    return st;
  }

  var PHASE_LABEL = { focus: 'Odak', short: 'Kısa mola', long: 'Uzun mola' };

  function render() {
    var totalMs = S.phaseMinutes(state.phase, state.settings) * 60000;
    var remainingMs = state.running && state.endAt
      ? Math.max(0, state.endAt - Date.now())
      : state.remainingMs;
    var secs = Math.ceil(remainingMs / 1000);

    els.time.textContent = S.formatClock(secs);
    els.phase.textContent = PHASE_LABEL[state.phase];
    // Moladayken de sıradaki odak numarası gösterilir (bir önceki odak değil).
    var cycleNo = state.focusInCycle + 1;
    els.cycle.textContent = 'Döngü ' + cycleNo + '/' + S.CYCLE_LEN;
    els.bar.style.width = (totalMs > 0 ? (100 * (totalMs - remainingMs)) / totalMs : 0) + '%';
    els.start.textContent = state.running ? 'Duraklat' : 'Başlat';
    els.start.setAttribute('aria-label', state.running ? 'Sayacı duraklat' : 'Sayacı başlat');

    document.title = state.running
      ? S.formatClock(secs) + ' · ' + PHASE_LABEL[state.phase] + ' — Odak'
      : BASE_TITLE;
  }

  function announce(msg) {
    els.status.textContent = msg;
  }

<<<<<<< HEAD
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
=======
  /* Ses yolu kullanıcı etkileşimi içinde hazır olmalı: tarayıcıların otomatik
     oynatma politikası dokunuşsuz açılan AudioContext'i askıya alır ve zil
     sessiz kalır. */
  function ensureAudio() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    } catch (e) {
      /* ses yoksa sessiz devam */
    }
  }

<<<<<<< HEAD
  function completePhase() {
    var wasFocus = state.phase === 'focus';
    state = applyCompletion(state);
    beep();
    if (wasFocus) {
=======
  function strike(when, freq, dur, vol) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + dur);
  }

  /* Süre dolduğunda çalan uyarı zili: arka arkaya üç vuruş. */
  function beep() {
    ensureAudio();
    if (!audioCtx) return;
    try {
      var t = audioCtx.currentTime + 0.02;
      strike(t, 880, 0.3, 0.1);
      strike(t + 0.28, 880, 0.3, 0.1);
      strike(t + 0.56, 660, 0.6, 0.1);
    } catch (e) {
      /* ses yoksa sessiz devam */
    }
  }

  function tick() {
    if (!state.running || !state.endAt) return;
    if (state.endAt > Date.now()) {
      render();
      return;
    }
    // Uyku ya da sekme yavaşlaması sonrası süresi dolan fazlar peş peşe
    // tamamlanır; uyarı tek seferde verilir.
    var guard = 0;
    var completedFocus = 0;
    while (state.running && state.endAt != null && state.endAt <= Date.now() && guard++ < 32) {
      if (state.phase === 'focus') completedFocus += 1;
      state = applyCompletion(state);
    }
    beep();
    if (completedFocus > 0) {
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
      announce('Odak tamamlandı — ' + (state.phase === 'long' ? 'uzun mola' : 'kısa mola') + ' başladı.');
      // Glue: biten odak, zincirde bugünü işaretler.
      document.dispatchEvent(new CustomEvent('focus:pomodoro-completed', {
        detail: { dateKey: S.dateKey(new Date()) }
      }));
    } else {
      announce('Mola bitti — odak başladı.');
    }
    persist();
    render();
  }

<<<<<<< HEAD
  function tick() {
    if (!state.running || !state.endAt) return;
    if (state.endAt <= Date.now()) {
      completePhase();
    } else {
      render();
    }
  }

=======
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
  function start() {
    if (state.running) return;
    state.running = true;
    state.endAt = Date.now() + state.remainingMs;
<<<<<<< HEAD
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
=======
    ensureAudio(); // zilin duyulması için ses yolu bu dokunuşta açılır
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    announce('');
    persist();
    render();
  }

  function pause() {
    if (!state.running) return;
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    state.running = false;
    state.endAt = null;
    persist();
    render();
  }

  function reset() {
    state.running = false;
    state.endAt = null;
    state.phase = 'focus';
    state.focusInCycle = 0;
    state.remainingMs = state.settings.focusMin * 60000;
    announce('Sıfırlandı.');
    persist();
    render();
  }

  function readSettings() {
<<<<<<< HEAD
=======
    var beforeMs = S.phaseMinutes(state.phase, state.settings) * 60000;
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    state.settings.focusMin = S.clampMinutes(els.focusMin.value, 1, 180, state.settings.focusMin);
    state.settings.shortMin = S.clampMinutes(els.shortMin.value, 1, 60, state.settings.shortMin);
    state.settings.longMin = S.clampMinutes(els.longMin.value, 1, 90, state.settings.longMin);
    els.focusMin.value = state.settings.focusMin;
    els.shortMin.value = state.settings.shortMin;
    els.longMin.value = state.settings.longMin;
<<<<<<< HEAD
    if (!state.running) {
      state.remainingMs = S.phaseMinutes(state.phase, state.settings) * 60000;
=======
    // Duraklatılmış ilerleme korunur: yalnızca o anki fazın süresi değiştiyse
    // kalan süre oransal ölçeklenir; ilgisiz bir alan düzenlenirse dokunulmaz.
    var afterMs = S.phaseMinutes(state.phase, state.settings) * 60000;
    if (!state.running && afterMs !== beforeMs && beforeMs > 0) {
      state.remainingMs = Math.round((state.remainingMs * afterMs) / beforeMs);
>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    }
    persist();
    render();
  }

  function init() {
    els = {
      phase: document.getElementById('pomo-phase'),
      time: document.getElementById('pomo-time'),
      bar: document.getElementById('pomo-bar'),
      cycle: document.getElementById('pomo-cycle'),
      start: document.getElementById('pomo-start'),
      reset: document.getElementById('pomo-reset'),
      status: document.getElementById('pomo-status'),
      focusMin: document.getElementById('pomo-focus-min'),
      shortMin: document.getElementById('pomo-short-min'),
      longMin: document.getElementById('pomo-long-min')
    };
    state = loadState();

    els.focusMin.value = state.settings.focusMin;
    els.shortMin.value = state.settings.shortMin;
    els.longMin.value = state.settings.longMin;

    els.start.addEventListener('click', function () {
      state.running ? pause() : start();
    });
    els.reset.addEventListener('click', reset);
    [els.focusMin, els.shortMin, els.longMin].forEach(function (input) {
      input.addEventListener('change', readSettings);
    });
    window.addEventListener('beforeunload', function () {
      document.title = BASE_TITLE;
    });

<<<<<<< HEAD
=======
    // Sayaç sayfa açılmadan da çalışıyor olabilir (kayıtlı halinden devam);
    // "Başlat"a basılmasa bile zilin duyulabilmesi için ilk temasta sesi aç.
    var unlockOnce = function () {
      ensureAudio();
      document.removeEventListener('pointerdown', unlockOnce);
      document.removeEventListener('keydown', unlockOnce);
    };
    document.addEventListener('pointerdown', unlockOnce);
    document.addEventListener('keydown', unlockOnce);

>>>>>>> 7b987fd (Pomodoro: sesli uyarı eklendi)
    ticker = setInterval(tick, TICK_MS);
    render();
  }

  window.FocusPomodoro = { init: init };
})();