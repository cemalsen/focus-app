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
      settings: { focusMin: 25, shortMin: 5, longMin: 15, bellSound: true },
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
    // Ayarlar alan alan birleştirilir; bozuk/güncellenmiş kayıt varsayılanı düşürür.
    st.settings = Object.assign(defaultState().settings,
      saved.settings && typeof saved.settings === 'object' ? saved.settings : {});
    if (st.phase !== 'focus' && st.phase !== 'short' && st.phase !== 'long') st.phase = 'focus';
    st.settings.focusMin = S.clampMinutes(st.settings.focusMin, 1, 180, 25);
    st.settings.shortMin = S.clampMinutes(st.settings.shortMin, 1, 60, 5);
    st.settings.longMin = S.clampMinutes(st.settings.longMin, 1, 90, 15);
    if (st.running && st.endAt) {
      // Sayfa kapalıyken süresi dolan tek faz tamamlanmış sayılır; sıradaki faz
      // otomatik başlamaz, kullanıcının "Başlat"ına kadar bekler.
      if (st.endAt <= Date.now()) {
        st = applyCompletion(st);
        st.running = false;
        st.endAt = null;
      }
      // endAt gelecekteyse: çalışan sayaç kaldığı yerden sürer (faz geçişi yok).
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
    // Sonraki bitiş bir önceki bitişe zincirlenir; Date.now()'a sabitlenirse
    // uyku/sekme yavaşlaması sonrası bekleyen fazlar tek tek düşer.
    if (st.running) st.endAt = (st.endAt || Date.now()) + st.remainingMs;
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

  /* Zil sesi tercihinin görsel durumu: onay kutusu + düz metin. */
  function renderSound() {
    var on = state.settings.bellSound !== false;
    els.sound.checked = on;
    els.soundState.textContent = on ? 'Açık' : 'Kapalı';
  }

  /* Ses yolu kullanıcı etkileşimi içinde hazır olmalı: tarayıcıların otomatik
     oynatma politikası dokunuşsuz açılan AudioContext'i askıya alır ve zil
     sessiz kalır. */
  function ensureAudio() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {
      /* ses yoksa sessiz devam */
    }
  }

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
    // Sessizde ses yolu hiç kurulmaz: AudioContext'in kendisi inşa edilmez.
    if (state.settings.bellSound === false) return;
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
    // Süresi dolan faz tamamlanır; ardından sayaç durur. Sıradaki faz
    // (mola ya da odak) otomatik başlamaz; kullanıcı "Başlat"a basana dek bekler.
    // Uyku/sekme yavaşlaması sonrası da tek geçiş yapılır: bir sonraki faz henüz
    // hiç çalışmadığı için tamamlanmış sayılamaz. Zil tek seferde çalar.
    var completedFocus = 0;
    if (state.phase === 'focus') completedFocus += 1;
    state = applyCompletion(state);
    state.running = false;
    state.endAt = null;
    beep();
    if (completedFocus > 0) {
      announce('Odak tamamlandı — ' + (state.phase === 'long' ? 'uzun mola' : 'kısa mola') + ' sırada. Başlat ile başlatın.');
      // Glue: biten odak, zincirde bugünü işaretler.
      document.dispatchEvent(new CustomEvent('focus:pomodoro-completed', {
        detail: { dateKey: S.dateKey(new Date()) }
      }));
    } else {
      announce('Mola bitti — odak sırada. Başlat ile başlatın.');
    }
    persist();
    render();
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.endAt = Date.now() + state.remainingMs;
    // Zil sesi açıksa ses yolu bu dokunuşta açılır; sessizde hiç kurulmaz.
    if (state.settings.bellSound !== false) ensureAudio();
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
    var beforeMs = S.phaseMinutes(state.phase, state.settings) * 60000;
    state.settings.focusMin = S.clampMinutes(els.focusMin.value, 1, 180, state.settings.focusMin);
    state.settings.shortMin = S.clampMinutes(els.shortMin.value, 1, 60, state.settings.shortMin);
    state.settings.longMin = S.clampMinutes(els.longMin.value, 1, 90, state.settings.longMin);
    els.focusMin.value = state.settings.focusMin;
    els.shortMin.value = state.settings.shortMin;
    els.longMin.value = state.settings.longMin;
    // Duraklatılmış ilerleme korunur: yalnızca o anki fazın süresi değiştiyse
    // kalan süre oransal ölçeklenir; ilgisiz bir alan düzenlenirse dokunulmaz.
    var afterMs = S.phaseMinutes(state.phase, state.settings) * 60000;
    if (!state.running && afterMs !== beforeMs && beforeMs > 0) {
      state.remainingMs = Math.round((state.remainingMs * afterMs) / beforeMs);
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
      longMin: document.getElementById('pomo-long-min'),
      sound: document.getElementById('pomo-sound'),
      soundState: document.getElementById('pomo-sound-state')
    };
    state = loadState();

    els.focusMin.value = state.settings.focusMin;
    els.shortMin.value = state.settings.shortMin;
    els.longMin.value = state.settings.longMin;
    renderSound();

    els.start.addEventListener('click', function () {
      state.running ? pause() : start();
    });
    els.reset.addEventListener('click', reset);
    [els.focusMin, els.shortMin, els.longMin].forEach(function (input) {
      input.addEventListener('change', readSettings);
    });
    els.sound.addEventListener('change', function () {
      state.settings.bellSound = !!els.sound.checked;
      // Kutuyu işaretlemek bir kullanıcı jestidir: ses yolu şimdi hazırlanır
      // ki sonraki zil duyulsun (sessizde bugüne dek hiç kurulmamış olur).
      if (state.settings.bellSound) ensureAudio();
      renderSound();
      persist();
    });
    window.addEventListener('beforeunload', function () {
      document.title = BASE_TITLE;
    });

    // Sayaç sayfa açılmadan da çalışıyor olabilir (kayıtlı halinden devam);
    // "Başlat"a basılmasa bile zilin duyulabilmesi için ilk temasta sesi aç.
    // Sessizde ses yolu hiç kurulmaz (bkz. beep() sözleşmesi).
    var unlockOnce = function () {
      if (state.settings.bellSound !== false) ensureAudio();
      document.removeEventListener('pointerdown', unlockOnce);
      document.removeEventListener('keydown', unlockOnce);
    };
    document.addEventListener('pointerdown', unlockOnce);
    document.addEventListener('keydown', unlockOnce);

    ticker = setInterval(tick, TICK_MS);
    render();
  }

  window.FocusPomodoro = { init: init };
})();