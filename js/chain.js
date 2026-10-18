/* Zinciri kırma aracı — en fazla son 13 haftanın ızgarası, gün işaretleme,
   seri hesabı. Izgara zincirin ilk işaretli günüyle başladığı haftadan çizilir
   (o haftadan önceki boş sütunlar gösterilmez); hiç işaret yoksa yalnız içinde
   bulunulan hafta çizilir. Pomodoro'dan gelen `focus:pomodoro-completed`
   olayı bugünü otomatik işaretler. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var WEEKS = 13;
  var MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  var marks = {};   // { "2026-10-01": true, … } — yalnızca işaretli günler
  // Hedef kaydı: { goal:int|null, chosenOn:key|null, firstSeen:key|null }.
  // goalOpenOverride: null = otomatik karar (S.chainGoalOpen), true/false =
  // bu oturumda kullanıcının seçiciyi elle açma/kapatma tercihi.
  var goal = { goal: null, chosenOn: null, firstSeen: null };
  var goalOpenOverride = null;
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.chain, marks);
  }

  function persistGoal() {
    return window.FocusApp.persist(S.KEYS.chainGoal, goal);
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

  // Pencere başlangıcı tek kaynakta türetilir: renderGrid ve toggleKey aynı
  // sonucu görmeli ki en eski işaret kalktığında ızgara anında küçülsün.
  // Zincir başlangıcı: en eski işaretli gün (dateKey sözel sıralanır); ızgara
  // o günün pazartesinden başlar, 13 hafta penceresi geriye tavan olur.
  // Bozuk/gelecek anahtarlar yok sayılır; işaret yoksa yalnız bu hafta.
  function chainStart(now) {
    var mondayNow = S.mondayOf(now);
    var windowStart = S.addDays(mondayNow, -7 * (WEEKS - 1));
    var start = mondayNow;
    var firstKey = null;
    Object.keys(marks).forEach(function (key) {
      if (marks[key] === true && /^\d{4}-\d{2}-\d{2}$/.test(key) &&
          (firstKey === null || key < firstKey)) firstKey = key;
    });
    if (firstKey) {
      var chainMonday = S.mondayOf(S.parseKey(firstKey));
      if (chainMonday.getTime() <= windowStart.getTime()) start = windowStart;
      else if (chainMonday.getTime() < mondayNow.getTime()) start = chainMonday;
    }
    return start;
  }

  function renderGrid() {
    var now = new Date();
    var todayKey = S.dateKey(now);
    var todayMid = midnight(now);
    var mondayNow = S.mondayOf(now);
    var start = chainStart(now);
    // Hedef ufku: hedef varsa ızgara yalnız bugünde değil, hedef gününün
    // haftasının Pazarında da biter (geriye asla uzamaz — S.chainGoalEndKey
    // hedef geçmişteyse bu haftanın gerisini verir, altdaki max korur).
    var endMonday = mondayNow;
    var goalEnd = S.chainGoalEndKey(goal);
    if (goalEnd !== null) {
      var goalMonday = S.mondayOf(S.parseKey(goalEnd));
      if (goalMonday.getTime() > endMonday.getTime()) endMonday = goalMonday;
    }
    // 604800000 ms = 1 hafta: Pazartesiler yerel gece yarısında olduğundan
    // Math.round, DST kaynaklı ±1s kaymasını emniyetle yutar.
    var weeks = Math.round((endMonday.getTime() - start.getTime()) / 604800000) + 1;

    els.grid.innerHTML = '';
    els.months.innerHTML = '';

    // Ay etiketleri: kolon (hafta) hizalı segmentler.
    var segments = [];
    for (var w = 0; w < weeks; w++) {
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
    for (var wi = 0; wi < weeks; wi++) {
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
    var startBefore = chainStart(new Date()).getTime();
    var on = S.toggleMark(marks, S.parseKey(key));
    persist();
    if (chainStart(new Date()).getTime() !== startBefore) {
      // En eski işaret değişti → pencere kaydı: boşalan sütunlar sayfa
      // yenilenmeden silinir. Tıklanan hücre çizim dışına düştüyse odak
      // renderGrid hedefine (bugün → son hücre) devredilir; odaklanan
      // öğe yeniden çizimde yok olduğu için focus() geri verilir.
      renderGrid();
      var fresh = cellFor(key) || els.grid.querySelector('.chain-cell.today') ||
        els.grid.lastElementChild;
      if (fresh) {
        setActive(fresh);
        fresh.focus();
      }
    } else {
      refreshCell(key);
      setActive(cellFor(key));
    }
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

  /* ── hedef: panel görünürlüğü + seçim ─────────────────────
     Kural: hedef seçilmemişse VE ilk gösterim bugündürse seçici açık
     doğar (S.chainGoalOpen). Hedef seçilince ya da sonraki günlerde
     kapanır; yerini "Hedeflenen günü seç" düğmesi alır. goalOpenOverride
     bu oturumda düğme/Vazgeç ile verilen geçici tercihtir; kalıcı
     duruma yazılmaz. */
  function renderGoal() {
    var open = goalOpenOverride === null
      ? S.chainGoalOpen(goal, S.dateKey(new Date()))
      : goalOpenOverride;
    els.goalPicker.hidden = !open;
    els.goalEdit.hidden = open;
    els.goalClear.hidden = goal.goal === null;
    els.goalValue.textContent = goal.goal === null ? 'yok' : goal.goal + ' gün';
    var presets = els.goalPresets.querySelectorAll('.chain-goal-preset');
    for (var i = 0; i < presets.length; i++) {
      presets[i].setAttribute('aria-pressed',
        String(Number(presets[i].dataset.days) === goal.goal));
    }
  }

  function applyGoal(days) {
    goal.goal = days;
    goal.chosenOn = S.dateKey(new Date());
    goalOpenOverride = false; // seçim sonrası panel kapanır, düğme geri gelir
    persistGoal();
    renderGrid(); // hedef ufku: ızgara hedef gününün haftasına uzar
    renderGoal();
    els.status.textContent = 'Hedef ' + days + ' gün olarak belirlendi.';
    els.goalEdit.focus();
  }

  function init() {
    els = {
      grid: document.getElementById('chain-grid'),
      months: document.getElementById('chain-months'),
      current: document.getElementById('chain-current'),
      best: document.getElementById('chain-best'),
      total: document.getElementById('chain-total'),
      status: document.getElementById('chain-status'),
      todayBtn: document.getElementById('chain-today'),
      goalValue: document.getElementById('chain-goal-value'),
      goalEdit: document.getElementById('chain-goal-edit'),
      goalPicker: document.getElementById('chain-goal-picker'),
      goalPresets: document.getElementById('chain-goal-presets'),
      goalForm: document.getElementById('chain-goal-form'),
      goalInput: document.getElementById('chain-goal-input'),
      goalCancel: document.getElementById('chain-goal-cancel'),
      goalClear: document.getElementById('chain-goal-clear')
    };

    var saved = S.load(S.KEYS.chain, {});
    marks = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};

    // İlk çalıştırma: ilk gösterim gününü damgala — zincirleme render'da
    // null kalan firstSeen S.chainGoalOpen'ı hiç açılmaya zorlayamaz.
    goal = S.normalizeChainGoal(S.load(S.KEYS.chainGoal, null));
    if (goal.firstSeen === null) {
      goal.firstSeen = S.dateKey(new Date());
      persistGoal();
    }

    renderGrid();
    renderStats();
    renderGoal();

    // Gece yarısından sonra ızgara bayatlar: dakikada bir ve sekmeye
    // dönüldüğünde gün değiştiyse çizimi tazele.
    var renderedTodayKey = S.dateKey(new Date());
    function refreshIfDayChanged() {
      var nowKey = S.dateKey(new Date());
      if (nowKey !== renderedTodayKey) {
        renderedTodayKey = nowKey;
        renderGrid();
        renderStats();
        // Seçici yalnız ilk gösterim günü açık kalır; gece aşımında
        // otomatik durum kapıya döner (elle açma tercihi korunur).
        if (goalOpenOverride === null) renderGoal();
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

    // ── hedef olayları ──────────────────────────────────────
    els.goalEdit.addEventListener('click', function () {
      goalOpenOverride = true;
      renderGoal();
      els.goalInput.focus();
    });
    els.goalCancel.addEventListener('click', function () {
      goalOpenOverride = false;
      renderGoal();
      els.goalEdit.focus();
    });
    els.goalPresets.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.chain-goal-preset') : null;
      if (btn && !btn.disabled) applyGoal(Number(btn.dataset.days));
    });
    els.goalForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var days = S.goalFromInput(els.goalInput.value);
      if (days === null) {
        els.status.textContent = 'Geçerli bir hedef gün sayısı gir (1–3650 arası).';
        els.goalInput.focus();
        return;
      }
      applyGoal(days);
    });
    els.goalClear.addEventListener('click', function () {
      goal.goal = null;
      goal.chosenOn = null;
      goalOpenOverride = false;
      persistGoal();
      renderGrid(); // ufuk kaldırıldı: ızgara bu haftada küçülür
      renderGoal();
      els.status.textContent = 'Hedef kaldırıldı.';
      els.goalEdit.focus();
    });
  }

  window.FocusChain = { init: init };
})();