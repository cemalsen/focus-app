/* Yapılacaklar listesi — ekle, tamamla, sil, filtrele. */
(function () {
  'use strict';

  var S = window.FocusStore;

  var todos = [];        // {id,text,done,createdAt,order}
  var filter = 'all';    // 'all' | 'active' | 'done'
  var draggedId = null;  // sürükle-bırak sırasında taşınan madde kimliği
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.todos, todos);
  }

  function visible() {
    return S.sortNotes(todos).filter(function (t) {
      return filter === 'all' || (filter === 'active' ? !t.done : t.done);
    });
  }

  function renderCounts() {
    var left = todos.filter(function (t) { return !t.done; }).length;
    els.count.textContent = left === 0
      ? 'Tümü tamamlandı'
      : left + ' madde kaldı';
    els.empty.hidden = todos.length > 0;
    [els.fAll, els.fActive, els.fDone].forEach(function (btn) {
      var key = btn.dataset.filter;
      btn.setAttribute('aria-pressed', String(key === filter));
    });
  }

  // Sıralama tutamacı (notlardaki .note-grip ile aynı sözleşme): fare satır
  // düzeyinde HTML5 DnD, klavye ↑/↓ (S.moveNote), dokunmatik/kalem Pointer
  // Events ile tutamaktan sürükleme (S.placeNote). Yalnız order alanları değişir.
  function gripBtn(t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-grip';
    b.dataset.id = t.id;
    b.textContent = '⠿';
    b.setAttribute('aria-label', 'Sıralama tutamacı: ' + t.text + ' — ok tuşlarıyla taşıyın, dokunmatikte sürükleyin');
    function restore() {
      var back = els.list.querySelector('.note-grip[data-id="' + t.id + '"]');
      if (back) back.focus();
    }
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (S.moveNote(todos, t.id, e.key === 'ArrowUp' ? -1 : 1)) {
        persist();
        render();
        restore();
      }
    });
    var ptr = null;
    b.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return; // fare: satır düzeyinde HTML5 DnD
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* sentetik olaylarda tutamaç yok */ }
      ptr = { id: e.pointerId, over: null, row: b.closest('.todo-item') };
      if (ptr.row) ptr.row.classList.add('dragging');
    });
    b.addEventListener('pointermove', function (e) {
      if (!ptr || ptr.id !== e.pointerId) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest ? el.closest('.todo-item') : null;
      if (over === ptr.row) over = null;
      if (ptr.over && ptr.over !== over) ptr.over.classList.remove('drag-over');
      ptr.over = over || null;
      if (over) over.classList.add('drag-over');
    });
    function endPointer(e) {
      if (!ptr || ptr.id !== e.pointerId) return;
      var over = ptr.over;
      if (ptr.row) ptr.row.classList.remove('dragging');
      if (over) over.classList.remove('drag-over');
      ptr = null;
      if (over) placeOnRow(t.id, over);
    }
    b.addEventListener('pointerup', endPointer);
    b.addEventListener('pointercancel', endPointer);
    return b;
  }

  // Bırakılan satırın sırasına yerleştir; hedef indeksi FİLTRELENMEMİŞ dizilimden
  // hesaplanır (aktif/tamamlanan filtresi altında da doğru çalışır).
  function placeOnRow(dragId, row) {
    var grip = row.querySelector('.note-grip');
    if (!grip) return;
    var all = S.sortNotes(todos);
    var ti = -1;
    all.forEach(function (x, i) { if (x.id === grip.dataset.id) ti = i; });
    if (ti >= 0 && S.placeNote(todos, dragId, ti)) {
      persist();
      render();
      var back = els.list.querySelector('.note-grip[data-id="' + dragId + '"]');
      if (back) back.focus();
    }
  }

  function renderList() {
    els.list.innerHTML = '';
    visible().forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'todo-item' + (t.done ? ' done' : '');
      // Sürükle-bırak ile sıralama: yalnız order alanları değişir (S.placeNote).
      li.draggable = true;
      li.addEventListener('dragstart', function (e) {
        draggedId = t.id;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
      });
      li.addEventListener('dragover', function (e) {
        if (!draggedId || draggedId === t.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!draggedId || draggedId === t.id) return;
        var drag = draggedId;
        draggedId = null;
        placeOnRow(drag, li);
      });
      li.addEventListener('dragend', function () {
        draggedId = null;
        li.classList.remove('dragging');
        Array.prototype.forEach.call(els.list.querySelectorAll('.drag-over'), function (el) {
          el.classList.remove('drag-over');
        });
      });

      var label = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.id = t.id;
      cb.checked = t.done;
      cb.addEventListener('change', function () {
        t.done = cb.checked;
        persist();
        render();
        // Yeniden kurulum odak kaybettirir; aynı maddeye geri dön.
        var again = els.list.querySelector('.todo-item input[data-id="' + t.id + '"]');
        if (again) again.focus();
      });

      var text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = t.text;

      label.appendChild(cb);
      label.appendChild(text);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost';
      del.textContent = '✕';
      del.setAttribute('aria-label', '“' + t.text + '” maddesini sil');
      del.addEventListener('click', function () {
        var boxes = els.list.querySelectorAll('.todo-item input[type="checkbox"]');
        var idx = Array.prototype.indexOf.call(boxes, cb);
        todos = todos.filter(function (x) { return x.id !== t.id; });
        persist();
        render();
        // Silinen satır yok oldu; odağı en yakın maddeye ya da ekle alanına taşı.
        var leftItems = els.list.querySelectorAll('.todo-item input[type="checkbox"]');
        var next = leftItems.length ? leftItems[Math.min(idx, leftItems.length - 1)] : null;
        (next || els.input).focus();
      });

      li.appendChild(gripBtn(t));
      li.appendChild(label);
      li.appendChild(del);
      els.list.appendChild(li);
    });
  }

  function render() {
    renderList();
    renderCounts();
  }

  function add(text) {
    var trimmed = text.trim();
    if (!trimmed) return;
    todos.push({ id: S.uid(), text: trimmed, done: false, createdAt: new Date().toISOString(), order: Date.now() });
    persist();
    render();
  }

  function clearDone() {
    todos = todos.filter(function (t) { return !t.done; });
    persist();
    render();
  }

  function init() {
    els = {
      form: document.getElementById('todo-form'),
      input: document.getElementById('todo-input'),
      list: document.getElementById('todo-list'),
      empty: document.getElementById('todo-empty'),
      count: document.getElementById('todo-count'),
      clear: document.getElementById('todos-clear'),
      fAll: document.getElementById('filter-all'),
      fActive: document.getElementById('filter-active'),
      fDone: document.getElementById('filter-done')
    };

    todos = S.load(S.KEYS.todos, []);
    if (!Array.isArray(todos)) todos = [];
    // Geçiş: order alanı tamamlanır (updatedAt yoksa createdAt'ten) ve bir kez yazılır.
    var migrated = todos.some(function (t) { return typeof t.order !== 'number'; });
    todos = S.normalizeNotes(todos);
    if (migrated) persist();

    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      add(els.input.value);
      els.input.value = '';
      els.input.focus();
    });
    els.clear.addEventListener('click', clearDone);

    [[els.fAll, 'all'], [els.fActive, 'active'], [els.fDone, 'done']].forEach(function (pair) {
      var btn = pair[0];
      btn.dataset.filter = pair[1];
      btn.addEventListener('click', function () {
        filter = pair[1];
        render();
      });
    });

    render();
  }

  window.FocusTodos = { init: init };
})();