'use strict';
/* Yapılacaklar görünümü regresyonları (gerçek tarayıcı):
   1) tutamak ile elle sıralama: klavye ↑/↓ taşır ve kalıcıdır,
   2) dokunmatik tutamak sürükleme sıralamayı değiştirir ve kalıcıdır,
   3) satır düzeyinde HTML5 DnD çalışır; yalnız order değişir (createdAt sabit),
   4) tamamlama işareti/filtre değişimi sırayı DEĞİŞTİRMEZ.
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

const SEED = [
  { id: 't1', text: 'Bir madde', done: false, createdAt: '2026-10-01T09:00:00.000Z', order: 3 },
  { id: 't2', text: 'İki madde', done: false, createdAt: '2026-10-02T09:00:00.000Z', order: 2 },
  { id: 't3', text: 'Üç madde', done: false, createdAt: '2026-10-03T09:00:00.000Z', order: 1 }
];

async function seedTodos(page, baseUrl, todos) {
  await page.goto(baseUrl + '/index.html');
  await page.evaluate((list) => localStorage.setItem('focus-app:todos', JSON.stringify(list)), todos);
  await page.reload();
  await page.click('#tab-todos');
}

describe('yapılacaklar — tutamak ile sıralama', () => {
  let server;
  let baseUrl;
  let browser = null;
  let launchError = null;

  before(async () => {
    server = await serveProject();
    baseUrl = server.baseUrl;
    const { browser: b, error } = await launchBrowser();
    browser = b;
    launchError = error;
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

  const listOrder = (page) => page.$$eval('.note-grip', (els) => els.map((e) => e.dataset.id));

  it('tutamak ile elle sıralama: ↑/↓ ok tuşları taşır ve kalıcıdır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedTodos(page, baseUrl, SEED);
      assert.deepEqual(await listOrder(page), ['t1', 't2', 't3']);
      await page.focus('.note-grip[data-id="t3"]');
      await page.keyboard.press('ArrowUp');
      assert.deepEqual(await listOrder(page), ['t1', 't3', 't2']);
      await page.keyboard.press('ArrowUp');
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2']);
      await page.reload();
      await page.click('#tab-todos');
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2'], 'elle sıra kalıcı değil');
    });
  });

  it('dokunmatik tutamak sürükleme sıralamayı değiştirir ve kalıcıdır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedTodos(page, baseUrl, SEED);
      await page.evaluate(() => {
        const grip = document.querySelector('.note-grip[data-id="t3"]');
        const target = document.querySelectorAll('.todo-item')[0];
        const g = grip.getBoundingClientRect();
        const tt = target.getBoundingClientRect();
        const at = (x, y) => ({ bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y });
        grip.dispatchEvent(new PointerEvent('pointerdown', at(g.x + 5, g.y + 5)));
        grip.dispatchEvent(new PointerEvent('pointermove', at(tt.x + tt.width / 2, tt.y + tt.height / 2)));
        grip.dispatchEvent(new PointerEvent('pointerup', at(tt.x + tt.width / 2, tt.y + tt.height / 2)));
      });
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2'], 'dokunmatik sürükleme sırayı değiştirmedi');
      await page.reload();
      await page.click('#tab-todos');
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2'], 'dokunmatik sıra kalıcı değil');
    });
  });

  it('satır düzeyinde HTML5 DnD çalışır; yalnız order değişir (createdAt sabit)', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedTodos(page, baseUrl, SEED);
      await page.dragAndDrop('.todo-item:nth-child(3)', '.todo-item:nth-child(1)');
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2'], 'DnD sırayı değiştirmedi');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('focus-app:todos')));
      const t3 = stored.find((n) => n.id === 't3') || {};
      assert.equal(t3.createdAt, '2026-10-03T09:00:00.000Z', 'yalnız order değişmeli (createdAt sabit)');
      await page.reload();
      await page.click('#tab-todos');
      assert.deepEqual(await listOrder(page), ['t3', 't1', 't2'], 'DnD sıralaması kalıcı değil');
    });
  });

  it('tamamlama işareti ve filtre değişimi sırayı değiştirmez', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await seedTodos(page, baseUrl, SEED);
      await page.click('.todo-item input[data-id="t1"]');
      assert.deepEqual(await listOrder(page), ['t1', 't2', 't3'], 'işaretleme sırayı oynattı');
      await page.click('#filter-active');
      await page.click('#filter-all');
      assert.deepEqual(await listOrder(page), ['t1', 't2', 't3'], 'filtre değişimi sırayı oynattı');
      await page.reload();
      await page.click('#tab-todos');
      assert.deepEqual(await listOrder(page), ['t1', 't2', 't3'], 'sıra tazelemede de sabit kalmalı');
    });
  });
});