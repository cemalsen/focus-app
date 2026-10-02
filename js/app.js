/* Kabuk: sekme gezinmesi + tema seçimi + modül başlatma. */
(function () {
  'use strict';

  var S = window.FocusStore;
  var TAB_IDS = ['tab-pomodoro', 'tab-notes', 'tab-todos', 'tab-chain'];

  // Kayıt başarısızsa (kota dolu / gizli mod) kullanıcıya görünür uyarı göster.
  function persist(key, value) {
    var ok = S.save(key, value);
    var warn = document.getElementById('save-warning');
    if (warn) warn.hidden = ok;
    return ok;
  }

  function initTabs() {
    var tabs = TAB_IDS.map(function (id) { return document.getElementById(id); });

    function activate(tab) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(tab); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          activate(next);
          next.focus();
        }
      });
    });

    activate(tabs[0]);
  }

  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    var stored = S.load(S.KEYS.theme, null);
    var prefersDark = window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
    var dark = stored === null ? prefersDark : stored === 'dark';

    function apply() {
      document.documentElement.classList.toggle('dark', dark);
      btn.setAttribute('aria-pressed', String(dark));
      btn.textContent = dark ? 'Aydınlık tema' : 'Koyu tema';
    }

    btn.addEventListener('click', function () {
      dark = !dark;
      persist(S.KEYS.theme, dark ? 'dark' : 'light');
      apply();
    });
    apply();
  }

  window.FocusApp = { persist: persist };

  initTheme();
  initTabs();
  window.FocusPomodoro.init();
  window.FocusNotes.init();
  window.FocusTodos.init();
  window.FocusChain.init();
})();