'use strict';
/* Not görünümü regresyonları (gerçek tarayıcı):
   1) bir notu açmak/okumak liste sırasını DEĞİŞTİRMEZ (sayfa tazelenince de),
   2) ↑/↓ ile elle sıralama mümkün ve kalıcı,
   3) markdown önizleme biçimlendirir ve HTML girdisini kaçırır,
   4) dar genişlikte (375px) yatay taşma yoktur (uzun nowrap başlık kırışır),
   5) sürükle-bırak sıralaması kalıcıdır (order alanına yazar, updatedAt'e dokunmaz).
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser, seedNotes } = require('./browser-harness.js');

const SEED = [
  { id: 'n1', title: 'Bir', body: 'bir', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', order: 3 },
  { id: 'n2', title: 'İki', body: 'iki', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', order: 2 },
  { id: 'n3', title: 'Üç', body: 'üç', createdAt: '2026-10-03T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', order: 1 }
];

describe('not görünümü — sıra sabitliği, elle sıralama, markdown', () => {
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

  async function withPage(t, fn) {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await fn(page);
    } finally {
      await page.close();
    }
  }

  const listOrder = (page) => page.$$eval('.note-item', (els) => els.map((e) => e.dataset.id));

  it('bir notu açmak/okumak liste sırasını değiştirmez; sıra tazelemede de sabit', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, SEED);
      assert.deepEqual(await listOrder(page), ['n1', 'n2', 'n3']);
      // Alttan başlayarak oku: eski hata — okuma updatedAt'i patlatıp sırayı oynatıyordu.
      await page.click('.note-item[data-id="n3"]');
      await page.click('.note-item[data-id="n2"]');
      assert.deepEqual(await listOrder(page), ['n1', 'n2', 'n3'], 'okumak sırayı oynattı');
      await page.reload();
      await page.click('#tab-notes');
      assert.deepEqual(await listOrder(page), ['n1', 'n2', 'n3'], 'sıra sayfa tazelenince de oynadı');
    });
  });

  it('dar genişlikte (375px) yatay taşma yoktur — uzun başlık kırışır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await page.setViewportSize({ width: 375, height: 720 });
      await seedNotes(page, baseUrl, SEED.concat([{
        id: 'uzun',
        title: 'Uzun başlıklı not — satır taşması testi için epey uzun bir başlık yazısı burada',
        body: 'Gövde.',
        createdAt: '2026-10-03T09:00:00.000Z',
        updatedAt: '2026-10-04T09:00:00.000Z',
        order: 0
      }]));
      await page.click('.note-item[data-id="uzun"]');
      const size = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      }));
      assert.ok(
        size.scrollW <= size.clientW,
        'dar genişlikte yatay taşma: scrollWidth ' + size.scrollW + ' > clientWidth ' + size.clientW
      );
    });
  });

  it('↑/↓ düğmeleri elle sıralar ve sıra kalıcılaşır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, SEED);
      await page.click('.note-move[data-id="n3"][data-dir="-1"]');
      assert.deepEqual(await listOrder(page), ['n1', 'n3', 'n2']);
      await page.click('.note-move[data-id="n3"][data-dir="-1"]');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2']);
      await page.reload();
      await page.click('#tab-notes');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'elle sıra kalıcı değil');
    });
  });

  it('markdown önizleme biçimlendirir; HTML girdisi kaçırılır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, [{
        id: 'md',
        title: 'MD',
        body: '# Başlık\n\n- madde\n\n**kalın** *italik* `kod`\n\n<script>alert(1)</script>',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        order: 1
      }]);
      await page.click('.note-item[data-id="md"]');
      const html = await page.$eval('#note-preview', (el) => el.innerHTML);
      assert.match(html, /<h1>Başlık<\/h1>/);
      assert.match(html, /<ul><li>madde<\/li><\/ul>/);
      assert.match(html, /<strong>kalın<\/strong>/);
      assert.match(html, /<em>italik<\/em>/);
      assert.match(html, /<code>kod<\/code>/);
      assert.equal(html.includes('<script'), false);
      assert.match(html, /&lt;script&gt;/);
    });
  });
  it('sürükle-bırak sıralamayı değiştirir ve kalıcıdır (order alanına yazar)', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, SEED);
      // en alttaki satırı (n3) en üste sürükle-bırak
      await page.dragAndDrop('.note-row:nth-child(3)', '.note-row:nth-child(1)');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'sürükle-bırak sırayı değiştirmedi');
      await page.reload();
      await page.click('#tab-notes');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'sürükle-bırak sıralaması kalıcı değil');
    });
  });
});