'use strict';
/* Kabuk tema düğmesi regresyonları (gerçek tarayıcı):
   1) dar ekranda (375px) düğme simgeyle çizilir, başlığın karşısında sağ üst
      köşededir, sekmeler ikinci satıra iner; erişilebilir ad aria-label'dadır;
   2) tıklama html.dark'ı, simgeyi (ay↔güneş), aria-pressed ve aria-label'ı çevirir;
   3) geniş ekranda (1280px) metin etiketi kalır, simge çizilmez — masaüstü değişmez.
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

describe('kabuk — dar ekran tema düğmesi (simge, sağ üst köşe)', () => {
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

  const rect = (page, sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  });

  it('375px: simge sağ üst köşede, sekmeler alt satırda; geçişte ay↔güneş; 1280px: metin', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ colorScheme: 'light' }); // başlangıç: açık tema
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(baseUrl + '/index.html');
      await page.evaluate(() => localStorage.removeItem('focus-app:theme'));
      await page.reload();

      const header = await rect(page, '.app-header');
      const title = await rect(page, '.app-title');
      const btn = await rect(page, '#theme-toggle');
      const tabs = await rect(page, '.tabs');
      // Başlığın karşısında, ekranın sağ üst köşesi (header padding-inline = 24px).
      assert.ok(Math.abs((header.right - btn.right) - 24) <= 2,
        'düğme sağ üst köşede değil: header.sağ-düğme.sağ=' + (header.right - btn.right));
      assert.ok(btn.left > title.right, 'düğme başlığın karşısında değil');
      assert.ok(btn.bottom <= tabs.top + 1, 'düğme ilk satırda kalmadı (sekmeler üstte)');
      // Simge çizilir, metin gizli; dokunma alanı ve erişilebilir ad korunur.
      const icon = await rect(page, '.theme-toggle-icon');
      assert.ok(icon.w >= 16 && icon.h >= 16, 'simge çizilmedi: ' + JSON.stringify(icon));
      assert.equal(await page.$eval('.theme-toggle-text', (el) => getComputedStyle(el).display),
        'none', 'metin dar ekranda gizlenmedi');
      assert.ok(btn.w >= 44 && btn.h >= 44, 'dokunma alanı <44px: ' + btn.w + '×' + btn.h);
      assert.equal(await page.getAttribute('#theme-toggle', 'aria-label'), 'Koyu tema');
      assert.equal(await page.getAttribute('#theme-toggle', 'aria-pressed'), 'false');
      assert.ok((await rect(page, '.theme-icon-moon')).w > 0, 'ay simgesi görünmüyor');
      assert.equal((await rect(page, '.theme-icon-sun')).w, 0, 'güneş simgesi çiziliyor');

      // Tıkla → koyu: html.dark, güneş/ay geçişi, ad + durum güncel.
      await page.click('#theme-toggle');
      assert.equal(await page.$eval('html', (el) => el.classList.contains('dark')), true);
      assert.equal(await page.getAttribute('#theme-toggle', 'aria-pressed'), 'true');
      assert.equal(await page.getAttribute('#theme-toggle', 'aria-label'), 'Aydınlık tema');
      assert.ok((await rect(page, '.theme-icon-sun')).w > 0, 'güneş simgesi belmedi');
      assert.equal((await rect(page, '.theme-icon-moon')).w, 0, 'ay simgesi hâlâ çiziliyor');
      // Depo sözleşmesi: S.save değerleri JSON kodlu yazar (düz 'dark' değil '"dark"').
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('focus-app:theme'))), 'dark');

      // Geniş ekran: metin etiketi geri gelir, simge çizilmez — masaüstü değişmez.
      await page.setViewportSize({ width: 1280, height: 800 });
      assert.equal((await rect(page, '.theme-toggle-icon')).w, 0, 'simge masaüstünde çiziliyor');
      assert.ok((await rect(page, '.theme-toggle-text')).w > 40, 'metin masaüstünde görünmüyor');
    } finally {
      await page.close();
    }
  });
});
