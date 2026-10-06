'use strict';
/* Playwright tarayıcı testleri için ortak iskele: statik sunucu + Chrome başlatma
   + tohum notlar. Kullananlar: tests/notes-click.test.js, tests/notes-view.test.js */
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

async function serveProject() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '')) || 'index.html';
    const fp = path.join(ROOT, rel);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    baseUrl: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((r) => server.close(r))
  };
}

async function launchBrowser() {
  let error = null;
  // Önce sistem Chrome'u (indirilmiş tarayıcı gerekmez), olmazsa Playwright tarayıcısı.
  for (const opts of [{ channel: 'chrome', headless: true }, { headless: true }]) {
    try {
      return { browser: await chromium.launch(opts), error: null };
    } catch (e) {
      error = e;
    }
  }
  return { browser: null, error };
}

// Notları localStorage'a yazar, sayfayı tazeler ve Notlar sekmesini açar.
async function seedNotes(page, baseUrl, notes) {
  await page.goto(baseUrl + '/index.html');
  await page.evaluate((list) => localStorage.setItem('focus-app:notes', JSON.stringify(list)), notes);
  await page.reload();
  await page.click('#tab-notes');
}

module.exports = { serveProject, launchBrowser, seedNotes };