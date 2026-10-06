'use strict';
/* Yutulan tıklama kalıcı regresyon testi — "editörde yaz → hemen başka nota tıkla".
   Gerçek tarayıcıda (Playwright + sistem Chrome) koşar; DOM taklidi yok.
   Tüm paket: node --test tests/  (ya da npm test) */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser, seedNotes } = require('./browser-harness.js');

const SEED = [
  { id: 'n1', title: 'Eski not', body: 'bir', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' },
  { id: 'n2', title: 'Ikinci not', body: 'iki', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z' }
];

describe('not listesi — yutulan tıklama regresyonu', () => {
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

  it('editörde yazıp hemen başka nota tıklamak o notu seçer ve yazı kaybolmaz', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }

    const page = await browser.newPage();
    try {
      await seedNotes(page, baseUrl, SEED);
      await page.click('.note-item[data-id="n1"]');
      assert.equal(await page.inputValue('#note-title'), 'Eski not', 'ön koşul: n1 düzenleyicide açık');

      // Senaryo: editörde yaz → otomatik kayıt (300 ms) beklemeden HEMEN başka nota tıkla.
      await page.click('#note-title');
      await page.keyboard.press('End');
      await page.keyboard.type('X');
      await page.click('.note-item[data-id="n2"]');

      // Tıklama yutulursa seçim n1'de kalır ve düzenleyici "Eski notX" gösterir.
      assert.equal(
        await page.getAttribute('.note-item[aria-current="true"]', 'data-id'),
        'n2',
        'tıklama yutuldu: seçili not n2 olmadı (liste kaydetme sırasında oynuyorsa refreshRow/sıra alanına bak)'
      );
      assert.equal(await page.inputValue('#note-title'), 'Ikinci not', 'düzenleyici tıklanan notu göstermeli');

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('focus-app:notes')));
      assert.equal(
        (stored.find((n) => n.id === 'n1') || {}).title,
        'Eski notX',
        'yazılan başlık n1\'e kaydedilmeli (veri kaybı yok)'
      );
    } finally {
      await page.close();
    }
  });
});