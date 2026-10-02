/* Odak — ortak katman: kalıcılık + saf mantık.
   Tarayıcıda `window.FocusStore`, Node smoke testinde CommonJS olarak yüklenir;
   saf yardımcılar localStorage'a dokunmadığı için uçtan uca test edilebilir. */
(function (global) {
  'use strict';

  var KEYS = {
    notes: 'focus-app:notes',
    todos: 'focus-app:todos',
    chain: 'focus-app:chain',
    pomodoro: 'focus-app:pomodoro',
    theme: 'focus-app:theme'
  };

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ── kalıcılık ─────────────────────────────────────────── */
  function load(key, fallback) {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(key) : null;
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback; // bozuk kayıt: varsayılana düş, uygulama çalışmaya devam eder
    }
  }

  function save(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Kota dolu / gizli mod: sessizce yutma — çağıran taraf kullanıcıya haber vermeli.
      return false;
    }
  }

  /* ── tarih anahtarları: yerel güne göre YYYY-MM-DD ─────── */
  function dateKey(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function parseKey(k) {
    var p = String(k).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setDate(c.getDate() + n);
    return c;
  }

  function mondayOf(d) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var shift = (c.getDay() + 6) % 7; // Pzt=0 … Paz=6
    return addDays(c, -shift);
  }

  /* ── zincir: seri hesapları ─────────────────────────────
     marks: { "2026-10-01": true, … } (yalnızca işaretli günler) */
  function isMarked(marks, d) {
    return marks[dateKey(d)] === true;
  }

  function currentStreak(marks, today) {
    // Seri bugünden ya da dünden geriye doğru kesintisiz işaretli gündür;
    // bugün henüz işaretlenmediyse seri kırılmış sayılmaz.
    var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!isMarked(marks, cursor)) cursor = addDays(cursor, -1);
    var n = 0;
    while (isMarked(marks, cursor)) {
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  function longestStreak(marks) {
    var keys = Object.keys(marks).filter(function (k) { return marks[k] === true; }).sort();
    var best = 0;
    var run = 0;
    var prev = null;
    keys.forEach(function (k) {
      if (prev && dateKey(addDays(prev, 1)) === k) run += 1;
      else run = 1;
      prev = parseKey(k);
      if (run > best) best = run;
    });
    return best;
  }

  function markedCount(marks) {
    return Object.keys(marks).filter(function (k) { return marks[k] === true; }).length;
  }

  function toggleMark(marks, d) {
    var k = dateKey(d);
    if (marks[k] === true) delete marks[k];
    else marks[k] = true;
    return marks[k] === true;
  }

  /* ── pomodoro: faz mantığı ──────────────────────────────── */
  var CYCLE_LEN = 4;

  function clampMinutes(v, min, max, fallback) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function phaseMinutes(phase, s) {
    return phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin;
  }

  // Tamamlanan odak sayısı 4'ün katıysa uzun mola, değilse kısa mola.
  function breakAfter(focusCompleted) {
    return focusCompleted % CYCLE_LEN === 0 ? 'long' : 'short';
  }

  function remainingSeconds(endAt, now) {
    return Math.max(0, Math.ceil((endAt - now) / 1000));
  }

  function formatClock(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  var api = {
    KEYS: KEYS,
    CYCLE_LEN: CYCLE_LEN,
    uid: uid,
    load: load,
    save: save,
    dateKey: dateKey,
    parseKey: parseKey,
    addDays: addDays,
    mondayOf: mondayOf,
    isMarked: isMarked,
    currentStreak: currentStreak,
    longestStreak: longestStreak,
    markedCount: markedCount,
    toggleMark: toggleMark,
    clampMinutes: clampMinutes,
    phaseMinutes: phaseMinutes,
    breakAfter: breakAfter,
    remainingSeconds: remainingSeconds,
    formatClock: formatClock
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FocusStore = api;
})(typeof window !== 'undefined' ? window : globalThis);