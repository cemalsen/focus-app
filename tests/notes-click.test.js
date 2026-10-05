'use strict';
/* Yutulan tıklama kalıcı regresyon testi — "editörde yaz → hemen başka nota tıkla".
   Gerçek tarayıcıda (Playwright + sistem Chrome, yoksa Playwright tarayıcısı) koşar;
   DOM taklidi kullanmaz. Tüm paket: node --test tests/  (ya da npm test) */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

describe('not listesi — yutulan tıklama regresyonu', () => {
  let server;
  let baseUrl;
  let browser = null;
  let launchError = null;

  before(async () => {
    server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '')) || 'index.html';
      const fp = path.join(ROOT, rel);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      res.end(fs.readFileSync(fp));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = 'http://127.0.0.1:' + server.address().port;

    // Önce sistem Chrome'u (indirilmiş tarayıcı gerekmez), olmazsa Playwright tarayıcısı.
    for (const opts of [{ channel: 'chrome', headless: true }, { headless: true }]) {
      try {
        browser = await chromium.launch(opts);
        break;
      } catch (e) {
        launchError = e;
      }
    }
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  it('editörde yazıp hemen başka nota tıklamak o notu seçer ve yazı kaybolmaz', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }

    const page = await browser.newPage();
    try {
      await page.goto(baseUrl + '/index.html');
      await page.evaluate(() => {
        localStorage.setItem('focus-app:notes', JSON.stringify([
          { id: 'n1', title: 'Eski not', body: 'bir', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' },
          { id: 'n2', title: 'Ikinci not', body: 'iki', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z' }
        ]));
      });
      await page.reload();
      await page.click('#tab-notes');
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
        'tıklama yutuldu: seçili not n2 olmadı (flushSave/renderList listeyi bas-bırak arasında yeniden çiziyor)'
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