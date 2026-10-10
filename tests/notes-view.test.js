'use strict';
/* Not görünümü regresyonları (gerçek tarayıcı):
   1) bir notu açmak/okumak liste sırasını DEĞİŞTİRMEZ (sayfa tazelenince de),
   2) elle sıralama tutamaktan: klavye ↑/↓ ve dokunmatik sürükleme; kalıcı,
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

  it('tutamak ile elle sıralama: ↑/↓ ok tuşları taşır ve kalıcıdır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, SEED);
      await page.focus('.note-grip[data-id="n3"]');
      await page.keyboard.press('ArrowUp');
      assert.deepEqual(await listOrder(page), ['n1', 'n3', 'n2']);
      await page.keyboard.press('ArrowUp');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2']);
      await page.reload();
      await page.click('#tab-notes');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'elle sıra kalıcı değil');
    });
  });

  it('dokunmatik tutamak sürükleme sıralamayı değiştirir ve kalıcıdır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, SEED);
      await page.evaluate(() => {
        const grip = document.querySelector('.note-grip[data-id="n3"]');
        const target = document.querySelectorAll('.note-row')[0];
        const g = grip.getBoundingClientRect();
        const tt = target.getBoundingClientRect();
        const at = (x, y) => ({ bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y });
        grip.dispatchEvent(new PointerEvent('pointerdown', at(g.x + 5, g.y + 5)));
        grip.dispatchEvent(new PointerEvent('pointermove', at(tt.x + tt.width / 2, tt.y + tt.height / 2)));
        grip.dispatchEvent(new PointerEvent('pointerup', at(tt.x + tt.width / 2, tt.y + tt.height / 2)));
      });
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'dokunmatik sürükleme sırayı değiştirmedi');
      await page.reload();
      await page.click('#tab-notes');
      assert.deepEqual(await listOrder(page), ['n3', 'n1', 'n2'], 'dokunmatik sıra kalıcı değil');
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
  it('not önce salt-okur önizlemeyle açılır; “Düzenle” mevcut formu açar, “Bitti” kaydeder ve önizlemeye döner', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, [{
        id: 'v1',
        title: 'V',
        body: '# Selam',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        order: 1
      }]);
      await page.click('.note-item[data-id="v1"]');
      // Görünüm modu: form gizli, önizleme birincil içerik (aria-hidden="false").
      assert.equal(await page.isVisible('#note-form'), false, 'form seçimle hemen açıldı');
      assert.equal(await page.isVisible('#note-edit'), true, 'Düzenle düğmesi görünmüyor');
      assert.equal(await page.$eval('#note-preview-wrap', (el) => el.getAttribute('aria-hidden')), 'false');
      assert.match(await page.$eval('#note-preview', (el) => el.innerHTML), /<h1>Selam<\/h1>/);
      // Düzenle: mevcut form ortaya çıkar, önizleme aynaya döner.
      await page.click('#note-edit');
      assert.equal(await page.isVisible('#note-form'), true, 'Düzenle formu açmadı');
      assert.equal(await page.inputValue('#note-title'), 'V');
      await page.fill('#note-body', '# Selam\n\nyeni satır');
      await page.fill('#note-title', 'W');
      // Bitti: kaydet ve önizlemeye dön.
      await page.click('#note-done');
      assert.equal(await page.isVisible('#note-form'), false, 'Bitti önizlemeye döndürmedi');
      // Regresyon: başlık değişince görünüm başlığı bayat kalmasın ("V" değil "W").
      assert.equal(await page.$eval('#note-view-title', (el) => el.textContent), 'W');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('focus-app:notes'))[0]);
      assert.equal(stored.title, 'W', 'Bitti yeni başlığı kaydetmedi');
      assert.equal(stored.body, '# Selam\n\nyeni satır', 'Bitti yazılanı kaydetmedi');
      assert.match(await page.$eval('#note-preview', (el) => el.innerHTML), /yeni satır/);
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
      const stamps = await page.evaluate(() => JSON.parse(localStorage.getItem('focus-app:notes')).map((n) => n.id + '=' + n.updatedAt));
      assert.ok(stamps.includes('n3=2026-10-03T09:00:00.000Z'), "sürükle-bırak updatedAt'e dokunmamalı: " + stamps.join(','));
    });
  });
});