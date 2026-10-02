/* Not alma aracı — başlık + gövde, otomatik kayıt, liste görünümü. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var SAVE_DELAY_MS = 300;

  var notes = [];       // {id,title,body,createdAt,updatedAt}
  var selectedId = null;
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
    return notes.slice().sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  }

  function get(id) {
    return notes.find(function (n) { return n.id === id; }) || null;
  }

  function renderList() {
    els.list.innerHTML = '';
    var items = sorted();
    els.empty.hidden = items.length > 0;

    items.forEach(function (n) {
      var li = document.createElement('li');
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
      els.list.appendChild(li);
    });
  }

  function renderEditor() {
    var n = get(selectedId);
    els.editor.hidden = !n;
    if (!n) return;
    els.title.value = n.title;
    els.body.value = n.body;
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
    renderList();
    els.meta.textContent = ok ? 'Güncellendi: ' + fmtDate(n.updatedAt) : 'Kaydedilemedi!';
  }

  function create() {
    flushSave();
    var now = new Date().toISOString();
    var n = { id: S.uid(), title: '', body: '', createdAt: now, updatedAt: now };
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
      deleteBtn: document.getElementById('note-delete')
    };

    notes = S.load(S.KEYS.notes, []);
    if (!Array.isArray(notes)) notes = [];
    selectedId = sorted()[0] ? sorted()[0].id : null;

    els.createBtn.addEventListener('click', create);
    els.deleteBtn.addEventListener('click', remove);
    els.title.addEventListener('input', scheduleSave);
    els.body.addEventListener('input', scheduleSave);
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