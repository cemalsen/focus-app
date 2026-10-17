'use strict';
/* Zincir ızgarası gün numarası regresyonları (gerçek tarayıcı):
   1) geniş ekranda (1280px) her kutunun içinde ayın gün numarası çizilir,
      rengi soluk (ön plandan yarı saydam) ve hücre erişilebilir adı bozulmaz;
   2) dar ekranda (375px) numaralar çizilmez (display:none), kutunun kendisi
      ve işaretleme davranışı aynen çalışmaya devam eder;
   3) numara erişilebilir adı bozmaz: tarayıcının HESAPLADIĞI ad (ARIA yığını)
      hücrenin aria-label'ı ile birebir aynıdır — bugün / işaretli / gelecek
      (disabled) hücrelerde — ve .chain-day metni bu ada sızmaz;
   4) ızgara penceresi zincirin en eski işaretiyle başladığı haftadan açılır
      (öncesinde boş sütun/hücre çizilmez); işaret yoksa yalnız bu hafta,
      zincir 13 haftadan eskiyse 13 hafta tavan; gelecek/bozuk anahtar
      pencereyi bozmaz; en eski işaretin kaldırılması pencereyi anında
      küçültür (sayfa yenilenmeden).
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

  it('ızgara zincirin başladığı haftadan başlar; öncesinde hücre çizilmez', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    // Izgaranın sözleşmesi: ilk işaretin pazartesiyle başlar, bugünün haftasının
    // pazarıyla biter, tarihler kesintisiz ardışık günlerdir. (Hücre sayısı bu
    // üçlüden türer — sayı formülü implementasyonun kendisi olmasın.)
    const gridFacts = () => page.evaluate(() => {
      const S = window.FocusStore;
      const cells = Array.from(document.querySelectorAll('.chain-cell'));
      const dates = cells.map((c) => c.dataset.date);
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        if (S.dateKey(S.addDays(S.parseKey(dates[i - 1]), 1)) !== dates[i]) gaps.push(dates[i - 1]);
      }
      return {
        n: cells.length, first: dates[0], last: dates[dates.length - 1], gaps,
        mondayNow: S.dateKey(S.mondayOf(new Date())),
        sundayNow: S.dateKey(S.addDays(S.mondayOf(new Date()), 6)),
        firstMonday: S.dateKey(S.mondayOf(S.addDays(new Date(), -16))),
        windowMonday: S.dateKey(S.addDays(S.mondayOf(new Date()), -7 * 12))
      };
    });
    const setMarks = (keys) => page.evaluate((ks) => {
      const S = window.FocusStore;
      const now = new Date();
      const marks = {};
      ks.forEach((off) => { marks[S.dateKey(S.addDays(now, off))] = true; });
      localStorage.setItem('focus-app:chain', JSON.stringify(marks));
    }, keys);
    const reopen = async () => { await page.reload(); await page.click('#tab-chain'); };
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl + '/index.html');

      // 1) Hişaret yok → yalnız içinde bulunulan hafta.
      await page.evaluate(() => localStorage.removeItem('focus-app:chain'));
      await reopen();
      const empty = await gridFacts();
      assert.deepEqual(empty.gaps, [], 'boş ızgarada gün sırası bozuk');
      assert.equal(empty.n, 7, 'boş zincirde yalnız bu hafta çizilmeli: ' + empty.n);
      assert.equal(empty.first, empty.mondayNow, 'boş zincir bu haftanın Pazartesinden başlamıyor');
      assert.equal(empty.last, empty.sundayNow, 'boş zincir bu haftanın Pazarında bitmiyor');

      // 2) Zincir 16 gün önce başladı → ızgara o haftanın Pazartesinden başlar;
      //    ondan önceki (boş) sütunlar çizilmez.
      await setMarks([-16, 0]);
      await reopen();
      const seeded = await gridFacts();
      assert.deepEqual(seeded.gaps, [], 'işaretli ızgarada gün sırası bozuk');
      assert.equal(seeded.first, seeded.firstMonday,
        'ızgara zincir başlangıcı haftasından başlamıyor: ' + seeded.first + ' ≠ ' + seeded.firstMonday);
      assert.ok(seeded.first < seeded.mondayNow, 'test senaryosu iki haftadan eski olmalı');
      assert.equal(seeded.last, seeded.sundayNow, 'ızgara bu haftanın Pazarında bitmiyor');

      // 3) Zincir pencereden eski (300 gün) → 13 haftalık pencere tavan kalır.
      await setMarks([-300, 0]);
      await reopen();
      const old = await gridFacts();
      assert.deepEqual(old.gaps, [], 'eski zincirde gün sırası bozuk');
      assert.equal(old.first, old.windowMonday, '13 hafta tavanı aşılmamalı: ' + old.first);
      assert.equal(old.n, 13 * 7, 'tavan durumunda 13 hafta × 7 gün çizilmeli: ' + old.n);

      // 4) Bozuk/gelecek anahtar ızgarayı geriye ya da geleceğe açmaz.
      await page.evaluate(() => localStorage.setItem('focus-app:chain', JSON.stringify({ '2999-01-01': true })));
      await reopen();
      const junk = await gridFacts();
      assert.equal(junk.n, 7, 'gelecek anahtarı ızgarayı bozdu: ' + junk.n);
      assert.equal(junk.first, junk.mondayNow);
    } finally {
      await page.close();
    }
  });

  it('en eski işaret kalkınca pencere anında küçülür (sayfa yenilenmeden)', { timeout: 60000 }, async (t) => {
    if (!browser) {
      t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
        + (launchError ? launchError.message : 'bilinmeyen'));
      return;
    }
    const page = await browser.newPage();
    // Pencere işaretleme verisine türetilmiştir: en eski işaretin kaldırılması
    // pencere başlangıcını ilerletir ve ızgara YENİDEN YÜKLEME BEKLEMEDEN
    // küçülmelidir — aksi hâlde kullanıcının şikâyet ettiği boş sütunlar gece
    // değişimine kadar ekranda kalır.
    const facts = () => page.evaluate(() => {
      const S = window.FocusStore;
      const cells = Array.from(document.querySelectorAll('.chain-cell'));
      return {
        n: cells.length,
        first: cells.length ? cells[0].dataset.date : null,
        mondayNow: S.dateKey(S.mondayOf(new Date())),
        status: document.getElementById('chain-status').textContent,
        tabbable: document.querySelectorAll('.chain-cell[tabindex="0"]').length
      };
    });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(baseUrl + '/index.html');
      // İki işaret: 16 gün önce (eski hafta) + bu haftanın Pazartesi'i.
      // Kalan işaret "bu hafta"da kalmalı: now-2, Pazartesi/Salı günleri
      // geçen haftaya düşüp beklentiyi bozardı. Pazartesi günü kNew bugüne
      // denk gelir — hiçbir iddiayı etkilemez (tek hafta yine tek hafta).
      const seed = await page.evaluate(() => {
        const S = window.FocusStore;
        const now = new Date();
        const kOld = S.dateKey(S.addDays(now, -16));
        const kNew = S.dateKey(S.mondayOf(now));
        const marks = {};
        marks[kOld] = true;
        marks[kNew] = true;
        localStorage.setItem('focus-app:chain', JSON.stringify(marks));
        return { kOld, week: S.dateKey(S.mondayOf(now)), firstMonday: S.dateKey(S.mondayOf(S.addDays(now, -16))) };
      });
      await page.reload();
      await page.click('#tab-chain');

      const before = await facts();
      assert.equal(before.first, seed.firstMonday,
        'senaryo: pencere en eski işaretin haftasında başlamalı');
      assert.ok(before.first < before.mondayNow, 'senaryo: en eski işaret bu haftadan eski olmalı');

      // Gerçek kullanıcı tıklaması: en eski işaretli hücreye tıkla → işareti kalkar.
      await page.click('.chain-cell[data-date="' + seed.kOld + '"]');

      const after = await facts();
      // Guard: tohum okuması ile son okuma arasında hafta değiştiyse
      // (Pazar→Pazartesi gece yarısı) uygulama pencereyi meşru biçimde yeni
      // haftaya kurar ve senaryonun haftalık beklemeleri geçersizleşir —
      // sahte kırmızı yerine atla. Uçlar aynı haftadaysa aradaki her çizim
      // (tıklama dahil) de o haftadadır; beklemeler geçerlidir.
      if (after.mondayNow !== seed.week) {
        t.skip('test Pazartesi gece yarısını aştı — hafta beklemesi geçersiz');
        return;
      }
      assert.equal(after.n, 7, 'en eski işaret kalkınca ızgara anında küçülmedi: ' + after.n + ' hücre');
      assert.equal(after.first, after.mondayNow, 'pencere kalan işaretin haftasına kaymadı');
      assert.equal(
        await page.evaluate((k) => !document.querySelector('.chain-cell[data-date="' + k + '"]'), seed.kOld),
        true, 'çizim dışına düşen hücre DOM\'da kaldı');
      assert.match(after.status, /işareti kaldırıldı/, 'durum satırı toggle sonucunu yansıtmıyor');
      assert.equal(after.tabbable, 1, 'roving tabindex yeniden çizimde bozuldu: ' + after.tabbable);
    } finally {
      await page.close();
    }
  });
});
