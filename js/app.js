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

    // Düğme içeriği metin + simge parçalarından oluşur; textContent simgeyi de
    // siler. Metin parçasını güncelle; dar ekranda metin CSS'le gizlendiğinde
    // erişilebilir ad aria-label'dan gelir (her iki modda aynı metin).
    var label = btn.querySelector('.theme-toggle-text');

    function apply() {
      var name = dark ? 'Aydınlık tema' : 'Koyu tema';
      document.documentElement.classList.toggle('dark', dark);
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', name);
      if (label) label.textContent = name; else btn.textContent = name;
    }

    btn.addEventListener('click', function () {
      dark = !dark;
      persist(S.KEYS.theme, dark ? 'dark' : 'light');
      apply();
    });
    apply();
  }

  /* Ayarlar pop-up'ı: başlıktaki düğme yerel <dialog>'u showModal ile açar.
     Yerel dialog seçildi çünkü odak tuzağı + Esc ile kapatma + arka planı
     ilgisizleştirme (inert) tarayıcıda bedava; elle kurulan bir katman bunu
     yeniden yazmak olurdu. Kapanış odakları: X düğmesi ve Esc. */
  function initSettings() {
    var btn = document.getElementById('settings-toggle');
    var dialog = document.getElementById('settings-dialog');
    var closeBtn = document.getElementById('settings-close');

    // showModal yoksa (çok eski tarayıcı) düğme hiçbir şey yapmasın: ölü bir
    // düğmede aria-expanded "açık" durmak, açılmayan bir panel var demektir.
    if (!dialog || typeof dialog.showModal !== 'function') {
      btn.hidden = true;
      return;
    }

    // aria-expanded'ı dialog.open'dan TEK yerden eşitle.
    function sync() { btn.setAttribute('aria-expanded', String(dialog.open)); }

    // İki kez çağrılıyor, bilerek: `toggle` olayı kuyruklu görevdir, yani
    // showModal()/close() döndükten SONRAKAİ tick'te koşar. Tıklayan bağlamda
    // senkron çağırılmazsa düğme, kapanan dialog'un arkasında bir tick boyunca
    // aria-expanded="true" taşır (ekran okuyucu/o an okuyan bir test görür).
    // `toggle` dinleyicisi ise ESC gibi bizim handler'ımızdan geçmeyen
    // kapanış yollarını yakalar.
    btn.addEventListener('click', function () { dialog.showModal(); sync(); });
    closeBtn.addEventListener('click', function () { dialog.close(); sync(); });
    dialog.addEventListener('toggle', sync);

    // Kapanışta odak tetikleyiciye dönsün. tarayıcılar genelde geri verir;
    // odak body'ye düşünce (ESC sonrası bazı yollar) biz döndürüyoruz.
    dialog.addEventListener('close', function () {
      if (document.activeElement === document.body) btn.focus();
    });
  }

  window.FocusApp = { persist: persist };

  initTheme();
  initSettings();
  initTabs();
  window.FocusPomodoro.init();
  window.FocusNotes.init();
  window.FocusTodos.init();
  window.FocusChain.init();
})();