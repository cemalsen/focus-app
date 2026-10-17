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
  // Kadran ilerleme halkasının çevresi (SVG r=47): JS offset'i piksel besler.
  var DIAL_RING_C = 2 * Math.PI * 47;

  function defaultState() {
    return {
      settings: { focusMin: 25, shortMin: 5, longMin: 15, bellSound: true, displayMode: 'digital' },
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
    if (st.settings.displayMode !== 'digital' && st.settings.displayMode !== 'dial') {
      st.settings.displayMode = 'digital';
    }
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
  var PHASES = ['focus', 'short', 'long'];

  function render() {
    var totalMs = S.phaseMinutes(state.phase, state.settings) * 60000;
    var remainingMs = state.running && state.endAt
      ? Math.max(0, state.endAt - Date.now())
      : state.remainingMs;
    var secs = Math.ceil(remainingMs / 1000);
    var frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;

    els.time.textContent = S.formatClock(secs);
    // Moladayken de sıradaki odak numarası gösterilir (bir önceki odak değil).
    var cycleNo = state.focusInCycle + 1;
    els.cycle.textContent = 'Döngü ' + cycleNo + '/' + S.CYCLE_LEN;
    els.bar.style.width = (totalMs > 0 ? (100 * (totalMs - remainingMs)) / totalMs : 0) + '%';
    els.start.textContent = state.running ? 'Duraklat' : 'Başlat';
    els.start.setAttribute('aria-label', state.running ? 'Sayacı duraklat' : 'Sayacı başlat');
    // Faz seçici butonları güncel fazı yansıtır (vurgu CSS'e değil duruma bağlı).
    PHASES.forEach(function (p) {
      els.phaseButtons[p].setAttribute('aria-pressed', p === state.phase ? 'true' : 'false');
    });
    renderDisplay();
    renderDial(frac, secs);

    document.title = state.running
      ? S.formatClock(secs) + ' · ' + PHASE_LABEL[state.phase] + ' — Odak'
      : BASE_TITLE;
  }

  /* Görünüm modu: dijital metin ile SVG kadran arasında geçiş. Kadran
     modunda dijital metin YALNIZCA görsel olarak gizlenir (.visually-hidden) —
     role="timer" değeri ekran okuyucuya canlı okunmaya devam eder; kadranın
     kendisi aria-hidden'dır (çift duyuru olmaz). */
  function renderDisplay() {
    var dial = state.settings.displayMode === 'dial';
    els.displayDigital.setAttribute('aria-pressed', dial ? 'false' : 'true');
    els.displayDial.setAttribute('aria-pressed', dial ? 'true' : 'false');
    // Kadran bir SVG: .hidden ÖZELLİĞİ HTML elemanlarında olduğu gibi
    // hidden özniteliğine YANSIMAZ (SVGSVGElement HTMLElement değildir) —
    // öznitelik elle açılır/kapanır. hidden ÖZNİTELİĞİ = gizli: kadran
    // modunda KALDIRILIR (kadran çizilir), dijital modda eklenir.
    if (dial) els.dial.removeAttribute('hidden');
    else els.dial.setAttribute('hidden', '');
    els.time.classList.toggle('visually-hidden', dial);
  }

  /* Kadran kolları kalan süreden hesaplanır. Akrep faz süresi boyunca saat
     yönünde bir tam tur atar (t=0'da 12'de, süre bitince yine 12'de); saniye
     kolu her dakikada bir tam tur. İlerleme halkası kalan oranı gösterir ve
     saat yönünde erir. Tüm açılar kalan zamana göredir: sayaç geri saydıkça
     kollar saat yönünde ilerler (tıpkı geri sayan bir mutfak saati gibi). */
  function renderDial(frac, secs) {
    els.dialMin.setAttribute('transform', 'rotate(' + ((1 - frac) * 360).toFixed(1) + ' 60 60)');
    var s = secs % 60;
    els.dialSec.setAttribute('transform', 'rotate(' + (((60 - s) % 60) * 6).toFixed(1) + ' 60 60)');
    els.dialRing.style.strokeDashoffset = (DIAL_RING_C * (1 - frac)).toFixed(1);
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

  /* Kullanıcı fazı elle seçer: çalışan sayaç durur, seçilen faz tam süresiyle
     "Başlat"ı bekler (elle faz geçişi sözleşesiyle aynı). Döngü sayacı korunur —
     elle seçim fazı tamamlanmış saymaz; zincir yalnız odak *tamamlandığında*
     işaretlenir. Aynı faz seçimi sayacı bozmaz (no-op). */
  function selectPhase(phase) {
    if (phase !== 'focus' && phase !== 'short' && phase !== 'long') return;
    if (phase === state.phase) return;
    state.running = false;
    state.endAt = null;
    state.phase = phase;
    state.remainingMs = S.phaseMinutes(phase, state.settings) * 60000;
    announce(PHASE_LABEL[phase] + ' seçildi. Başlat ile başlatın.');
    persist();
    render();
  }

  /* Görünüm modu seçimi (Ayarlar → Saat görünümü). Sayacı bozmaz: yalnızca
     dijital/kadran tercihi yazılır; render() görünümü senkronlar. */
  function selectDisplay(mode) {
    if (mode !== 'digital' && mode !== 'dial') return;
    state.settings.displayMode = mode;
    renderDisplay();
    persist();
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
      time: document.getElementById('pomo-time'),
      bar: document.getElementById('pomo-bar'),
      cycle: document.getElementById('pomo-cycle'),
      start: document.getElementById('pomo-start'),
      reset: document.getElementById('pomo-reset'),
      status: document.getElementById('pomo-status'),
      phaseButtons: {
        focus: document.getElementById('pomo-phase-focus'),
        short: document.getElementById('pomo-phase-short'),
        long: document.getElementById('pomo-phase-long')
      },
      focusMin: document.getElementById('pomo-focus-min'),
      shortMin: document.getElementById('pomo-short-min'),
      longMin: document.getElementById('pomo-long-min'),
      sound: document.getElementById('pomo-sound'),
      soundState: document.getElementById('pomo-sound-state'),
      displayDigital: document.getElementById('pomo-display-digital'),
      displayDial: document.getElementById('pomo-display-dial'),
      dial: document.getElementById('pomo-dial'),
      dialMin: document.getElementById('pomo-dial-min'),
      dialSec: document.getElementById('pomo-dial-sec'),
      dialRing: document.getElementById('pomo-dial-ring')
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
    PHASES.forEach(function (p) {
      els.phaseButtons[p].addEventListener('click', function () { selectPhase(p); });
    });
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
    els.displayDigital.addEventListener('click', function () { selectDisplay('digital'); });
    els.displayDial.addEventListener('click', function () { selectDisplay('dial'); });
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