'use strict';
/* Kabuk düzen regresyonu (gerçek tarayıcı): yapışkan altbilgi —
   1) kısa içerikli (kaydırmasız) sayfada .app-footer'ın alt kenarı viewport
      altına yapışıktır; uzun içerikte sayfa sonunu izler (ayrı senaryo),
   2) footer yüksekliğini yalnız padding (+1px üst çerçeve) ve <p> belirler:
      <p> kenar boşlukları sıfırlanmıştır, metnin altında fazladan boşluk yok.
   İki breakpoint: 1280×900 (masaüstü) ve 375×812 (mobil).
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 375, height: 812 }
];

// Footer geometrisini sayfa içinde ölçüp düz sayı olarak döndürür.
const measure = (page) => page.evaluate(() => {
  const f = document.querySelector('.app-footer');
  const p = f.querySelector('p');
  const fr = f.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  const cs = getComputedStyle(f);
  const ps = getComputedStyle(p);
  return {
    innerH: window.innerHeight,
    scrollH: document.documentElement.scrollHeight,
    footerBottom: fr.bottom,
    footerH: f.offsetHeight,
    padTop: parseFloat(cs.paddingTop),
    padBottom: parseFloat(cs.paddingBottom),
    borderTop: parseFloat(cs.borderTopWidth),
    pTop: pr.top - fr.top,
    pBottom: fr.bottom - pr.bottom,
    pMarginTop: parseFloat(ps.marginTop),
    pMarginBottom: parseFloat(ps.marginBottom),
    pH: p.offsetHeight
  };
});

describe('kabuk — yapışkan altbilgi', () => {
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

  // Kısa panel seç: içeriği viewport'a sığan ilk panel (sekmesine tıkla,
  // ölç). Hiçbisi sığmazsa hata — o zaten sticky-footer iddiasının çöküşü.
  async function shortPanelMeasure(page) {
    const candidates = [
      ['tab-pomodoro', 'panel-pomodoro'],
      ['tab-notes', 'panel-notes'],
      ['tab-todos', 'panel-todos'],
      ['tab-chain', 'panel-chain']
    ];
    const tried = [];
    for (const [tabId] of candidates) {
      await page.click('#' + tabId);
      const m = await measure(page);
      if (m.scrollH <= m.innerH + 1) return m;
      tried.push(tabId + ':' + m.scrollH);
    }
    throw new Error('hiç panel kısa değil (viewport ' + (await page.evaluate(() => window.innerHeight))
      + '): ' + tried.join(', '));
  }

  for (const vp of VIEWPORTS) {
    it(`${vp.width}×${vp.height}: kısa sayfada footer viewport altına yapışık, yükseklik yalnız padding+p`, { timeout: 60000 }, async (t) => {
      await withPage(t, async (page) => {
        await page.setViewportSize(vp);
        await page.goto(baseUrl + '/index.html');
        const m = await shortPanelMeasure(page);
        // (1) Alt kenar viewport altında — altında boş şerit yok.
        assert.ok(Math.abs(m.footerBottom - m.innerH) <= 1,
          `footer alt kenarı viewport altına yapışık olmalı: ${m.footerBottom} vs ${m.innerH}`);
        // (2) Metnin altında boşluk yok: p margin'leri sıfır, metin-altı
        // mesafe yalnız padding-bottom.
        assert.equal(m.pMarginTop, 0, '<p> üst kenar boşluğu sıfırlanmalı');
        assert.equal(m.pMarginBottom, 0, '<p> alt kenar boşluğu sıfırlanmalı');
        assert.ok(Math.abs(m.pBottom - m.padBottom) <= 1,
          `metin-altı boşluk yalnız padding-bottom olmalı: ${m.pBottom} vs ${m.padBottom}`);
        assert.ok(Math.abs(m.pTop - m.padTop - m.borderTop) <= 1,
          `metin-üstü boşluk yalnız padding-top+çerçeve olmalı: ${m.pTop} vs ${m.padTop}`);
        // (2b) Toplam yükseklik = padding + çerçeve + <p>.
        assert.ok(Math.abs(m.footerH - (m.padTop + m.padBottom + m.borderTop + m.pH)) <= 1,
          `footer yüksekliği yalnız padding+p olmalı: ${m.footerH} vs ${m.padTop + m.padBottom + m.borderTop + m.pH}`);
      });
    });
  }

  it('uzun içerikte footer sayfa sonunu izler (viewport altına taşar, kesilmez)', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(baseUrl + '/index.html');
      // Yapay uzun içerik: main'in sonuna yüksek bir blok ekle.
      await page.evaluate(() => {
        const s = document.createElement('div');
        s.style.height = '2000px';
        document.getElementById('main').appendChild(s);
      });
      const m = await measure(page);
      assert.ok(m.scrollH >= m.footerBottom, 'footer belge akışının sonunda kalmalı');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const m2 = await measure(page);
      assert.ok(Math.abs(m2.footerBottom - m2.innerH) <= 1,
        `sayfa sonuna inildiğinde footer görünür alt kenarda bitmeli: ${m2.footerBottom} vs ${m2.innerH}`);
    });
  });
});
