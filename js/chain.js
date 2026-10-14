/* Zinciri kırma aracı — son 13 haftanın ızgarası, gün işaretleme, seri hesabı.
   Pomodoro'dan gelen `focus:pomodoro-completed` olayı bugünü otomatik işaretler. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var WEEKS = 13;
  var MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  var marks = {};   // { "2026-10-01": true, … } — yalnızca işaretli günler
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.chain, marks);
  }

  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function fmtLong(d) {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function cellFor(key) {
    // Dize birleştirmeli seçici yok: data-date birebir eşleşmesiyle ara
    // (seçici/enjeksiyon desenine karşı savunma; key zaten dateKey çıktısıdır).
    var cells = els.grid.querySelectorAll('.chain-cell');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].dataset.date === key) return cells[i];
    }
    return null;
  }

  function paintCell(btn, day, key) {
    var marked = marks[key] === true;
    btn.classList.toggle('marked', marked);
    btn.setAttribute('aria-pressed', String(marked));
    btn.setAttribute('aria-label', fmtLong(day) + (marked ? ' — işaretli' : ' — işaretli değil'));
  }

  function refreshCell(key) {
    var btn = cellFor(key);
    if (btn && !btn.disabled) paintCell(btn, S.parseKey(key), key);
  }

  function renderStats() {
    var today = new Date();
    var key = S.dateKey(today);
    var isOn = marks[key] === true;
    els.current.textContent = S.currentStreak(marks, today) + ' gün';
    els.best.textContent = S.longestStreak(marks) + ' gün';
    els.total.textContent = S.markedCount(marks) + ' gün';
    els.todayBtn.setAttribute('aria-pressed', String(isOn));
    els.todayBtn.textContent = isOn ? 'Bugünün işaretini kaldır' : 'Bugünü işaretle';
  }

  function renderGrid() {
    var now = new Date();
    var todayKey = S.dateKey(now);
    var todayMid = midnight(now);
    var start = S.addDays(S.mondayOf(now), -7 * (WEEKS - 1));

    els.grid.innerHTML = '';
    els.months.innerHTML = '';

    // Ay etiketleri: kolon (hafta) hizalı segmentler.
    var segments = [];
    for (var w = 0; w < WEEKS; w++) {
      var label = MONTHS[S.addDays(start, w * 7).getMonth()];
      var last = segments[segments.length - 1];
      if (last && last.label === label) last.span = w - last.startCol + 1;
      else segments.push({ label: label, startCol: w, span: 1 });
    }
    segments.forEach(function (seg) {
      var el = document.createElement('span');
      el.textContent = seg.label;
      el.style.gridColumn = (seg.startCol + 1) + ' / span ' + seg.span;
      els.months.appendChild(el);
    });

    var todayBtn = null;
    for (var wi = 0; wi < WEEKS; wi++) {
      var weekStart = S.addDays(start, wi * 7);
      for (var r = 0; r < 7; r++) {
        var day = S.addDays(weekStart, r);
        var key = S.dateKey(day);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chain-cell';
        btn.dataset.date = key;
        btn.tabIndex = -1;

        // Ayın gün numarası: kutunun içinde açık gri ipucu. Süslemedir —
        // tam tarih zaten aria-label'da, bu yüzden ekran okuyucuya kapatılır.
        var num = document.createElement('span');
        num.className = 'chain-day';
        num.setAttribute('aria-hidden', 'true');
        num.textContent = String(day.getDate());
        btn.appendChild(num);

        if (key === todayKey) {
          btn.classList.add('today');
          todayBtn = btn;
        }
        paintCell(btn, day, key);

        if (day.getTime() > todayMid.getTime()) {
          btn.disabled = true;
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('aria-label', fmtLong(day) + ' — gelecek gün');
        }
        els.grid.appendChild(btn);
      }
    }
    // Gezinti odağı: bugün varsa bugün, yoksa en son hücre.
    var focusTarget = todayBtn || els.grid.lastElementChild;
    if (focusTarget) focusTarget.tabIndex = 0;
  }

  function setActive(cell) {
    els.grid.querySelectorAll('.chain-cell[tabindex="0"]').forEach(function (c) {
      c.tabIndex = -1;
    });
    cell.tabIndex = 0;
  }

  function toggleKey(key) {
    var btn = cellFor(key);
    if (!btn || btn.disabled) return;
    var on = S.toggleMark(marks, S.parseKey(key));
    persist();
    refreshCell(key);
    setActive(cellFor(key));
    renderStats();
    els.status.textContent = on
      ? fmtLong(S.parseKey(key)) + ' işaretlendi.'
      : fmtLong(S.parseKey(key)) + ' işareti kaldırıldı.';
  }

  function onGridKeydown(e) {
    var delta = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[e.key];
    var current = e.target.closest ? e.target.closest('.chain-cell') : null;
    if (!current) return;
    if (delta) {
      e.preventDefault();
      var target = S.dateKey(S.addDays(S.parseKey(current.dataset.date), delta));
      var cell = cellFor(target);
      if (cell && !cell.disabled) {
        setActive(cell);
        cell.focus();
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      var all = Array.prototype.slice.call(els.grid.querySelectorAll('.chain-cell:not(:disabled)'));
      var dest = e.key === 'Home' ? all[0] : all[all.length - 1];
      if (dest) {
        setActive(dest);
        dest.focus();
      }
    }
  }

  function markToday(auto) {
    var today = new Date();
    var key = S.dateKey(today);
    if (marks[key] !== true) {
      marks[key] = true;
      persist();
      refreshCell(key);
      renderStats();
      els.status.textContent = auto
        ? 'Odak tamamlandı — bugün zincire eklendi.'
        : 'Bugün işaretlendi.';
      return true;
    }
    return false;
  }

  function init() {
    els = {
      grid: document.getElementById('chain-grid'),
      months: document.getElementById('chain-months'),
      current: document.getElementById('chain-current'),
      best: document.getElementById('chain-best'),
      total: document.getElementById('chain-total'),
      status: document.getElementById('chain-status'),
      todayBtn: document.getElementById('chain-today')
    };

    var saved = S.load(S.KEYS.chain, {});
    marks = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};

    renderGrid();
    renderStats();

    // Gece yarısından sonra ızgara bayatlar: dakikada bir ve sekmeye
    // dönüldüğünde gün değiştiyse çizimi tazele.
    var renderedTodayKey = S.dateKey(new Date());
    function refreshIfDayChanged() {
      var nowKey = S.dateKey(new Date());
      if (nowKey !== renderedTodayKey) {
        renderedTodayKey = nowKey;
        renderGrid();
        renderStats();
      }
    }
    setInterval(refreshIfDayChanged, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshIfDayChanged();
    });

    els.grid.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.chain-cell') : null;
      if (cell && !cell.disabled) toggleKey(cell.dataset.date);
    });
    els.grid.addEventListener('keydown', onGridKeydown);
    els.todayBtn.addEventListener('click', function () {
      var key = S.dateKey(new Date());
      if (marks[key] === true) toggleKey(key);
      else markToday(false);
    });
    document.addEventListener('focus:pomodoro-completed', function () {
      markToday(true);
    });
  }

  window.FocusChain = { init: init };
})();