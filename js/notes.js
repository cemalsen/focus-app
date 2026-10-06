/* Not alma aracı — başlık + gövde, otomatik kayıt, liste görünümü. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var SAVE_DELAY_MS = 300;

  var notes = [];       // {id,title,body,createdAt,updatedAt,order}
  var selectedId = null;
  var draggedId = null; // sürükle-bırak sırasında taşınan not kimliği
  var saveTimer = null;
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.notes, notes);
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function sorted() {
    return S.sortNotes(notes);
  }

  function get(id) {
    return notes.find(function (n) { return n.id === id; }) || null;
  }

  // Sıralama tutamacı: satırda tek düğme (⠿) — sürükleme göstergesi ve erişim
  // yolu. Fare: satır düzeyinde HTML5 DnD (aşağıda). Klavye: tutamak odaklıyken
  // ↑/↓ taşır. Dokunmatik/kalem: tutamaktan Pointer Events ile sürükleme.
  function gripBtn(n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-grip';
    b.dataset.id = n.id;
    b.textContent = '⠿';
    b.setAttribute('aria-label', 'Sıralama tutamacı: ' + (n.title.trim() || 'Başlıksız not') + ' — ok tuşlarıyla taşıyın, dokunmatikte sürükleyin');
    function restore() {
      var back = els.list.querySelector('.note-grip[data-id="' + n.id + '"]');
      if (back) back.focus();
    }
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (S.moveNote(notes, n.id, e.key === 'ArrowUp' ? -1 : 1)) {
        persist();
        renderList();
        restore();
      }
    });
    var ptr = null;
    b.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return; // fare için satır düzeyinde HTML5 DnD
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* sentetik olaylarda tutamaç yok */ }
      ptr = { id: e.pointerId, over: null, row: b.closest('.note-row') };
      if (ptr.row) ptr.row.classList.add('dragging');
    });
    b.addEventListener('pointermove', function (e) {
      if (!ptr || ptr.id !== e.pointerId) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest ? el.closest('.note-row') : null;
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
      if (!over) return;
      var targetIdx = Array.prototype.indexOf.call(els.list.children, over);
      if (targetIdx >= 0 && S.placeNote(notes, n.id, targetIdx)) {
        persist();
        renderList();
        restore();
      }
    }
    b.addEventListener('pointerup', endPointer);
    b.addEventListener('pointercancel', endPointer);
    return b;
  }

  function renderList() {
    els.list.innerHTML = '';
    var items = sorted();
    els.empty.hidden = items.length > 0;

    items.forEach(function (n, idx) {
      var li = document.createElement('li');
      li.className = 'note-row';
      // Sürükle-bırak ile sıralama: yalnız order alanları değişir (S.placeNote).
      li.draggable = true;
      li.addEventListener('dragstart', function (e) {
        draggedId = n.id;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', n.id);
      });
      li.addEventListener('dragover', function (e) {
        if (!draggedId || draggedId === n.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!draggedId || draggedId === n.id) return;
        if (S.placeNote(notes, draggedId, idx)) {
          persist();
          renderList();
          var back = els.list.querySelector('.note-item[data-id="' + draggedId + '"]');
          if (back) back.focus();
        }
      });
      li.addEventListener('dragend', function () {
        draggedId = null;
        li.classList.remove('dragging');
        Array.prototype.forEach.call(els.list.querySelectorAll('.drag-over'), function (el) {
          el.classList.remove('drag-over');
        });
      });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-item';
      btn.dataset.id = n.id;
      btn.setAttribute('aria-current', n.id === selectedId ? 'true' : 'false');

      var title = document.createElement('span');
      title.className = 'note-item-title';
      title.textContent = n.title.trim() || 'Başlıksız not';

      var date = document.createElement('span');
      date.className = 'note-item-date';
      date.textContent = fmtDate(n.updatedAt);

      btn.appendChild(title);
      btn.appendChild(date);
      btn.addEventListener('click', function () { select(n.id); });
      li.appendChild(btn);
      li.appendChild(gripBtn(n));
      els.list.appendChild(li);
    });
  }

  // Kaydetme sırasında listeyi yeniden çizme: bas–bırak arasında hedef düğme
  // yok olur ve updatedAt sıçraması satırları imleç altından kaydırır; o aradaki
  // tıklama yutulur (senaryo: editörde yaz → hemen başka nota tıkla). Satırı
  // yerinde tazele; sıralama yalnız select()/renderList() çağrısında yenilenir.
  function refreshRow(n) {
    var btn = els.list.querySelector('.note-item[data-id="' + n.id + '"]');
    if (!btn) { renderList(); return; }
    btn.querySelector('.note-item-title').textContent = n.title.trim() || 'Başlıksız not';
    btn.querySelector('.note-item-date').textContent = fmtDate(n.updatedAt);
  }

  // Markdown önizleme: gövde metni güvenli HTML'e çevrilir (bkz. S.mdToHtml).
  function renderPreview() {
    els.preview.innerHTML = S.mdToHtml(els.body.value);
  }

  function renderEditor() {
    var n = get(selectedId);
    els.editor.hidden = !n;
    if (!n) return;
    els.title.value = n.title;
    els.body.value = n.body;
    renderPreview();
    els.meta.textContent = 'Güncellendi: ' + fmtDate(n.updatedAt);
  }

  function select(id) {
    var hadListFocus = els.list.contains(document.activeElement);
    flushSave();
    selectedId = id;
    renderList();
    renderEditor();
    // Liste düğmesi yeniden kuruldu; klavye odağını geri ver.
    if (hadListFocus) {
      var btn = els.list.querySelector('.note-item[data-id="' + id + '"]');
      if (btn) btn.focus();
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    var n = get(selectedId);
    if (!n) return;
    n.title = els.title.value;
    n.body = els.body.value;
    n.updatedAt = new Date().toISOString();
    var ok = persist();
    refreshRow(n);
    renderPreview();
    els.meta.textContent = ok ? 'Güncellendi: ' + fmtDate(n.updatedAt) : 'Kaydedilemedi!';
  }

  // "Yeni not" boş not kaydetmez: önce pop-up form açılır, not yalnız "Tamam" ile oluşur.
  function openCreateDialog() {
    flushSave();
    els.dialog.returnValue = '';
    els.newTitle.value = '';
    els.newBody.value = '';
    els.dialog.showModal();
    els.newTitle.focus();
  }

  function createFromDialog() {
    var draft = S.noteDraft(els.newTitle.value, els.newBody.value);
    if (!draft) return; // her iki alan da boş: not oluşturulmaz
    var now = new Date().toISOString();
    var n = { id: S.uid(), title: draft.title, body: draft.body, createdAt: now, updatedAt: now, order: Date.now() };
    notes.push(n);
    persist();
    select(n.id);
    els.title.focus();
  }

  function remove() {
    var n = get(selectedId);
    if (!n) return;
    if (!window.confirm('“' + (n.title.trim() || 'Başlıksız not') + '” silinsin mi?')) return;
    notes = notes.filter(function (x) { return x.id !== n.id; });
    persist();
    selectedId = sorted()[0] ? sorted()[0].id : null;
    renderList();
    renderEditor();
    // Silinen notun düğmesi yok oldu; odağı güvenli yere taşı.
    if (els.editor.hidden) els.createBtn.focus();
  }

  function init() {
    els = {
      list: document.getElementById('note-list'),
      empty: document.getElementById('note-empty'),
      editor: document.getElementById('note-editor'),
      title: document.getElementById('note-title'),
      body: document.getElementById('note-body'),
      meta: document.getElementById('note-meta'),
      createBtn: document.getElementById('note-new'),
      deleteBtn: document.getElementById('note-delete'),
      dialog: document.getElementById('note-dialog'),
      preview: document.getElementById('note-preview'),
      newTitle: document.getElementById('note-new-title'),
      newBody: document.getElementById('note-new-body')
    };

    notes = S.load(S.KEYS.notes, []);
    if (!Array.isArray(notes)) notes = [];
    // Geçiş: order alanı olmayan eski kayıtlar tamamlanır ve bir kez geri yazılır.
    var migrated = notes.some(function (n) { return typeof n.order !== 'number'; });
    notes = S.normalizeNotes(notes);
    if (migrated) persist();
    selectedId = sorted()[0] ? sorted()[0].id : null;

    els.createBtn.addEventListener('click', openCreateDialog);
    els.deleteBtn.addEventListener('click', remove);
    // Pop-up: "Tamam" (returnValue "ok") notu kurar; "İptal" ve Esc yalnız kapatır.
    els.dialog.addEventListener('close', function () {
      if (els.dialog.returnValue === 'ok') createFromDialog();
    });
    els.title.addEventListener('input', scheduleSave);
    els.body.addEventListener('input', function () {
      scheduleSave();
      renderPreview();
    });
    // Düzenleyiciyi kapatırken kaybetme: sekme değişiminde ve sayfadan çıkarken yaz.
    document.addEventListener('focusout', function (e) {
      if (els.editor.contains(e.target)) flushSave();
    });
    window.addEventListener('beforeunload', flushSave);

    renderList();
    renderEditor();
  }

  window.FocusNotes = { init: init };
})();