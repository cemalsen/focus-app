'use strict';
/* js/store.js saf yardımcıları için kalıcı regresyon testleri.
   Çalıştırma: node --test tests/   (Node'un yerleşik test çalıştırıcısı) */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

/* ── dateKey / parseKey / addDays / mondayOf — ay ve yıl sınırları ── */
describe('tarih yardımcıları — ay sınırları', () => {
  it('ay sonunda tarih bir sonraki aya taşar', () => {
    assert.equal(S.dateKey(S.addDays(new Date(2026, 0, 31), 1)), '2026-02-01');
    assert.equal(S.dateKey(S.addDays(new Date(2026, 3, 30), 1)), '2026-05-01');
    assert.equal(S.dateKey(S.addDays(new Date(2026, 1, 28), 1)), '2026-03-01'); // 2026 sıradan yıl
  });

  it('artık yılda Şubat 29 yaşar ve ertesi gün Mart 1 olur', () => {
    assert.equal(S.dateKey(new Date(2028, 1, 29)), '2028-02-29');
    assert.equal(S.dateKey(S.addDays(new Date(2028, 1, 28), 1)), '2028-02-29');
    assert.equal(S.dateKey(S.addDays(new Date(2028, 1, 29), 1)), '2028-03-01');
  });

  it('yıl sınırı iki yönde doğru geçer', () => {
    assert.equal(S.dateKey(S.addDays(new Date(2026, 11, 31), 1)), '2027-01-01');
    assert.equal(S.dateKey(S.addDays(new Date(2027, 0, 1), -1)), '2026-12-31');
  });

  it('parseKey ∘ dateKey kimliktir (31 çeken/çekmeyen aylar dahil)', () => {
    const keys = ['2026-01-31', '2026-02-28', '2026-04-30', '2026-05-31', '2028-02-29'];
    for (const k of keys) {
      assert.equal(S.dateKey(S.parseKey(k)), k);
    }
  });

  it('mondayOf ay ve yıl sınırlarını aşarak haftanın başına gider', () => {
    // 1 Eylül 2026 Salı → 31 Ağustos 2026 Pazartesi (ay geçişi)
    assert.equal(S.dateKey(S.mondayOf(new Date(2026, 8, 1))), '2026-08-31');
    // 1 Ocak 2026 Perşembe → 29 Aralık 2025 Pazartesi (yıl geçişi)
    assert.equal(S.dateKey(S.mondayOf(new Date(2026, 0, 1))), '2025-12-29');
  });
});

/* ── currentStreak — kesinti davranışı ── */
describe('currentStreak — kesintiler', () => {
  const days = (...keys) => Object.fromEntries(keys.map((k) => [k, true]));

  it('kesintisiz seri bugünden geriye doğru sayılır', () => {
    const marks = days('2026-10-01', '2026-09-30', '2026-09-29');
    assert.equal(S.currentStreak(marks, new Date(2026, 9, 1)), 3);
  });

  it('bugün işaretsizse seri dünden sayılır ve kaybolmaz', () => {
    const marks = days('2026-09-30', '2026-09-29');
    assert.equal(S.currentStreak(marks, new Date(2026, 9, 1)), 2);
  });

  it('tek günlük kesinti seriyi keser', () => {
    // 30 Eylül boş: 1 Ekim işaretli ama seri 1 gündür
    const marks = days('2026-10-01', '2026-09-29', '2026-09-28');
    assert.equal(S.currentStreak(marks, new Date(2026, 9, 1)), 1);
  });

  it('iki günlük boşluktan sonra seri yoktur', () => {
    const marks = days('2026-09-28', '2026-09-27');
    assert.equal(S.currentStreak(marks, new Date(2026, 9, 1)), 0);
  });

  it('ay sınırını aşan kesintisiz seri devam eder', () => {
    const marks = days('2026-10-01', '2026-09-30', '2026-09-29');
    assert.equal(S.currentStreak(marks, new Date(2026, 9, 1)), 3); // Ekim→Eylül
  });

  it('yıl sınırını aşan kesintisiz seri devam eder', () => {
    const marks = days('2027-01-01', '2026-12-31', '2026-12-30');
    assert.equal(S.currentStreak(marks, new Date(2027, 0, 1)), 3);
  });

  it('boş kayıtta seri 0', () => {
    assert.equal(S.currentStreak({}, new Date(2026, 9, 1)), 0);
  });
});

/* ── breakAfter — 4'lü pomodoro döngüsü ── */
describe('breakAfter', () => {
  it('ilk üç odaktan sonra kısa mola', () => {
    assert.equal(S.breakAfter(1), 'short');
    assert.equal(S.breakAfter(2), 'short');
    assert.equal(S.breakAfter(3), 'short');
  });

  it('4 ve katlarında uzun mola', () => {
    assert.equal(S.breakAfter(4), 'long');
    assert.equal(S.breakAfter(8), 'long');
  });

  it('sonraki döngüde yine kısa molaya döner', () => {
    assert.equal(S.breakAfter(5), 'short');
    assert.equal(S.breakAfter(7), 'short');
  });
});

/* ── formatClock ── */
describe('formatClock', () => {
  it('mm:ss, başı sıfırlı', () => {
    assert.equal(S.formatClock(0), '00:00');
    assert.equal(S.formatClock(59), '00:59');
    assert.equal(S.formatClock(60), '01:00');
    assert.equal(S.formatClock(1500), '25:00');
  });

  it('60. dakikayı saat birimine bölmez (kronometre akışı)', () => {
    assert.equal(S.formatClock(3600), '60:00');
    assert.equal(S.formatClock(5999), '99:59');
  });

  it('negatif ve kesirli girdiler güvenli yuvarlanır', () => {
    assert.equal(S.formatClock(-5), '00:00');
    assert.equal(S.formatClock(59.9), '00:59');
  });
});

/* ── clampMinutes ── */
describe('clampMinutes', () => {
  it('aralık içindeki değeri aynen alır', () => {
    assert.equal(S.clampMinutes(25, 1, 180, 25), 25);
  });

  it('üst ve alt sınırları zorlar', () => {
    assert.equal(S.clampMinutes(999, 1, 180, 25), 180);
    assert.equal(S.clampMinutes(-5, 1, 180, 25), 1);
    assert.equal(S.clampMinutes(0, 1, 180, 25), 1);
  });

  it('geçersiz girdide yedeğe döner', () => {
    assert.equal(S.clampMinutes('abc', 1, 180, 25), 25);
    assert.equal(S.clampMinutes(NaN, 1, 180, 30), 30);
    assert.equal(S.clampMinutes(undefined, 1, 180, 30), 30);
  });

  it('null -> Number(null)=0 sayılır ve alt sınıra kırpılır (belgelenmiş kenar)', () => {
    assert.equal(S.clampMinutes(null, 1, 180, 30), 1);
  });

  it('dize sayıları yuvarlayarak kabul eder', () => {
    assert.equal(S.clampMinutes('30', 1, 180, 25), 30);
    assert.equal(S.clampMinutes('12.6', 1, 180, 25), 13);
  });
});

/* ── uid ── */
describe('uid', () => {
  it('zaman damgası + rastgele sonek biçimindedir', () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    try {
      Math.random = () => 0.5;
      Date.now = () => 1790860800000;
      const id = S.uid();
      assert.match(id, /^[0-9a-z]+-[0-9a-z]*$/);
      assert.equal(id.split('-')[0], (1790860800000).toString(36));
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  it('damga değişince kimlik de değişir', () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    try {
      Math.random = () => 0.5;
      Date.now = () => 1000000;
      const a = S.uid();
      Date.now = () => 1000001;
      assert.notEqual(a, S.uid());
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  it('gerçek rastgelelikte biçim korunur', () => {
    for (let i = 0; i < 20; i++) assert.match(S.uid(), /^[0-9a-z]+-[0-9a-z]*$/);
  });
});

/* ── load / save — localStorage taklidi ── */
describe('load / save — localStorage taklidi', () => {
  const withStorage = (impl, fn) => {
    const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true });
    try {
      return fn();
    } finally {
      if (prevDesc) Object.defineProperty(globalThis, 'localStorage', prevDesc);
      else delete globalThis.localStorage;
    }
  };

  const memStorage = (seed) => {
    const map = new Map(Object.entries(seed || {}));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      raw: (k) => map.get(k)
    };
  };

  it('yaz/oku turu değeri aynen geri verir ve true döner', () => {
    withStorage(memStorage(), () => {
      const val = { ad: 'odak', gunler: [1, 2, 3] };
      assert.equal(S.save('focus-app:x', val), true);
      assert.deepEqual(S.load('focus-app:x', null), val);
    });
  });

  it('değeri JSON dizesi olarak saklar', () => {
    const stub = memStorage();
    withStorage(stub, () => {
      S.save('focus-app:x', { a: 1 });
      assert.equal(stub.raw('focus-app:x'), '{"a":1}');
    });
  });

  it('eksik anahtar yedeğe döner', () => {
    withStorage(memStorage(), () => {
      assert.deepEqual(S.load('focus-app:yok', ['yedek']), ['yedek']);
      assert.equal(S.load('focus-app:yok', 'yedek'), 'yedek');
    });
  });

  it('bozuk JSON yedeğe döner (parse hatası yutulur)', () => {
    withStorage(memStorage({ 'focus-app:bozuk': '{oops' }), () => {
      assert.equal(S.load('focus-app:bozuk', 42), 42);
    });
  });

  it('kaydedilen null yedek yerine null döner (ham varlık semantiği)', () => {
    withStorage(memStorage(), () => {
      S.save('focus-app:n', null);
      assert.equal(S.load('focus-app:n', 'yedek'), null);
    });
  });

  it('setItem fırlatırsa save false döner (kota dolu / gizli mod)', () => {
    const dolu = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); }
    };
    withStorage(dolu, () => {
      assert.equal(S.save('focus-app:x', { a: 1 }), false);
    });
  });

  it('localStorage yoksa load yedeğe döner, save yine true döner', () => {
    withStorage(undefined, () => {
      assert.equal(S.save('focus-app:x', 1), true);
      assert.equal(S.load('focus-app:x', 'yedek'), 'yedek');
    });
  });
});

/* ── işaret defteri: isMarked / toggleMark / markedCount / longestStreak ── */
describe('işaret defteri yardımcıları', () => {
  it('isMarked yalnız tam true değeri işaretli sayar', () => {
    const marks = { '2026-10-01': true, '2026-10-02': 'yes', '2026-10-03': 1, '2026-10-04': false };
    assert.equal(S.isMarked(marks, new Date(2026, 9, 1)), true);
    assert.equal(S.isMarked(marks, new Date(2026, 9, 2)), false);
    assert.equal(S.isMarked(marks, new Date(2026, 9, 3)), false);
    assert.equal(S.isMarked(marks, new Date(2026, 9, 4)), false);
    assert.equal(S.isMarked(marks, new Date(2026, 9, 5)), false);
  });

  it('toggleMark ekler ve kaldırır; komşu günlere dokunmaz', () => {
    const marks = { '2026-09-30': true };
    assert.equal(S.toggleMark(marks, new Date(2026, 9, 1)), true);
    assert.equal(marks['2026-10-01'], true);
    assert.equal(marks['2026-09-30'], true);
    assert.equal(S.toggleMark(marks, new Date(2026, 9, 1)), false);
    assert.equal(Object.prototype.hasOwnProperty.call(marks, '2026-10-01'), false);
  });

  it('toggleMark true olmayan değeri true yapar', () => {
    const marks = { '2026-10-01': 'yes' };
    assert.equal(S.toggleMark(marks, new Date(2026, 9, 1)), true);
    assert.equal(marks['2026-10-01'], true);
  });

  it('markedCount yalnız true değerleri sayar', () => {
    assert.equal(S.markedCount({ a: true, b: true, c: false, d: 1, e: 'x' }), 2);
    assert.equal(S.markedCount({}), 0);
  });

  it('longestStreak boş ve tek günde doğru', () => {
    assert.equal(S.longestStreak({}), 0);
    assert.equal(S.longestStreak({ '2026-10-01': true }), 1);
  });

  it('longestStreak ay ve yıl sınırını aşan koşuyu birleştirir', () => {
    assert.equal(S.longestStreak({ '2026-09-30': true, '2026-10-01': true, '2026-10-02': true }), 3);
    assert.equal(S.longestStreak({ '2026-12-30': true, '2026-12-31': true, '2027-01-01': true }), 3);
  });

  it('longestStreak en uzun koşuyu seçer; boşluklar birleşmez', () => {
    const marks = {
      '2026-09-20': true, '2026-09-21': true,
      '2026-10-01': true, '2026-10-02': true, '2026-10-03': true
    };
    assert.equal(S.longestStreak(marks), 3);
  });

  it('longestStreak anahtar sırasından bağımsızdır', () => {
    assert.equal(S.longestStreak({ '2026-10-03': true, '2026-10-01': true, '2026-10-02': true }), 3);
  });

  it('longestStreak true olmayan değerleri yok sayar', () => {
    const marks = { '2026-10-01': true, '2026-10-02': 'yes', '2026-10-03': true };
    assert.equal(S.longestStreak(marks), 1);
  });
});

/* ── phaseMinutes / remainingSeconds ── */
describe('pomodoro süre yardımcıları', () => {
  const st = { focusMin: 25, shortMin: 5, longMin: 15 };

  it('phaseMinutes faz sayacını verir', () => {
    assert.equal(S.phaseMinutes('focus', st), 25);
    assert.equal(S.phaseMinutes('short', st), 5);
    assert.equal(S.phaseMinutes('long', st), 15);
  });

  it('tanımsız faz uzun mola sayacıyla eşleşir (belgelenmiş kenar)', () => {
    assert.equal(S.phaseMinutes('bilinmeyen', st), 15);
  });

  it('remainingSeconds kalan süreyi yukarı yuvarlar', () => {
    assert.equal(S.remainingSeconds(10500, 5000), 6);  // 5.5 sn -> 6
    assert.equal(S.remainingSeconds(10000, 5000), 5);  // tam bölünme
    assert.equal(S.remainingSeconds(5700, 5000), 1);   // 0.7 sn -> 1
  });

  it('geçmiş veya eşit bitiş 0 verir (negatife düşmez)', () => {
    assert.equal(S.remainingSeconds(5000, 5000), 0);
    assert.equal(S.remainingSeconds(4000, 5000), 0);
  });
});

/* ── sözleşme sabitleri: KEYS / CYCLE_LEN ── */
describe('sözleşme sabitleri (KEYS / CYCLE_LEN)', () => {
  it('KEYS depolama anahtarları sözleşmesi kilitlidir (yanlış yazım kullanıcı verisini sessizce düşürür)', () => {
    assert.deepEqual(S.KEYS, {
      notes: 'focus-app:notes',
      todos: 'focus-app:todos',
      chain: 'focus-app:chain',
      pomodoro: 'focus-app:pomodoro',
      theme: 'focus-app:theme'
    });
  });

  it('KEYS girdileri benzersizdir (kopyala-yapıştır çakışması yakalanır)', () => {
    const vals = Object.values(S.KEYS);
    assert.equal(new Set(vals).size, vals.length);
  });

  it('CYCLE_LEN 4tür (pomodoro mola mantığı bu sabite bağlı)', () => {
    assert.equal(S.CYCLE_LEN, 4);
  });
});

/* ── noteDraft — "Yeni not" pop-up formundan not kurma ── */
describe('noteDraft — yeni not taslağı', () => {
  it('başlık ve içerik doluyken taslağı verir', () => {
    assert.deepEqual(S.noteDraft('Alışveriş', 'süt, ekmek'), { title: 'Alışveriş', body: 'süt, ekmek' });
  });

  it('yalnız başlık ya da yalnız içerikle not oluşur', () => {
    assert.deepEqual(S.noteDraft('Alışveriş', ''), { title: 'Alışveriş', body: '' });
    assert.deepEqual(S.noteDraft('', 'süt, ekmek'), { title: '', body: 'süt, ekmek' });
  });

  it('her iki alan da boşken null — boş "Başlıksız not" kaydedilmez (regresyon)', () => {
    assert.equal(S.noteDraft('', ''), null);
    assert.equal(S.noteDraft('   ', '\n\t '), null);
    assert.equal(S.noteDraft(null, undefined), null);
  });

  it('kenar boşlukları kırpılır', () => {
    assert.deepEqual(S.noteDraft('  Alışveriş  ', ' süt '), { title: 'Alışveriş', body: 'süt' });
  });
});

/* ── not sırası: normalizeNotes / sortNotes / moveNote ── */
describe('not sırası — okumak sırayı değiştirmez', () => {
  const note = (id, order, updatedAt, createdAt) => ({ id, order, title: id, body: '', createdAt, updatedAt });

  it('normalizeNotes eksik order alanını updatedAt epochundan doldurur (geçişte görünüm korunur)', () => {
    const a = { id: 'a', title: 'a', body: '', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z' };
    const b = { id: 'b', title: 'b', body: '', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z' };
    S.normalizeNotes([a, b]);
    assert.equal(a.order, Date.parse('2026-10-02T09:00:00.000Z'));
    assert.equal(b.order, Date.parse('2026-10-03T09:00:00.000Z'));
  });

  it('normalizeNotes mevcut order alanına dokunmaz (elle sıralama kalıcıdır)', () => {
    const a = note('a', 5, '2026-10-09T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    S.normalizeNotes([a]);
    assert.equal(a.order, 5);
  });

  it('sortNotes order alanına göre sıralar; updatedAt patlasa da sıra sabit kalır (regresyon)', () => {
    const a = note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    const c = note('c', 1, '2026-10-03T09:00:00.000Z', '2026-10-03T09:00:00.000Z');
    const before = S.sortNotes([c, a, b]).map((n) => n.id);
    // Notu okumak/güncellemek updatedAt'i patlatır — eski hata buradaydı.
    c.updatedAt = '2027-01-01T00:00:00.000Z';
    const after = S.sortNotes([c, a, b]).map((n) => n.id);
    assert.deepEqual(before, ['a', 'b', 'c']);
    assert.deepEqual(after, ['a', 'b', 'c']);
  });

  it('sortNotes order eşitliğinde createdAt ile kararlıdır', () => {
    const a = note('a', 2, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    assert.deepEqual(S.sortNotes([a, b]).map((n) => n.id), ['b', 'a']);
  });

  it('moveNote komşuyu yer değiştirterek yeni sırayı üretir', () => {
    const a = note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    const c = note('c', 1, '2026-10-03T09:00:00.000Z', '2026-10-03T09:00:00.000Z');
    const list = [c, a, b];
    assert.equal(S.moveNote(list, 'a', 1), true); // a'yı aşağı
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['b', 'a', 'c']);
    assert.equal(S.moveNote(list, 'a', -1), true); // geri yukarı
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['a', 'b', 'c']);
  });

  it('moveNote sınırlarda ve bilinmeyen kimlikte reddeder, düzene dokunmaz', () => {
    const a = note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    const list = [a, b];
    assert.equal(S.moveNote(list, 'a', -1), false);
    assert.equal(S.moveNote(list, 'b', 1), false);
    assert.equal(S.moveNote(list, 'yok', 1), false);
    assert.equal(a.order, 3);
    assert.equal(b.order, 2);
  });

  it('yeni not (yüksek order) en üste yerleşir', () => {
    const a = note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const yeni = note('yeni', 4, '2026-10-05T09:00:00.000Z', '2026-10-05T09:00:00.000Z');
    assert.deepEqual(S.sortNotes([a, yeni]).map((n) => n.id), ['yeni', 'a']);
  });

  it('moveNote yalnız order alanlarına dokunur (updatedAt karışmaz)', () => {
    const a = note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    const stamp = b.updatedAt;
    S.moveNote([a, b], 'b', -1);
    assert.equal(b.updatedAt, stamp);
    assert.ok(b.order > a.order, 'order alanları ayırt edici olmalı');
  });
});

/* ── placeNote — surukle-birak siralamasi ── */
describe('placeNote — surukle-birak siralamasi', () => {
  const note = (id, order, updatedAt, createdAt) => ({ id, order, title: id, body: '', createdAt, updatedAt });
  const three = () => ([
    note('a', 3, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z'),
    note('b', 2, '2026-10-02T09:00:00.000Z', '2026-10-02T09:00:00.000Z'),
    note('c', 1, '2026-10-03T09:00:00.000Z', '2026-10-03T09:00:00.000Z')
  ]);

  it('notu hedef indekse tasirir ve order alanlarini yeniden dagitir', () => {
    const list = three();
    assert.equal(S.placeNote(list, 'c', 0), true);
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['c', 'a', 'b']);
    assert.equal(S.placeNote(list, 'c', 2), true);
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['a', 'b', 'c']);
  });

  it('gecersiz hedefte, bilinmeyen kimlikte ve kendine birakista false — duzen degismez', () => {
    const list = three();
    assert.equal(S.placeNote(list, 'a', 0), false);
    assert.equal(S.placeNote(list, 'a', -1), false);
    assert.equal(S.placeNote(list, 'a', 3), false);
    assert.equal(S.placeNote(list, 'yok', 1), false);
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['a', 'b', 'c']);
  });

  it('yalniz order alanlarina dokunur (updatedAt bagimsizligi surer)', () => {
    const list = three();
    const stamps = list.map((n) => n.updatedAt);
    S.placeNote(list, 'c', 0);
    assert.deepEqual(list.map((n) => n.updatedAt), stamps);
  });

  it('yeniden dagitim kalici: normalizeNotes/sortNotes yeni sirayi korur', () => {
    const list = three();
    S.placeNote(list, 'c', 0);
    const copy = JSON.parse(JSON.stringify(list));
    S.normalizeNotes(copy);
    assert.deepEqual(S.sortNotes(copy).map((n) => n.id), ['c', 'a', 'b']);
  });
  it('eşit order alanlı (miras) komşularda da taşıma çalışır — sessiz no-op yok', () => {
    const a = note('a', 2, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const b = note('b', 2, '2026-10-01T09:00:00.000Z', '2026-10-02T09:00:00.000Z');
    const list = [a, b];
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['b', 'a']);
    assert.equal(S.moveNote(list, 'a', -1), true);
    assert.deepEqual(S.sortNotes(list).map((n) => n.id), ['a', 'b']);
  });
});

/* ── yardımcılar todo-şekli nesnelerle (updatedAt yok) ── */
describe('yardımcılar todo-şekli nesnelerle (updatedAt yok)', () => {
  it('normalizeNotes order alanını createdAt epochundan kurar; moveNote çalışır', () => {
    const t1 = { id: 't1', text: 'bir', done: false, createdAt: '2026-10-01T09:00:00.000Z' };
    const t2 = { id: 't2', text: 'iki', done: false, createdAt: '2026-10-02T09:00:00.000Z' };
    S.normalizeNotes([t1, t2]);
    assert.equal(t1.order, Date.parse('2026-10-01T09:00:00.000Z'));
    assert.deepEqual(S.sortNotes([t1, t2]).map((n) => n.id), ['t2', 't1']);
    assert.equal(S.moveNote([t1, t2], 't1', -1), true);
    assert.deepEqual(S.sortNotes([t1, t2]).map((n) => n.id), ['t1', 't2']);
    assert.equal(t1.createdAt, '2026-10-01T09:00:00.000Z', 'createdAt de değişmemeli');
    assert.equal(t1.done, false);
  });
});
