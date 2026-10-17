'use strict';
/* Not görünümü regresyonları (gerçek tarayıcı):
   1) bir notu açmak/okumak liste sırasını DEĞİŞTİRMEZ (sayfa tazelenince de),
   2) elle sıralama tutamaktan: klavye ↑/↓ ve dokunmatik sürükleme; kalıcı,
   3) markdown önizleme biçimlendirir ve HTML girdisini kaçırır,
   4) dar genişlikte (375px) yatay taşma yoktur (uzun nowrap başlık kırışır),
   5) sürükle-bırak sıralaması kalıcıdır (order alanına yazar, updatedAt'e dokunmaz),
   6) dar ekranda (≤48rem) ön izleme kapalı başlar; seçim paneli listenin üstünde
      açılır ve X kapatır; geniş ekranda davranış değişmez.
   7) dar ekranda X düğmesi H3 başlığıyla AYNI satırda dikey ortalanır ve
      .note-preview-wrap bloğunun üstüne binmez; X ile önizleme bloğunun
      üst/alt nefes boşlukları korunur.
   8) not yokken görünen #note-empty, .notes-layout genişliğini doldurur —
      içeriğine göre daralıp kısa blok OLMAZ (1280px ve 375px'te ölçülür).
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

  it('dar ekranda ön izleme kapalı başlar; seçim paneli listenin üstünde açılır, X kapatır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await page.setViewportSize({ width: 375, height: 720 });
      await seedNotes(page, baseUrl, SEED);
      // init ilk notu kendiliğinden seçer; dar ekranda panel yine de kapalı gelmeli.
      assert.equal(await page.isVisible('#note-editor'), false, 'ön izleme dar ekranda açık başladı');
      await page.click('.note-item[data-id="n2"]');
      assert.equal(await page.isVisible('#note-editor'), true, 'seçim ön izleme panelini açmadı');
      assert.equal(await page.isVisible('#note-close'), true, 'kapatma (X) düğmesi görünmüyor');
      const panelBottom = await page.$eval('#note-editor', (el) => el.getBoundingClientRect().bottom);
      const listTop = await page.$eval('#note-list', (el) => el.getBoundingClientRect().top);
      assert.ok(panelBottom <= listTop + 1,
        'panel listenin üstünde değil: panel.bottom=' + panelBottom + ' list.top=' + listTop);
      await page.click('#note-close');
      assert.equal(await page.isVisible('#note-editor'), false, 'X ön izlemeyi kapatmadı');
      // Aynı notu yeniden seçmek paneli tekrar açar.
      await page.click('.note-item[data-id="n2"]');
      assert.equal(await page.isVisible('#note-editor'), true, 'yeniden seçim paneli açmadı');
      // Geniş ekrana geçiş: seçili notun paneli görünür kalır, X çizilmez (masaüstü değişmez).
      await page.setViewportSize({ width: 1280, height: 800 });
      assert.equal(await page.isVisible('#note-editor'), true, 'masaüstünde panel görünmez oldu');
      assert.equal(await page.isVisible('#note-close'), false, 'X masaüstünde görünüyor');
    });
  });

  it('dar ekranda X başlıkla hizalıdır, önizlemeye binmez; nefes boşlukları korunur', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await page.setViewportSize({ width: 375, height: 720 });
      await seedNotes(page, baseUrl, SEED);
      await page.click('.note-item[data-id="n2"]'); // ön izleme açık
      const r = await page.evaluate(() => {
        const box = (s) => {
          const b = document.querySelector(s).getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, cy: b.top + b.height / 2 };
        };
        return { x: box('#note-close'), h: box('.note-view-title'), w: box('#note-preview-wrap'), f: box('#note-editor > .row'), e: box('#note-editor') };
      });
      assert.ok(Math.abs(r.x.cy - r.h.cy) <= 2.5,
        'X, H3 başlığıyla aynı dikey merkezde değil: X.cy=' + r.x.cy + ' H3.cy=' + r.h.cy);
      assert.ok(r.x.top - r.e.top >= 4,
        'X satırının ÜST nefes boşluğu yok: X.top−panel.top=' + (r.x.top - r.e.top));
      assert.ok(r.x.bottom + 8 <= r.w.top,
        'X önizleme bloğunun üstüne biniyor: X.bottom=' + r.x.bottom + ' önizleme.top=' + r.w.top);
      assert.ok(r.f.top - r.w.bottom >= 16,
        'önizleme bloğunun alt nefes boşluğu yok: boşluk=' + (r.f.top - r.w.bottom));
    });
  });

  it('not yokken #note-empty .notes-layout genişliğini doldurur (kısa blok olmaz)', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedNotes(page, baseUrl, []); // boş kutu: editör gizli, boş durum görünür
      assert.equal(await page.isVisible('#note-editor'), false, 'editör boş kutuda görünür');
      assert.equal(await page.isVisible('#note-empty'), true, '#note-empty görünmüyor');
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: 800 });
        const m = await page.evaluate(() => ({
          e: document.querySelector('#note-empty').getBoundingClientRect().width,
          l: document.querySelector('.notes-layout').getBoundingClientRect().width
        }));
        assert.ok(m.e > 40 && m.l > 100,
          width + 'px: ölçüm sağlıksız — ölçülen kutulardan biri gizli: #note-empty=' + m.e + ' .notes-layout=' + m.l);
        assert.ok(Math.abs(m.e - m.l) <= 1,
          width + 'px: #note-empty içeriğe daraldı: genişlik=' + m.e + ' .notes-layout=' + m.l);
      }
    });
  });
});