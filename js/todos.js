/* Yapılacaklar — çoklu liste: listeler maddelerin üstünde sekme olarak
   gösterilir; ekleme/tamamlama/silme/sıralama/filtre/sayaç yalnız AKTİF
   listeye kapsamlıdır. Liste kayıtları KEYS.todoLists, seçili sekme
   KEYS.todoActive altında kalıcıdır. */
(function () {
  'use strict';

  var S = window.FocusStore;

  var lists = [];        // {id,name} — şerit sırası = dizi sırası (liste sıralama aracı yok)
  var activeId = null;   // seçili listenin kimliği
  var todos = [];        // {id,text,done,createdAt,order,listId}
  var filter = 'all';    // 'all' | 'active' | 'done'
  var draggedId = null;  // sürükle-bırak sırasında taşınan madde kimliği
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.todos, todos);
  }

  function persistLists() {
    return window.FocusApp.persist(S.KEYS.todoLists, lists);
  }

  // Sekme seçimi bir arayüz tercihidir; kota uyarısını hak etmez — sessiz S.save.
  function persistActive() {
    S.save(S.KEYS.todoActive, activeId);
  }

  // Madde işlemleri yalnız aktif liste alt kümesi üzerinde çalışır: order
  // yalnız liste içi anlamlıdır, farklı listelerin order değerleri karışmaz.
  // Dizi yenidir ama nesneler todos ile aynı referanstır — yerinde mutasyon yeter.
  function activeTodos() {
    return todos.filter(function (t) { return t.listId === activeId; });
  }

  function visible() {
    return S.sortNotes(activeTodos()).filter(function (t) {
      return filter === 'all' || (filter === 'active' ? !t.done : t.done);
    });
  }

  /* ── liste sekmeleri ─────────────────────────────────────── */
  function renderTabs() {
    els.tabs.innerHTML = '';
    lists.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'todo-tab';
      b.id = 'todo-tab-' + l.id;
      b.dataset.id = l.id;
      b.textContent = l.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'todo-list-panel');
      var selected = l.id === activeId;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
      b.addEventListener('click', function () { selectList(l.id); });
      // Ok tuşları sekmeler arasında dolaşır ve seçer (kabuk sekmeleriyle aynı söz).
      b.addEventListener('keydown', function (e) {
        var all = Array.prototype.slice.call(els.tabs.querySelectorAll('.todo-tab'));
        var i = all.indexOf(b);
        var next = null;
        if (e.key === 'ArrowRight') next = all[(i + 1) % all.length];
        else if (e.key === 'ArrowLeft') next = all[(i - 1 + all.length) % all.length];
        else if (e.key === 'Home') next = all[0];
        else if (e.key === 'End') next = all[all.length - 1];
        if (!next) return;
        e.preventDefault();
        selectList(next.dataset.id);
        // render() sekmeleri yeniden kurdu; odak aynı sekmenin yeni düğümüne dönsün.
        var again = document.getElementById('todo-tab-' + next.dataset.id);
        if (again) again.focus();
      });
      els.tabs.appendChild(b);
    });
    var sel = document.getElementById('todo-tab-' + activeId);
    if (sel) els.panel.setAttribute('aria-labelledby', sel.id);
  }

  function selectList(id) {
    if (id === activeId || !lists.some(function (l) { return l.id === id; })) return;
    activeId = id;
    persistActive();
    render();
  }

  /* ── yeni liste pop-up'ı (not-dialog kalıbı) ──────────────── */
  function openCreateDialog() {
    els.listName.value = '';
    els.listDialog.returnValue = '';
    els.listDialog.showModal();
    els.listName.focus();
  }

  function createFromDialog() {
    var name = S.listNameDraft(els.listName.value);
    if (!name) return; // boş ad liste kurmaz — "Başlıksız not" regresyonunun kardeşi
    var l = { id: S.uid(), name: name };
    lists.push(l);
    activeId = l.id; // yeni sekme hemen seçili açılır
    persistLists();
    persistActive();
    render();
    var tab = document.getElementById('todo-tab-' + l.id);
    if (tab) tab.focus();
  }

  function renderCounts() {
    var cur = activeTodos();
    var left = cur.filter(function (t) { return !t.done; }).length;
    els.count.textContent = left === 0
      ? 'Tümü tamamlandı'
      : left + ' madde kaldı';
    els.empty.hidden = cur.length > 0;
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
      if (S.moveNote(activeTodos(), t.id, e.key === 'ArrowUp' ? -1 : 1)) {
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

  // Bırakılan satırın sırasına yerleştir; hedef indeks FİLTRELENMEMİŞ aktif
  // liste diziliminden hesaplanır (aktif/tamamlanan filtresi altında da doğru).
  function placeOnRow(dragId, row) {
    var grip = row.querySelector('.note-grip');
    if (!grip) return;
    var cur = activeTodos();
    var all = S.sortNotes(cur);
    var ti = -1;
    all.forEach(function (x, i) { if (x.id === grip.dataset.id) ti = i; });
    if (ti >= 0 && S.placeNote(cur, dragId, ti)) {
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
    renderTabs();
    renderList();
    renderCounts();
  }

  function add(text) {
    var trimmed = text.trim();
    if (!trimmed) return;
    todos.push({ id: S.uid(), text: trimmed, done: false, createdAt: new Date().toISOString(), order: Date.now(), listId: activeId });
    persist();
    render();
  }

  function clearDone() {
    todos = todos.filter(function (t) { return t.listId !== activeId || !t.done; });
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
      tabs: document.getElementById('todo-tabs'),
      panel: document.getElementById('todo-list-panel'),
      listNew: document.getElementById('todo-list-new'),
      listDialog: document.getElementById('todo-list-dialog'),
      listName: document.getElementById('todo-list-name'),
      fAll: document.getElementById('filter-all'),
      fActive: document.getElementById('filter-active'),
      fDone: document.getElementById('filter-done')
    };

    todos = S.load(S.KEYS.todos, []);
    if (!Array.isArray(todos)) todos = [];
    // Geçiş: order alanı tamamlanır (updatedAt yoksa createdAt'tan)…
    var migrated = todos.some(function (t) { return typeof t.order !== 'number'; });
    todos = S.normalizeNotes(todos);
    // …ve listeler kurulur: kayıt yoksa "Genel" varsayılanı, listId'siz ya da
    // silinmiş listeye bakan maddeler ilk listeye bağlanır.
    var mig = S.todoListsInit(S.load(S.KEYS.todoLists, []), todos, 'Genel');
    lists = mig.lists;
    todos = mig.todos;
    if (migrated || mig.changed) { persist(); persistLists(); }

    var savedActive = S.load(S.KEYS.todoActive, null);
    activeId = lists.some(function (l) { return l.id === savedActive; }) ? savedActive : lists[0].id;

    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      add(els.input.value);
      els.input.value = '';
      els.input.focus();
    });
    els.clear.addEventListener('click', clearDone);
    els.listNew.addEventListener('click', openCreateDialog);
    // Pop-up: "Tamam" (returnValue "ok") listeyi kurar; "İptal" ve Esc yalnız kapatır.
    els.listDialog.addEventListener('close', function () {
      if (els.listDialog.returnValue === 'ok') createFromDialog();
    });

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
