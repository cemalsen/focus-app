# Odak — odaklanma uygulaması

Bağımlılıksız, tek sayfalık bir odaklanma uygulaması. Dört özellik içerir, fazlası bilinçli olarak kapsam dışıdır. Çalışma zamanında hiçbir paket gerekmez; yalnız testler için `playwright` geliştirme bağımlılığı vardır.

## Özellikler

1. **Pomodoro** — 25 dk odak / 5 dk kısa mola / 4 döngüde 15 dk uzun mola; başlat–duraklat–sıfırla; süreler ayarlardan değiştirilebilir. Sayaç duvara saatine göre işler, sekme arka plandayken de şaşmaz. Biten her odak yumuşak bir *bip* sesi verir.
2. **Notlar** — başlık + gövde. “Yeni not” açılır pencerede (pop-up) not alma formu açar: **Tamam** kaydeder, **İptal** vazgeçer (Esc ile de kapatılır); her iki alan da boşsa not oluşmaz. Var olan notlar satır içi düzenlenir, silinir; gövde **markdown** olarak önizlenir (başlıklar, listeler, kalın/italik, `kod`, alıntı, bağlantılar). Liste sırası kullanıcıya aittir — satırdaki tutamaktan (⠿) sürükleyip bırakılarak (dokunmatik dâhil) ya da tutamak odaklıyken ↑/↓ ile taşınır; bir notu açmak/okumak sırayı değiştirmez. Yazdıkça otomatik kaydedilir.
3. **Yapılacaklar** — ekle, tamamla, sil; tümü/aktif/tamamlanan filtresi; “tamamlananları temizle”. Sıralama satırdaki tutamaktan (⠿) sürüklenerek (dokunmatik dâhil) ya da tutamak odaklıyken ↑/↓ ile taşınır.
4. **Zinciri kırma** — son 13 haftanın ızgarası; güne tıklayarak işaretle/kaldır; güncel seri, en uzun seri ve toplam gün sayaçları. Bir pomodoro tamamlandığında bugünkü gün otomatik işaretlenir.

## Kapsam

- **İçinde:** yukarıdaki dört araç + açık/koyu tema.
- **Dışında:** kullanıcı hesabı, bulut senkronizasyonu, istatistik/raporlama, ekip özellikleri, üçüncü taraf entegrasyon.

## Çalıştırma

Tarayıcı açmak yeterlidir (derleme adımı yok):

```sh
open index.html
```

Ya da yerel sunucuyla (localStorage davranışı en garantili yol):

```sh
python3 -m http.server 8000
# http://localhost:8000 adresini açın
```

## Veriler

Her şey tarayıcının `localStorage` alanında tutulur; sunucu yoktur.

| Anahtar | İçerik |
|---|---|
| `focus-app:notes` | notlar |
| `focus-app:todos` | yapılacaklar maddeleri (`listId` ile listesine bağlı) |
| `focus-app:todo-lists` | yapılacaklar listeleri — `[{id,name}]`, şerit sırası |
| `focus-app:todo-active` | yapılacaklarda seçili sekme (list id) |
| `focus-app:chain` | işaretli günler |
| `focus-app:pomodoro` | pomodoro durumu ve süre ayarları |
| `focus-app:theme` | tema seçimi |

## Dosya düzeni

```
index.html                  kabuk ve dört araç paneli
styles/design-tokens.css    e-ink tasarım kitinin tokenları (üretilmiş dosya — elle düzenlenmez)
styles/app.css              uygulama stili (yalnızca token değişkenlerini kullanır)
js/store.js                 kalıcılık + saf mantık (seri hesabı, faz mantığı, biçimlendirme)
js/pomodoro.js              geri sayım
js/notes.js                 not alma
js/todos.js                 yapılacaklar
js/chain.js                 zincir ızgarası ve seri
js/app.js                   sekmeler, tema, başlatma
```

## Tasarım

WrongStack Design Studio **e-ink** kiti (kitap benzeri, gri tonlu, parlaksız). Tokenlar `styles/design-tokens.css` içindedir; uygulama renkleri/yarıçapları yalnızca oradan alır. Tema `html.dark` sınıfıyla değişir.

## Erişilebilirlik ve doğrulama

### WCAG 2.2 AA kontrast oranları

Hesap yöntemi: `oklch → doğrusal sRGB` (Ottosson ters matrisleri) → WCAG bağıl
parlaklığı → (Lmax + 0.05) / (Lmin + 0.05). Eşikler: gövde metni 4.5:1, büyük
metin/arayüz 3:1.

| Çift | Açık tema | Koyu tema | AA (4.5:1) |
|---|---|---|---|
| fg/bg | 17.75:1 | 15.53:1 | geçer |
| muted/bg | 5.66:1 | 5.40:1 | geçer |
| bg/fg | 17.75:1 | 15.53:1 | geçer |

`bg/fg` aynı malzemenin ters yerleşimidir (ör. birincil düğme: fg zemin, bg
yazı); kontrast oranı simetriktir. Altı çiftin tamamı AA üzerindedir; token
değişikliği gerekmedi.

### Erişilebilirlik çıpaları

- `#chain-grid` → `#chain-hint` bağlantısı `aria-describedby` ile kurulur:
  ızgaraya odaklanan ekran okuyucu klavye yönergesini okur.
- `#chain-status` ayrı bir durum satırıdır (`role="status"`,
  `aria-live="polite"`); işaret duyuruları yönerge metnini ezmez.
- Klavye odağı korunur: yapılacaklar ve not listeleri yeniden çizildiğinde odak
  ilgili denetime geri verilir; zincir ızgarasında ok tuşuyla gezinme (roving
  tabindex) vardır.
- `:focus-visible` odak halkası görünürdür; bugün imgesi iç kutu (`box-shadow`)
  ile çizildiği için halkayla çakışmaz.
- Hareket azaltma: `prefers-reduced-motion` altında geçişler kapanır.

### design verify durumu

`%93` palet uyumu; 8 bulgunun 8'i üretilmiş `styles/design-tokens.css`
içindeki gölge tanımlarıdır (kit çıktısı), `styles/app.css` temizdir. Bu tarama
kaynak sezgiseldir; görsel ve ekran okuyucu incelemesi insan gözü gerektirir.

## Kontroller

```sh
npm install   # yalnız test bağımlılığı: playwright (uygulamayı çalıştırmak için gerekmez)
for f in js/*.js; do node --check "$f"; done
node --test tests/
```

`tests/notes-click.test.js` ve `tests/notes-view.test.js` gerçek tarayıcıda uçtan uca koşar: yutulan tıklama, bir notu okumanın sırayı bozmaması, elle sıralamanın kalıcılığı ve markdown önizleme/HTML kaçışı regresyonlarını korur (`tests/markdown.test.js` birim katmanı). Sistem Chrome'u kullanır; yoksa `npx playwright install chromium` ile Playwright tarayıcısı kurulabilir. Hiç tarayıcı bulunamazsa bu testler `skip` olur, diğerleri yeşil kalır.