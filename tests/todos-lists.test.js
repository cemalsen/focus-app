'use strict';
/* Yapılacaklar çoklu-liste regresyonları (gerçek tarayıcı):
   1) listId'siz eski maddeler "Genel" sekmesine geçer ve kalıcıdır,
   2) yeni liste dialog ile kurulur; boş ad/İptal liste kurmaz,
   3) listeler arası yalıtım: ekleme yalnız aktif listeye, sekme değişimi
      yalnız o listenin maddelerini gösterir,
   4) aktif sekme ve klavye ok tuşu seçimi kalıcıdır.
   Çalıştırma: node --test tests/ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serveProject, launchBrowser } = require('./browser-harness.js');

const seed = (page, baseUrl, { todos, lists, active }) => page.evaluate(([t, l, a]) => {
  localStorage.clear();
  if (t) localStorage.setItem('focus-app:todos', JSON.stringify(t));
  if (l) localStorage.setItem('focus-app:todo-lists', JSON.stringify(l));
  if (a) localStorage.setItem('focus-app:todo-active', JSON.stringify(a));
}, [todos || null, lists || null, active || null]);

const tabTexts = (page) => page.$$eval('.todo-tab', (els) => els.map((e) => e.textContent));
const activeTabText = (page) => page.$eval('.todo-tab[aria-selected="true"]', (e) => e.textContent);
const itemTexts = (page) => page.$$eval('.todo-text', (els) => els.map((e) => e.textContent));
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

const LIST_A = { id: 'l-is', name: 'İş' };
const LIST_B = { id: 'l-alis', name: 'Alışveriş' };

describe('yapılacaklar — çoklu liste', () => {
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

  async function open(page, fixture) {
    await page.goto(baseUrl + '/index.html');
    await seed(page, baseUrl, fixture);
    await page.reload();
    await page.click('#tab-todos');
  }

  it('listesiz eski maddeler "Genel" sekmesine geçer (kalıcı geçiş)', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await open(page, { todos: [
        { id: 't1', text: 'Rapor yaz', done: false, createdAt: '2026-10-01T09:00:00.000Z', order: 2 },
        { id: 't2', text: 'Fatura kes', done: false, createdAt: '2026-10-02T09:00:00.000Z', order: 1 }
      ] });
      assert.deepEqual(await tabTexts(page), ['Genel']);
      assert.equal(await activeTabText(page), 'Genel');
      assert.deepEqual(await itemTexts(page), ['Rapor yaz', 'Fatura kes']);
      const lists = await stored(page, 'focus-app:todo-lists');
      assert.equal(lists.length, 1);
      assert.equal(lists[0].name, 'Genel');
      const todos = await stored(page, 'focus-app:todos');
      assert.ok(todos.every((x) => x.listId === lists[0].id), 'geçiş kalıcı yazılmalı');
      // Yenilemede sekme aynen durur.
      await page.reload();
      await page.click('#tab-todos');
      assert.deepEqual(await tabTexts(page), ['Genel']);
      assert.deepEqual(await itemTexts(page), ['Rapor yaz', 'Fatura kes']);
    });
  });

  it('dialog ile yeni liste kurulur; boş ad ve İptal liste kurmaz', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await open(page, { todos: [] });
      // Boş ad → liste yok
      await page.click('#todo-list-new');
      await page.fill('#todo-list-name', '   ');
      await page.click('#todo-list-dialog button[value="ok"]');
      assert.deepEqual(await tabTexts(page), ['Genel'], 'boş ad liste kurmamalı');
      // İptal → liste yok
      await page.click('#todo-list-new');
      await page.fill('#todo-list-name', 'İptal edilen');
      await page.click('#todo-list-dialog button[value="cancel"]');
      assert.deepEqual(await tabTexts(page), ['Genel'], 'İptal liste kurmamalı');
      // Tamam → liste kurulur, seçili açılır, boş durumu gösterir
      await page.click('#todo-list-new');
      await page.fill('#todo-list-name', ' Alışveriş ');
      await page.click('#todo-list-dialog button[value="ok"]');
      assert.deepEqual(await tabTexts(page), ['Genel', 'Alışveriş']);
      assert.equal(await activeTabText(page), 'Alışveriş');
      assert.equal(await page.$eval('#todo-empty', (e) => e.hidden), false, 'boş liste boş durumunu göstermeli');
      assert.equal(await page.textContent('#todo-count'), 'Tümü tamamlandı');
      const lists = await stored(page, 'focus-app:todo-lists');
      assert.deepEqual(lists.map((l) => l.name), ['Genel', 'Alışveriş'], 'ad kırpılıp kalıcı yazılmalı');
    });
  });

  it('listeler yalıtılır: ekleme yalnız aktif listeye, görünüm yalnız aktif listeyi gösterir', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await open(page, {
        todos: [
          { id: 't1', text: 'Rapor yaz', done: false, createdAt: '2026-10-01T09:00:00.000Z', order: 2, listId: LIST_A.id },
          { id: 't2', text: 'Süt al', done: false, createdAt: '2026-10-02T09:00:00.000Z', order: 1, listId: LIST_B.id }
        ],
        lists: [LIST_A, LIST_B]
      });
      assert.equal(await activeTabText(page), 'İş');
      assert.deepEqual(await itemTexts(page), ['Rapor yaz']);
      assert.equal(await page.textContent('#todo-count'), '1 madde kaldı');
      // Aktif listeye ekleme diğer listeye sızmaz
      await page.fill('#todo-input', 'Toplantı notu');
      await page.click('#todo-form button[type="submit"]');
      assert.deepEqual(await itemTexts(page), ['Toplantı notu', 'Rapor yaz']);
      await page.click('.todo-tab[data-id="l-alis"]');
      assert.deepEqual(await itemTexts(page), ['Süt al']);
      const todos = await stored(page, 'focus-app:todos');
      assert.equal(todos.find((x) => x.text === 'Toplantı notu').listId, LIST_A.id);
      // Tamamlananları temizle yalnız aktif listeyi ve yalnız TAMAMLANANLARI
      // siler: işaretlenmemiş 'Toplantı notu' kalmalı, öteki liste etkilenmemeli.
      await page.click('.todo-tab[data-id="l-is"]');
      await page.click('.todo-item input[data-id="t1"]');
      await page.click('#todos-clear');
      assert.deepEqual(await itemTexts(page), ['Toplantı notu'], 'yalnız tamamlanan silinir');
      await page.click('.todo-tab[data-id="l-alis"]');
      assert.deepEqual(await itemTexts(page), ['Süt al'], 'öteki listenin maddesi silinmemeli');
    });
  });

  it('aktif sekme kalıcıdır; ok tuşu sekmeler arasında seçimi taşır', { timeout: 60000 }, async (t) => {
    await withPage(t, async (page) => {
      await open(page, { todos: [], lists: [LIST_A, LIST_B] });
      await page.click('.todo-tab[data-id="l-alis"]');
      assert.equal(await stored(page, 'focus-app:todo-active'), LIST_B.id);
      await page.reload();
      await page.click('#tab-todos');
      assert.equal(await activeTabText(page), 'Alışveriş', 'aktif sekme yenilemede kalmalı');
      // Klavye: ← seçimi İş'e taşır ve seçer
      await page.focus('.todo-tab[data-id="l-alis"]');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await activeTabText(page), 'İş');
      assert.equal(await stored(page, 'focus-app:todo-active'), LIST_A.id);
      const focused = await page.evaluate(() => document.activeElement && document.activeElement.dataset.id);
      assert.equal(focused, LIST_A.id, 'ok sonrası odak yeni sekmede kalmalı');
    });
  });
});
