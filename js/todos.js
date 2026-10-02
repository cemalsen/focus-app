/* Yapılacaklar listesi — ekle, tamamla, sil, filtrele. */
(function () {
  'use strict';

  var S = window.FocusStore;

  var todos = [];        // {id,text,done,createdAt}
  var filter = 'all';    // 'all' | 'active' | 'done'
  var els = {};

  function persist() {
    return window.FocusApp.persist(S.KEYS.todos, todos);
  }

  function visible() {
    return todos.filter(function (t) {
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

  function renderList() {
    els.list.innerHTML = '';
    visible().forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'todo-item' + (t.done ? ' done' : '');

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
    todos.push({ id: S.uid(), text: trimmed, done: false, createdAt: new Date().toISOString() });
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