'use strict';
/* Ayarlar pop-up'ı regresyonları (gerçek tarayıcı):
   1) dar ekranda (375px) Ayarlar düğmesi YALNIZ simge çizilir (metin gizli,
      ≥44px dokunma alanı, ad aria-label'dan) ve tema düğmesinin SOLUNDA kalır;
      tema düğmesi sağ üst köşedeki yerini kaybetmez;
   2) geniş ekranda (1280px) metin etiketi çizilir, simge çizilmez;
   3) tıklama yerel <dialog>'u açar: aria-expanded, odak dialog'un içinde,
      süre alanları görünür; X ve ESC kapatır, odak tetikleyiciye döner;
   4) süre ayarları artık dialog'un içinde ama işlevi aynı: Odak (dk) değişimi
      sayaç etiketini ve kalıcı state'i günceller, yenilemede yaşar;
   5) dialog Pomodoro sekmesi KAPALIYKEN de açılır (markup body seviyesinde —
      panele taşınırsa `hidden` yüzünden erişilemez olur).
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

describe('ayarlar — başlıktaki düğme ve süre ayarları pop-up\'ı', () => {
  let server;
  let baseUrl;
  let browser = null;
  let launchError = null;

  before(async () => {
    server = await serveProject();
    baseUrl = server.baseUrl;
    const res = await launchBrowser();
    browser = res.browser;
    launchError = res.error;
  });

  after(async () => {
    if (browser) await browser.close();
    await server.close();
  });

  const box = (page, sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom,
      w: r.width, h: r.height, display: cs.display };
  });

  const openState = (page) => page.evaluate(() => ({
    open: document.getElementById('settings-dialog').open,
    expanded: document.getElementById('settings-toggle').getAttribute('aria-expanded'),
    // Odak dialog'un içinde mi (odak tuzağı + görünür başlangıç odağı).
    inside: document.getElementById('settings-dialog').contains(document.activeElement),
    active: document.activeElement.id || document.activeElement.tagName
  }));

  const freshPage = async (page, width) => {
    await page.setViewportSize({ width: width, height: 800 });
    await page.goto(baseUrl + '/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  };

  it('375px simge-only + sol komşu; 1280px metin; aç/X/ESC; süre alanı kalıcı; başka sekmeden erişim',
    { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ colorScheme: 'light' });

      /* ── 1) dar ekran: simge-only düğme ─────────────────── */
      await freshPage(page, 375);

      const sBtn = await box(page, '#settings-toggle');
      const tBtn = await box(page, '#theme-toggle');
      const header = await box(page, '.app-header');
      assert.equal(await page.$eval('.settings-toggle-text', (el) => getComputedStyle(el).display),
        'none', 'Ayarlar metni dar ekranda gizlenmedi');
      const sIcon = await box(page, '.settings-toggle-icon');
      assert.ok(sIcon.w >= 16 && sIcon.h >= 16, 'Ayarlar simgesi çizilmedi: ' + JSON.stringify(sIcon));
      assert.ok(sBtn.w >= 44 && sBtn.h >= 44, 'dokunma alanı <44px: ' + sBtn.w + '×' + sBtn.h);
      // Yan yana iki düğme; Ayarlar solda, tema sağ üst köşede (shell-theme kilidi).
      assert.ok(sBtn.right <= tBtn.left + 1, 'Ayarlar düğmesi tema düğmesinin solunda değil');
      assert.ok(sBtn.bottom <= tBtn.bottom + 1 && tBtn.top <= sBtn.top + 1,
        'iki düğme aynı satırda değil');
      assert.ok(Math.abs((header.right - tBtn.right) - 24) <= 2,
        'tema düğmesi sağ üst köşeden düştü: ' + (header.right - tBtn.right));
      // Görünür metin yok → ad aria-label'dan gelmeli (ekran okuyucu için tek kaynak).
      assert.equal(await page.getAttribute('#settings-toggle', 'aria-label'), 'Ayarlar');
      assert.equal(await page.getAttribute('#settings-toggle', 'aria-haspopup'), 'dialog');
      assert.equal(await page.getAttribute('#settings-toggle', 'aria-expanded'), 'false');

      /* ── 3) aç / X ile kapat / odak geri dönsün ─────────── */
      await page.click('#settings-toggle');
      let st = await openState(page);
      assert.equal(st.open, true, 'dialog açılmadı');
      assert.equal(st.expanded, 'true', 'aria-expanded güncellenmedi');
      assert.equal(st.inside, true, 'odak dialog\'un içine girmedi');

      // X üst sağ köşede ve erişilebilir ada sahip.
      const x = await box(page, '#settings-close');
      const dlg = await box(page, '#settings-dialog');
      assert.ok(x.w >= 44 && x.h >= 44, 'X dokunma alanı <44px: ' + x.w + '×' + x.h);
      assert.ok(x.right <= dlg.right + 1 && dlg.right - x.right <= 32,
        'X sağ üst köşede değil: ' + JSON.stringify({ x: x.right, dlg: dlg.right }));
      assert.ok(x.top <= dlg.top + 40, 'X üstte değil: ' + JSON.stringify({ x: x.top, dlg: dlg.top }));
      assert.equal(await page.getAttribute('#settings-close', 'aria-label'), 'Ayarları kapat');

      // Dialog başlığı + taşınan süre alanları görünür.
      assert.equal((await page.$eval('#settings-dialog-heading', (el) => el.textContent)).trim(), 'Ayarlar');
      const focusInput = await box(page, '#pomo-focus-min');
      assert.ok(focusInput.w > 0 && focusInput.h > 0, 'Odak (dk) alanı dialog içinde çizilmedi');
      // Alanlar artık Pomodoro panelinin DEĞİL, dialog'un çocuğu.
      assert.equal(await page.evaluate(() =>
        document.getElementById('panel-pomodoro').contains(document.getElementById('pomo-focus-min'))),
        false, 'süre alanı hâlâ Pomodoro panelinde');

      await page.click('#settings-close');
      st = await openState(page);
      assert.equal(st.open, false, 'X dialog\'u kapatmadı');
      assert.equal(st.expanded, 'false', 'aria-expanded kapanışta güncellenmedi');
      assert.equal(st.active, 'settings-toggle', 'odak tetikleyiciye dönmedi: ' + st.active);

      /* ── ESC ile kapatma ────────────────────────────────── */
      await page.click('#settings-toggle');
      assert.equal((await openState(page)).open, true, 'ikinci açılış olmadı');
      await page.keyboard.press('Escape');
      // ESC bizim handler'ımızdan geçmez; aria-expanded'ı `toggle` olayı (kuyruklu
      // görev) düzeltir → keyfi uyku değil, gerçek geçişi bekle.
      await page.waitForFunction(() =>
        document.getElementById('settings-toggle').getAttribute('aria-expanded') === 'false');
      st = await openState(page);
      assert.equal(st.open, false, 'ESC dialog\'u kapatmadı');
      assert.equal(st.expanded, 'false', 'ESC sonrası aria-expanded false olmadı');

      /* ── 4) süre ayarı dialog içinden çalışıyor ve kalıcı ── */
      await page.click('#settings-toggle');
      await page.fill('#pomo-focus-min', '45');
      await page.click('#settings-dialog-heading'); // change olayı için alandan çık
      assert.equal(await page.$eval('#pomo-time', (el) => el.textContent), '45:00',
        'Odak (dk) değişikliği sayaca yansımadı');
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('focus-app:pomodoro')).settings.focusMin);
      assert.equal(saved, 45, 'ayar kalıcılaştırılmadı: ' + saved);
      await page.keyboard.press('Escape');
      await page.reload();
      assert.equal(await page.$eval('#pomo-focus-min', (el) => el.value), '45',
        'yenilemede odak süresi geri yüklenmedi');
      assert.equal(await page.$eval('#pomo-time', (el) => el.textContent), '45:00');
      // Zil tercihi de taşındı ve çalışıyor.
      await page.click('#settings-toggle');
      await page.click('#pomo-sound');
      assert.equal(await page.$eval('#pomo-sound-state', (el) => el.textContent.trim()), 'Kapalı');
      await page.keyboard.press('Escape');

      /* ── 5) Pomodoro sekmesi kapalıyken de erişilebilir ──── */
      await page.click('#tab-chain');
      assert.equal(await page.$eval('#panel-pomodoro', (el) => el.hidden), true,
        'Pomodoro paneli kapanmadı — test geçersiz olurdu');
      await page.click('#settings-toggle');
      st = await openState(page);
      assert.equal(st.open, true, 'Pomodoro sekmesi kapalıyken Ayarlar açılmadı');
      assert.ok((await box(page, '#pomo-focus-min')).w > 0, 'kapalı sekmede süre alanı çizilmedi');
      await page.click('#settings-close');

      /* ── 2) geniş ekran: metin etiketi, simge yok ───────── */
      await page.setViewportSize({ width: 1280, height: 800 });
      assert.equal((await box(page, '.settings-toggle-icon')).w, 0, 'simge masaüstünde çiziliyor');
      assert.ok((await box(page, '.settings-toggle-text')).w > 40, 'metin masaüstünde görünmüyor');
      assert.ok((await box(page, '#settings-toggle')).right <= (await box(page, '#theme-toggle')).left + 1,
        'masaüstünde sıra bozuldu');
    } finally {
      await page.close();
    }
  });

  it('Saat görünümü: Dijital/Kadran seçimi kadranı çizer, dijitali gizler; yenilemede kalıcı',
    { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ colorScheme: 'light' });
      await freshPage(page, 1280);

      // Varsayılan digital: kadran gizli, dijital görünür.
      assert.equal(await page.evaluate(() => document.getElementById('pomo-dial').hasAttribute('hidden')), true,
        'varsayılan modda kadran gizli değil');
      assert.ok((await box(page, '#pomo-time')).w > 0, 'varsayılan dijital saat görünmüyor');

      // Kadran'a geç: kadran çizilir, dijital metin yalnızca görsel gizlenir.
      await page.click('#settings-toggle');
      await page.click('#pomo-display-dial');
      assert.equal(await page.evaluate(() =>
        document.getElementById('pomo-display-dial').getAttribute('aria-pressed')), 'true');
      assert.equal(await page.evaluate(() => document.getElementById('pomo-dial').hasAttribute('hidden')), false,
        'kadran gösterilmedi');
      assert.ok((await box(page, '#pomo-dial')).w > 0, 'kadran çizilmedi');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).display), 'none',
        'kadran modunda alttaki ilerleme çubuğu (.bar) çizilmemeli');
      assert.equal(await page.evaluate(() =>
        document.getElementById('pomo-time').classList.contains('visually-hidden')), true,
        'kadran modunda dijital metin görünür kalmalı (yalnız görsel gizlenmeli)');
      const savedMode = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('focus-app:pomodoro')).settings.displayMode);
      assert.equal(savedMode, 'dial', 'görünüm ayarı kalıcılaşmadı');
      await page.keyboard.press('Escape');

      // Yenilemede kadran modu geri yüklenir.
      await page.reload();
      assert.equal(await page.evaluate(() => document.getElementById('pomo-dial').hasAttribute('hidden')), false,
        'yenilemede kadran modu geri yüklenmedi');
      assert.equal(await page.evaluate(() =>
        document.getElementById('pomo-time').classList.contains('visually-hidden')), true);

      // Dijital'e dön: kadran kapanır, dijital saat yeniden çizilir.
      await page.click('#settings-toggle');
      await page.click('#pomo-display-digital');
      assert.equal(await page.evaluate(() => document.getElementById('pomo-dial').hasAttribute('hidden')), true,
        'dijitale dönüşte kadran kapanmadı');
      assert.ok((await box(page, '#pomo-time')).w > 0, 'dijital saate dönüş çizilmedi');
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).display), 'none',
        'dijital moda dönüşte ilerleme çubuğu (.bar) yeniden görünür olmalı');
    } finally {
      await page.close();
    }
  });

  it('Saat boyutu: masaüstünde hafif büyür, dar ekranda küçülmez', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ colorScheme: 'light' });
      await freshPage(page, 1280);

      // Masaüstü (1280px): dijital 5.5rem (88px) — eski 5rem'den hafif büyük.
      assert.equal(await page.$eval('#pomo-time',
        (el) => parseFloat(getComputedStyle(el).fontSize)), 88,
      'masaüstü dijital saat 5.5rem olmalı');
      // Kadran 18rem (288px) — eski 16rem'den hafif büyük.
      await page.click('#settings-toggle');
      await page.click('#pomo-display-dial');
      assert.equal((await box(page, '#pomo-dial')).w, 288,
        'masaüstü kadran 18rem olmalı');
      await page.keyboard.press('Escape');

      // Dar ekran (375px): saat CİDDİ küçülmez — dijital 5rem (80px), kadran 15rem (240px).
      await page.setViewportSize({ width: 375, height: 812 });
      assert.equal(await page.$eval('#pomo-time',
        (el) => parseFloat(getComputedStyle(el).fontSize)), 80,
      'dar ekranda dijital saat sabit 5rem kalir (kuculmez)');
      assert.equal((await box(page, '#pomo-dial')).w, 240,
        'dar ekranda kadran sabit 15rem kalir (kuculmez)');
    } finally {
      await page.close();
    }
  });
});
