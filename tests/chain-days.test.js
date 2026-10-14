'use strict';
/* Zincir ızgarası gün numarası regresyonları (gerçek tarayıcı):
   1) geniş ekranda (1280px) her kutunun içinde ayın gün numarası çizilir,
      rengi soluk (ön plandan yarı saydam) ve hücre erişilebilir adı bozulmaz;
   2) dar ekranda (375px) numaralar çizilmez (display:none), kutunun kendisi
      ve işaretleme davranışı aynen çalışmaya devam eder;
   3) numara erişilebilir adı bozmaz: tarayıcının HESAPLADIĞI ad (ARIA yığını)
      hücrenin aria-label'ı ile birebir aynıdır — bugün / işaretli / gelecek
      (disabled) hücrelerde — ve .chain-day metni bu ada sızmaz.
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

describe('zincir — kutu içindeki gün numarası (dar ekranda gizli)', () => {
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
    return { w: r.width, h: r.height, display: cs.display, color: cs.color, text: el.textContent };
  });

  // Renk serileştirmesi tarayıcıya göre rgba(…)/oklab(… / a) olabiliyor:
  // alfa '/' sonrasıysa ondan, değilse dördüncü sayıdan okunur.
  const alphaOf = (s) => {
    const str = String(s);
    const slash = str.lastIndexOf('/');
    if (slash >= 0) return Number(str.slice(slash + 1).replace(/[^0-9.]/g, ''));
    const nums = str.match(/[\d.]+(?:e-?\d+)?/g);
    return nums && nums.length >= 4 ? Number(nums[3]) : NaN;
  };

  // Tarayıcının HESAPLADIĞI erişilebilir ad (ARIA yığını) — görünen metinden
  // değil, ekran okuyucunun okuduğu addan söz ediyoruz.
  const accName = async (page, sel) => {
    const snap = await page.locator(sel).first().ariaSnapshot();
    const m = String(snap).match(/"([^"]*)"/);
    assert.ok(m, 'ariaSnapshot erişilebilir ad vermedi: ' + sel + ' → ' + snap);
    return m[1];
  };

  // Üç ayrı bozulmanın üç ayrı bekçisi (negatif kontrollü doğrulandı):
  //  a) aria-hidden sökülürse → (2) kırılır. AD KIRILMAZ: aria-label varken
  //     tarayıcı içeriği hiç okumaz, bu yüzden ad-assert'i bunu YAKALAYAMAZ —
  //     dekoratifliğin bekçisi yalnız bu öznitelik kontrolüdür.
  //  b) aria-label da yoksa → ad görünen sayıya ("14") döner; (1) ve (3) kırılır.
  const assertDecorativeName = async (page, sel) => {
    const info = await page.$eval(sel, (el) => {
      const day = el.querySelector('.chain-day');
      return {
        label: el.getAttribute('aria-label'),
        day: day ? day.textContent : null,
        hidden: day ? day.getAttribute('aria-hidden') : null
      };
    });
    const name = await accName(page, sel);
    // (1) ad tam olarak aria-label'dan gelir
    assert.equal(name, info.label, sel + ': hesaplanan erişilebilir ad aria-label ile aynı değil');
    // (2) gün numarası ekran okuyucuya kapalı (dekoratif) kalmalı
    assert.equal(info.hidden, 'true', sel + ': .chain-day aria-hidden değil — numara okunur hale geldi');
    // (3) ad salt sayıya dönmedi: .chain-day metni ada sızmamış
    assert.notEqual(name, info.day, sel + ': erişilebilir ad gün numarasına inmiş: ' + name);
  };

  it('1280px: numaralar soluk gri çizilir; 375px: gizli, işaretleme çalışır', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl + '/index.html');
      await page.evaluate(() => localStorage.removeItem('focus-app:chain'));
      await page.reload();
      await page.click('#tab-chain');

      // Bugünün hücresi: .today işaretli hücrenin gün numarası bugünün günü olmalı.
      const todayCell = await page.$eval('.chain-cell.today', (el) => ({
        date: el.dataset.date,
        label: el.getAttribute('aria-label')
      }));
      const expectedDay = String(Number(todayCell.date.slice(8, 10)));
      const todayNum = await box(page, '.chain-cell.today .chain-day');
      assert.equal(todayNum.text, expectedDay,
        'bugünün kutusundaki numara günle uyuşmuyor: ' + todayNum.text + ' ≠ ' + expectedDay);
      assert.ok(todayNum.w > 0 && todayNum.h > 0, 'numara çizilmedi: ' + JSON.stringify(todayNum));

      // Her hücrede tam olarak bir numara var ve numarası data-date'iyle uyumlu.
      const mismatch = await page.$$eval('.chain-cell', (cells) => {
        const bad = [];
        cells.forEach((c) => {
          const days = c.querySelectorAll('.chain-day');
          const n = days.length === 1 ? days[0].textContent : null;
          if (n !== String(Number(c.dataset.date.slice(8, 10)))) bad.push(c.dataset.date + ':' + n);
        });
        return bad;
      });
      assert.deepEqual(mismatch, [], 'hücre/gün numarası uyuşmazlığı: ' + mismatch.join(', '));

      // Soluk gri: yarı saydam ön plan (tam opak foreground değil), görünür.
      const unmarked = await page.$eval('.chain-cell:not(.marked):not(.today) .chain-day',
        (el) => getComputedStyle(el).color);
      const alpha = alphaOf(unmarked);
      assert.ok(alpha > 0 && alpha < 1, 'numara soluk değil (alfası 0 ya da 1): ' + unmarked);

      // Erişilebilir ad numaradan değil aria-label'dan gelir (numara aria-hidden).
      assert.equal(await page.$eval('.chain-cell.today .chain-day',
        (el) => el.getAttribute('aria-hidden')), 'true');
      assert.match(todayCell.label, /\d{4}/, 'aria-label tarih içermiyor: ' + todayCell.label);

      // Bugün ve gelecek (disabled) kutu: hesaplanan ad = aria-label, numara ada sızmaz.
      await assertDecorativeName(page, '.chain-cell.today');
      await assertDecorativeName(page, '.chain-cell:disabled');

      // Dar ekran: numara çizilmez, kutu kalır ve tıklanınca işaretlenir.
      await page.setViewportSize({ width: 375, height: 812 });
      const narrowNum = await box(page, '.chain-cell.today .chain-day');
      assert.equal(narrowNum.display, 'none', 'numara dar ekranda gizlenmedi');
      assert.equal(narrowNum.w, 0, 'numara dar ekranda yer kaplıyor');
      const cellBox = await box(page, '.chain-cell.today');
      assert.ok(cellBox.w >= 32, 'kutunun kendisi de kaybolmuş: ' + cellBox.w);

      await page.click('.chain-cell.today');
      assert.equal(await page.$eval('.chain-cell.today', (el) => el.classList.contains('marked')), true,
        'dar ekranda işaretleme çalışmadı');
      assert.equal(await page.$eval('.chain-cell.today', (el) => el.getAttribute('aria-pressed')), 'true');
      // İşaretlenen kutu: ad yine aria-label'dan gelir ("… — işaretli"), numara sızmaz.
      await assertDecorativeName(page, '.chain-cell.today.marked');
      // Koyu kutuda numara yine de okunur olmalı (burada gizli olduğu için çizilmez).
      assert.equal((await box(page, '.chain-cell.today.marked .chain-day')).display, 'none');

      // Geniş ekrana dönünce numaralar geri gelir; işaretli kutuda renk tersine döner.
      await page.setViewportSize({ width: 1280, height: 800 });
      const markedNum = await box(page, '.chain-cell.today.marked .chain-day');
      assert.ok(markedNum.w > 0, 'numara masaüstünde geri gelmedi');
      const mAlpha = alphaOf(markedNum.color);
      assert.ok(mAlpha > 0 && mAlpha <= 1, 'işaretli kutu numara rengi anlaşılmadı: ' + markedNum.color);
      assert.notEqual(markedNum.color, unmarked, 'işaretli kutuda numara rengi tersine dönmedi');
    } finally {
      await page.close();
    }
  });
});
