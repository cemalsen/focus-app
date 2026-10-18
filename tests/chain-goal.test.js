'use strict';
/* Zincir hedefi (goal) regresyonları (gerçek tarayıcı):
   1) ilk çalıştırma: hedef seçici AÇIK doğar, "Hedeflenen günü seç" düğmesi
      gizlidir, istatistik "yok" gösterir ve firstSeen bugüne damgalanır;
   2) preset seçimi (30): kalıcılaşır, seçici kapanır, düğme görünür olur,
      istatistik "30 gün" gösterir; sayfa yenilenince kapalı kalır;
   3) sonraki gün senaryosu (firstSeen=dün, hedef yok): seçici kapalı, düğme
      görünür; düğme seçiciyi açar, Vazgeç seçmeden kapatır;
   4) serbest giriş: 21 gönderilir → hedef 21, chosenOn bugün; boş girdi
      hedefi değiştirmez, durum satırı uyarır;
   5) "Hedef yok": hedefi siler, firstSeen eski olduğu için panel otomatik
      geri açılmaz; aria-pressed aktif hedefi yansıtır.
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

describe('zincir — hedef günü seçme', () => {
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

  const noBrowser = (t) => {
    if (browser) return false;
    t.skip('Tarayıcı yok — sistem Chrome ya da `npx playwright install chromium`: '
      + (launchError ? launchError.message : 'bilinmeyen'));
    return true;
  };

  // Panelin gözlemlenebilir durumu + kalıcı kayıt tek bakışta.
  const stateOf = (page) => page.evaluate(() => ({
    pickerHidden: document.getElementById('chain-goal-picker').hidden,
    editHidden: document.getElementById('chain-goal-edit').hidden,
    clearHidden: document.getElementById('chain-goal-clear').hidden,
    goalText: document.getElementById('chain-goal-value').textContent,
    status: document.getElementById('chain-status').textContent,
    saved: JSON.parse(localStorage.getItem('focus-app:chain-goal') || 'null'),
    today: window.FocusStore.dateKey(new Date()),
    pressed: Array.prototype.map.call(
      document.querySelectorAll('.chain-goal-preset'),
      (b) => b.dataset.days + ':' + b.getAttribute('aria-pressed')
    ).join(' ')
  }));

  // Sayfayı aç, chain-goal kaydını verili değerle tohumla, zincire geç.
  // seed undefined → anahtar silinir (ilk çalıştırma hâli).
  const openChain = async (page, seed) => {
    await page.goto(baseUrl + '/index.html');
    await page.evaluate((v) => {
      if (v === null) localStorage.removeItem('focus-app:chain-goal');
      else localStorage.setItem('focus-app:chain-goal', JSON.stringify(v));
    }, seed === undefined ? null : seed);
    await page.reload();
    await page.click('#tab-chain');
  };

  it('ilk çalıştırma: seçici açık doğar; düğme gizli; firstSeen bugüne damgalanır', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    try {
      await openChain(page);
      const s = await stateOf(page);
      assert.equal(s.pickerHidden, false, 'seçici ilk gün açık doğmalı');
      assert.equal(s.editHidden, true, 'düğme seçici açıkken gizli olmalı');
      assert.equal(s.goalText, 'yok', 'varsayılan hedef yok gösterilmeli');
      assert.ok(s.saved && s.saved.firstSeen === s.today,
        'firstSeen bugüne damgalanmadı: ' + JSON.stringify(s.saved));
      // Gerçekten ÇİZİLiyor mu (CSS [hidden] tuzağı): display none olmamalı.
      const disp = await page.$eval('#chain-goal-picker', (el) => getComputedStyle(el).display);
      assert.notEqual(disp, 'none', 'picker hidden değilken display:none — CSS [hidden] ezmesi');
      // 375×812 (proje kırılımı): AÇIK hedef bloğu yatay taşma yapmaz —
      // belgenin scrollWidth'u viewport'u aşamaz, picker sağ kenarı içeride
      // kalmalı (kart a5fb0859 kriteri bu kapıya devredilmişti; burada assert).
      await page.setViewportSize({ width: 375, height: 812 });
      const fit = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        pickerRight: document.getElementById('chain-goal-picker').getBoundingClientRect().right
      }));
      assert.ok(fit.scroll <= fit.inner,
        `375px yatay taşma: scrollWidth ${fit.scroll} > ${fit.inner}`);
      assert.ok(fit.pickerRight <= fit.inner,
        `375px: picker viewport dışına taşıyor: right ${fit.pickerRight}`);
    } finally { await page.close(); }
  });

  it('preset 30: kalıcılaşır, seçici kapanır, düğme gelir; yenilemede kapalı kalır', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    try {
      await openChain(page);
      await page.click('.chain-goal-preset[data-days="30"]');
      let s = await stateOf(page);
      assert.equal(s.pickerHidden, true, 'seçim sonrası seçici kapanmalı');
      assert.equal(s.editHidden, false, 'seçim sonrası "Hedeflenen günü seç" görünmeli');
      assert.equal(s.goalText, '30 gün');
      assert.equal(s.saved.goal, 30);
      assert.equal(s.saved.chosenOn, s.today, 'chosenOn seçim günü olmalı');
      assert.ok(s.pressed.includes('30:true'), 'preset aria-pressed hedefi yansıtmıyor: ' + s.pressed);
      await page.reload();
      await page.click('#tab-chain');
      s = await stateOf(page);
      assert.equal(s.pickerHidden, true, 'hedef seçiliyken yenilemede seçici açılmamalı');
      assert.equal(s.editHidden, false);
      assert.equal(s.goalText, '30 gün');
    } finally { await page.close(); }
  });

  it('sonraki gün: firstSeen geçmişse seçici kapalı + düğme; aç/Vazgeç döngüsü', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    try {
      await openChain(page, { goal: null, chosenOn: null, firstSeen: '2020-01-01' });
      let s = await stateOf(page);
      assert.equal(s.pickerHidden, true, 'ilk günden sonraki günlerde seçici kapalı olmalı');
      assert.equal(s.editHidden, false, 'düğme seçicinin yerini almalı');
      await page.click('#chain-goal-edit');
      s = await stateOf(page);
      assert.equal(s.pickerHidden, false, 'düğme seçiciyi açmalı');
      assert.equal(s.editHidden, true);
      await page.click('#chain-goal-cancel');
      s = await stateOf(page);
      assert.equal(s.pickerHidden, true, 'Vazgeç seçiciyi kapatmalı');
      assert.equal(s.editHidden, false);
      s = await stateOf(page);
      assert.equal(s.saved.goal, null, 'Vazgeç hedef oluşturmamalı');
      assert.equal(s.saved.firstSeen, '2020-01-01', 'Vazgeç firstSeeni bozmamalı');
    } finally { await page.close(); }
  });

  it('serbest giriş: 21 kabul edilir; boş girdi hedefi değiştirmez ve uyarır', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    try {
      await openChain(page); // ilk gün: seçici zaten açık
      await page.fill('#chain-goal-input', '21');
      await page.click('#chain-goal-form button[type="submit"]');
      let s = await stateOf(page);
      assert.equal(s.saved.goal, 21, 'serbest giriş hedef olarak kaydedilmeli');
      assert.equal(s.saved.chosenOn, s.today);
      assert.equal(s.goalText, '21 gün');
      // Geçersiz girdi: `min=1` altındaki sayılar tarayıcının doğrulamasına
      // takılıp submit'i ZATEN bloklar (olay hiç koşmaz); JS bekçisini
      // sınamanın yolu doğrulamadan geçen boş girdi.
      await page.click('#chain-goal-edit');
      await page.fill('#chain-goal-input', '');
      await page.click('#chain-goal-form button[type="submit"]');
      s = await stateOf(page);
      assert.equal(s.saved.goal, 21, 'geçersiz girdi hedefi ezmemeli');
      assert.equal(s.pickerHidden, false, 'geçersiz girdide kullanıcı panelde kalmalı');
      assert.match(s.status, /[Gg]eçerli/, 'durum satırı uyarı vermeli: ' + s.status);
    } finally { await page.close(); }
  });

  it('Hedef yok: hedefi siler; firstSeen eskiyse panel geri açılmaz; aria-pressed temizlenir', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    try {
      await openChain(page, { goal: 30, chosenOn: '2020-01-01', firstSeen: '2020-01-01' });
      let s = await stateOf(page);
      assert.equal(s.goalText, '30 gün');
      await page.click('#chain-goal-edit');
      s = await stateOf(page);
      assert.equal(s.clearHidden, false, 'hedef varken "Hedef yok" görünmeli');
      assert.ok(s.pressed.includes('30:true'));
      await page.click('#chain-goal-clear');
      s = await stateOf(page);
      assert.equal(s.saved.goal, null, 'hedef silinmeli');
      assert.equal(s.goalText, 'yok');
      assert.equal(s.pickerHidden, true, 'firstSeen eskiyse silme paneli geri açmamalı');
      assert.equal(s.editHidden, false);
      assert.ok(!s.pressed.includes('true'), 'temizlenmiş hedefte aria-pressed kalmamalı: ' + s.pressed);
    } finally { await page.close(); }
  });

  it('hedef ızgarayı hedef gününün haftasına kadar uzatır; "Hedef yok" geri daraltır', { timeout: 60000 }, async (t) => {
    if (noBrowser(t)) return;
    const page = await browser.newPage();
    // Izgara durumu + beklenen ufuk: hedef günü chosenOn + (goal−1) Pazar'a taşınır.
    const gridState = (p) => p.evaluate(() => {
      const S = window.FocusStore;
      const cells = Array.prototype.map.call(
        document.querySelectorAll('#chain-grid .chain-cell'),
        (c) => ({ date: c.dataset.date, disabled: c.disabled })
      );
      const saved = JSON.parse(localStorage.getItem('focus-app:chain-goal') || 'null');
      let expectedEnd = null;
      if (saved && saved.goal !== null && saved.chosenOn) {
        const goalDay = S.addDays(S.parseKey(saved.chosenOn), saved.goal - 1);
        expectedEnd = S.dateKey(S.addDays(S.mondayOf(goalDay), 6));
      }
      const today = S.dateKey(new Date());
      return {
        first: cells.length ? cells[0].date : null,
        last: cells.length ? cells[cells.length - 1].date : null,
        n: cells.length,
        future: cells.filter((c) => c.date > today),
        expectedEnd,
        today,
        mondayNow: S.dateKey(S.mondayOf(new Date()))
      };
    });
    try {
      await openChain(page, { goal: null, chosenOn: null, firstSeen: '2020-01-01' });
      let g = await gridState(page);
      assert.equal(g.n, 7, 'hedefsiz tek hafta 7 hücre çizilmeli');
      assert.equal(g.first, g.mondayNow);
      await page.click('#chain-goal-edit');
      await page.click('.chain-goal-preset[data-days="90"]');
      g = await gridState(page);
      assert.ok(g.expectedEnd > g.today, '90 günlük hedef bugünlerin ötesinde olmalı: ' + g.expectedEnd);
      assert.equal(g.last, g.expectedEnd,
        `ızgara hedef haftasının Pazarında bitmeli: son=${g.last} beklenen=${g.expectedEnd}`);
      assert.equal(g.first, g.mondayNow, 'başlangıç hâlâ bu haftanın Pazartesisi');
      assert.equal(g.n % 7, 0, 'tam hafta çizilmeli: ' + g.n);
      assert.ok(g.n > 7, 'hedef varken hafta sayısı artmalı: ' + g.n);
      assert.ok(g.future.length > 0, 'hedef haftasına kadar gelecek günler çizilmeli');
      assert.ok(g.future.every((c) => c.disabled), 'gelecek hücreler işaretlenemez kalmalı');
      await page.click('#chain-goal-edit');
      await page.click('#chain-goal-clear');
      g = await gridState(page);
      assert.equal(g.n, 7, '"Hedef yok" ızgarayı anında bu haftaya daraltmalı: ' + g.n);
      assert.equal(g.first, g.mondayNow, 'daralma sonrası tek hafta bu haftadır');
    } finally { await page.close(); }
  });
});
