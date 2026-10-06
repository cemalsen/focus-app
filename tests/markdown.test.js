'use strict';
/* js/store.js mdToHtml — markdown alt kümesi için regresyon testleri.
   Çalıştırma: node --test tests/   (Node'un yerleşik test çalıştırıcısı) */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

/* ── blok öğeleri ── */
describe('mdToHtml — blok öğeleri', () => {
  it('ATX başlıklar düzeyine göre HTML başlığı olur', () => {
    assert.equal(S.mdToHtml('# Büyük'), '<h1>Büyük</h1>');
    assert.equal(S.mdToHtml('### Üç'), '<h3>Üç</h3>');
    assert.equal(S.mdToHtml('###### Altı'), '<h6>Altı</h6>');
  });

  it('başlıkta # sonrası boşluk şart; yoksa paragraf metnidir', () => {
    assert.equal(S.mdToHtml('#Başlıksız'), '<p>#Başlıksız</p>');
  });

  it('-,*,+ maddeler ul; 1. 2. maddeler ol olur ve gruplanır', () => {
    assert.equal(S.mdToHtml('- bir\n- iki'), '<ul><li>bir</li><li>iki</li></ul>');
    assert.equal(S.mdToHtml('* yıldız\n+ artı'), '<ul><li>yıldız</li><li>artı</li></ul>');
    assert.equal(S.mdToHtml('1. bir\n2. iki'), '<ol><li>bir</li><li>iki</li></ol>');
  });

  it('boş satırlar paragrafı böler; paragraf içi tek satır sonu <br> olur', () => {
    assert.equal(S.mdToHtml('bir\niki'), '<p>bir<br>iki</p>');
    assert.equal(S.mdToHtml('bir\n\niki'), '<p>bir</p>\n<p>iki</p>');
  });

  it('> satırları alıntı bloğunda toplanır', () => {
    assert.equal(S.mdToHtml('> bir\n> iki'), '<blockquote>bir<br>iki</blockquote>');
  });

  it('bloklar karışık sırada doğru ayrışır', () => {
    assert.equal(
      S.mdToHtml('# Başlık\n\n- a\n- b\n\ndüz metin'),
      '<h1>Başlık</h1>\n<ul><li>a</li><li>b</li></ul>\n<p>düz metin</p>'
    );
  });
});

/* ── satır içi öğeler ── */
describe('mdToHtml — satır içi öğeler', () => {
  it('**kalın** ve __kalın__', () => {
    assert.equal(S.mdToHtml('**güçlü**'), '<p><strong>güçlü</strong></p>');
    assert.equal(S.mdToHtml('__güçlü__'), '<p><strong>güçlü</strong></p>');
  });

  it('*italik* ve _italik_; kelime_ici_alt_çizgi metin kalır', () => {
    assert.equal(S.mdToHtml('*ince*'), '<p><em>ince</em></p>');
    assert.equal(S.mdToHtml('_ince_'), '<p><em>ince</em></p>');
    assert.equal(S.mdToHtml('aynen_böyle'), '<p>aynen_böyle</p>');
  });

  it('kalın içine sarılmış italik ayrışır', () => {
    assert.equal(
      S.mdToHtml('**kalın _içinde ince_**'),
      '<p><strong>kalın <em>içinde ince</em></strong></p>'
    );
  });

  it('`kod` diğer dönüşümlerden korunur; ~~üstü çizili~~ çalışır', () => {
    assert.equal(S.mdToHtml('`**ham**`'), '<p><code>**ham**</code></p>');
    assert.equal(S.mdToHtml('~~sil~~'), '<p><del>sil</del></p>');
  });

  it('[bağlantı](url) yalnız https/mailto şemasıyla üretilir', () => {
    assert.equal(
      S.mdToHtml('[site](https://ornek.tr)'),
      '<p><a href="https://ornek.tr" rel="noopener noreferrer">site</a></p>'
    );
    assert.equal(
      S.mdToHtml('[posta](mailto:a@b.tr)'),
      '<p><a href="mailto:a@b.tr" rel="noopener noreferrer">posta</a></p>'
    );
  });

  it('bağlantı hedefi vurgu kurbanı olmaz: * içeren URL bozulmaz (regresyon)', () => {
    assert.equal(
      S.mdToHtml('[x](https://a.com/a*b*c)'),
      '<p><a href="https://a.com/a*b*c" rel="noopener noreferrer">x</a></p>'
    );
  });

  it('bağlantı etiketi vurgulanır, hedef değil', () => {
    assert.equal(
      S.mdToHtml('[**güçlü**](https://a.com)'),
      '<p><a href="https://a.com" rel="noopener noreferrer"><strong>güçlü</strong></a></p>'
    );
  });

  it('etiket sınırlarını aşan vurgu üretilmez [_a](url) x _b (regresyon)', () => {
    assert.equal(
      S.mdToHtml('[_a](https://x.com) x _b'),
      '<p><a href="https://x.com" rel="noopener noreferrer">_a</a> x _b</p>'
    );
  });

  it('parantezli URL kırpılsa bile hedef vurguyla bozulmaz (regresyon)', () => {
    assert.equal(
      S.mdToHtml('[x](https://a.com/(_a_b_))'),
      '<p><a href="https://a.com/(_a_b_" rel="noopener noreferrer">x</a>)</p>'
    );
  });

  it('başlık/liste içi satır içi öğeler de çalışır', () => {
    assert.equal(S.mdToHtml('## **Kalın** başlık'), '<h2><strong>Kalın</strong> başlık</h2>');
  });
});

/* ── güvenlik: markdown asla HTML enjeksiyonu açmaz ── */
describe('mdToHtml — güvenlik', () => {
  it('HTML girdisi kaçırılır: <script> asla etiket olmaz', () => {
    const out = S.mdToHtml('<script>alert(1)</script>');
    assert.equal(out.includes('<script'), false);
    assert.equal(out.includes('&lt;script&gt;'), true);
  });

  it('javascript: şeması bağlantıya dönüşmez (href üretilmez)', () => {
    const out = S.mdToHtml('[t](javascript:alert(1))');
    assert.equal(out.includes('href'), false);
  });

  it('tırnak kaçışı: girdi yeni öznitelik açamaz', () => {
    const out = S.mdToHtml('[a"](https://x.tr/"onclick=")');
    assert.equal(/ onclick=/.test(out), false);
    assert.equal(out.includes('&quot;'), true);
  });

  it('img/onerror vektörü kaçırılır: img etiketi ya da olay özniteliği oluşmaz', () => {
    const out = S.mdToHtml('![x](y"onerror="alert(1))');
    assert.equal(out.includes('<img'), false);
    assert.equal(/ onerror=/.test(out), false);
  });

  it('boş girdi boş çıktı; eşleşmeyen ters tırnak metin kalır', () => {
    assert.equal(S.mdToHtml(''), '');
    assert.equal(S.mdToHtml('`açık'), '<p>`açık</p>');
    assert.equal(S.mdToHtml(null), '');
  });
  it('NUL baytları temizlenir; yer tutucu sahtekârlığı üretilemez (regresyon)', () => {
    assert.equal(S.mdToHtml('\u00000\u0000'), '<p>0</p>');
    assert.equal(
      S.mdToHtml('[a](https://a.com) sonra \u00000\u0000'),
      '<p><a href="https://a.com" rel="noopener noreferrer">a</a> sonra 0</p>'
    );
  });
});