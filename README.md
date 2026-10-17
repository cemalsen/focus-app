# Odak — odaklanma uygulaması

Bağımlılıksız, tek sayfalık bir odaklanma uygulaması. Dört özellik içerir, fazlası bilinçli olarak kapsam dışıdır. Çalışma zamanında hiçbir paket gerekmez; yalnız testler için `playwright` geliştirme bağımlılığı vardır.

## Özellikler

1. **Pomodoro** — 25 dk odak / 5 dk kısa mola / 4 döngüde 15 dk uzun mola; başlat–duraklat–sıfırla; süreler başlıktaki **Ayarlar** pop-up'ından değiştirilir. Geri sayım dijital ya da kadran (analog) biçimde gösterilebilir — aynı Ayarlar panelinden seçilir, varsayılan dijitaldir. Sayaç duvara saatine göre işler, sekme arka plandayken de şaşmaz. Biten her odak yumuşak bir *bip* sesi verir.
2. **Notlar** — başlık + gövde. “Yeni not” açılır pencerede (pop-up) not alma formu açar: **Tamam** kaydeder, **İptal** vazgeçer (Esc ile de kapatılır); her iki alan da boşsa not oluşmaz. Var olan notlar satır içi düzenlenir, silinir; gövde **markdown** olarak önizlenir (başlıklar, listeler, kalın/italik, `kod`, alıntı, bağlantılar). Liste sırası kullanıcıya aittir — satırdaki tutamaktan (⠿) sürükleyip bırakılarak (dokunmatik dâhil) ya da tutamak odaklıyken ↑/↓ ile taşınır; bir notu açmak/okumak sırayı değiştirmez. Yazdıkça otomatik kaydedilir.
3. **Yapılacaklar** — ekle, tamamla, sil; tümü/aktif/tamamlanan filtresi; “tamamlananları temizle”. Sıralama satırdaki tutamaktan (⠿) sürüklenerek (dokunmatik dâhil) ya da tutamak odaklıyken ↑/↓ ile taşınır.
4. **Zinciri kırma** — ızgara zincirin en eski işaretiyle başladığı haftadan açılır (en fazla son 13 hafta; hiç işaret yoksa yalnız içinde bulunulan hafta), böylece zincir öncesi boş sütunlar gösterilmez; güne tıklayarak işaretle/kaldır; güncel seri, en uzun seri ve toplam gün sayaçları. Kutuların içinde ayın gün numarası açık gri olarak gösterilir (dar/mobil ekranda çizilmez). Bir pomodoro tamamlandığında bugünkü gün otomatik işaretlenir.

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
js/app.js                   sekmeler, tema, Ayarlar pop-up'ı, başlatma
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
- Zincir kutusundaki ayın gün numarası dekoratiftir: `.chain-day` ekran okuyucuya
  `aria-hidden="true"` ile kapalıdır. Hücrenin erişilebilir adı `aria-label`'daki
  tam tarihten gelir (`js/chain.js` → `paintCell`: `13 Ekim 2026 — işaretli`);
  numara bu ada sızmaz.
- Ayarlar pop-up'ı yerel `<dialog>` + `showModal()` ile açılır: odak tuzağı,
  **Esc** ile kapanma ve arka planın ilgisizleşmesi tarayıcıdan gelir; ilk odak
  sağ üst köşedeki **X**'tedir (`aria-label="Ayarları kapat"`), kapanışta odak
  `#settings-toggle`'a döner ve `aria-expanded` `dialog.open` ile senkron tutulur.
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

`tests/notes-click.test.js` ve `tests/notes-view.test.js` gerçek tarayıcıda uçtan uca koşar: yutulan tıklama, bir notu okumanın sırayı bozmaması, elle sıralamanın kalıcılığı, markdown önizleme/HTML kaçışı ve dar ekranda ön izleme paneli (kapalı başlar, liste üstünde açılır, X ile kapanır; masaüstü davranışı sabit) regresyonlarını korur (`tests/markdown.test.js` birim katmanı). `tests/chain-days.test.js` zincir ızgarasındaki kutu içi gün numarasını korur: masaüstünde her kutunun içinde soluk gri (yarı saydam) gün numarası çizilir, dar ekranda numara gizlenir fakat kutu tıklanınca işaretlenmeye devam eder; ayrıca Playwright'ın `ariaSnapshot` ile **hesapladığı** erişilebilir adın bugünkü, işaretli ve `disabled` hücrelerin `aria-label` değeriyle birebir aynı olduğu, `.chain-day` numarasının `aria-hidden="true"` kaldığı ve bu ada sızmadiği doğrulanır; ayrıca ızgara penceresi kilitlidir: en eski işaretin haftasından başlar (öncesinde hücre çizilmez), işaret yoksa yalnız bu hafta çizilir, 13 haftadan eski zincirde pencere 13 haftada tavanlanır, gelecek/bozuk anahtar pencereyi bozmaz ve en eski işaretin kaldırılması pencereyi sayfa yenilenmeden anında küçültür. `tests/settings-dialog.test.js` Ayarlar pop-up'ını korur: dar ekranda Ayarlar düğmesi yalnız simgeyle çizilir (metin gizli, ≥44px dokunma alanı, ad `aria-label`'dan) ve tema düğmesinin solunda kalırken tema düğmesi sağ üst köşedeki yerini kaybetmez; tıklama yerel `<dialog>`'u açar (`aria-expanded` güncellenir, odak dialog'un içine girer), sağ üst köşedeki **X** ve **Esc** kapatır ve odak tetikleyiciye döner; süre alanları artık dialog'un içindedir (Pomodoro panelinde değil), Odak (dk) değişikliği sayacı günceller ve yenilemede yaşar; dialog, Pomodoro sekmesi kapalıyken de açılır. `Saat görünümü` (Dijital/Kadran) seçimi de burada korunur: kadran çizilir, dijital metin erişilebilir biçimde gizlenir (`role="timer"` yaşar) ve tercih yenilemede kalıcıdır; kadran modunda alttaki ilerleme çubuğu (`.bar`) çizilmez. Saat boyutu da kilitlidir: masaüstünde hafifçe büyür (dijital 5.5rem, kadran 18rem), dar ekranda küçülmez (sırasıyla sabit 5rem ve 15rem; 375px'te ölçülür). `tests/shell-theme.test.js` kabuk tema düğmesini korur: dar ekranda düğme simgeyle başlığın karşısına sağ üst köşeye iner, tıklama ay↔güneş simgesini `aria-pressed`/`aria-label` ve `html.dark` ile birlikte çevirir, geniş ekranda ise metin etiketi kalır ve simge çizilmez. `tests/footer.test.js` yapışkan altbilgiyi korur: kısa sayfada altbilginin alt kenarı viewport altına yapışık kalır ve yüksekliğini yalnız üst çerçeve + padding + `<p>` belirler (`<p>` kenar boşlukları sıfırlanmıştır) — bu ölçüm 1280×900 ve 375×812 kırılımlarının ikisinde de koşar; ayrıca uzun içerikte altbilgi belge akışının sonunda kalır, viewport altına taşsa da kesilmez. `tests/todos-lists.test.js` çoklu listeyi korur: `listId`'siz eski maddeler "Genel" sekmesine kalıcı olarak geçer, diyalogda boş ad ve **İptal** liste kurmaz, ekleme yalnız aktif listeye yazılır ve "tamamlananları temizle" yalnız aktif listenin tamamlananlarını siler, aktif sekme ile Shift+ok taşınan şerit sırası yenilemede kalır, iki adımlı onay olmadan silme tıklaması liste silmez. `tests/todos-view.test.js` yapılacaklar sırasını korur: tutamak ok tuşları (↑/↓), dokunmatik sürükleme ve satır düzeyinde HTML5 sürükle-bırak sıralamayı değiştirir ve kalıcı olur (yalnız `order` yazılır, `createdAt` sabit kalır), tamamlama işareti ve filtre değişimi ise sırayı oynatmaz. Birim katmanı tarayıcı gerektirmez: `tests/store.test.js` `js/store.js`'ı doğrudan Node'a yükler ve saf sözleşmeleri kilitler — tarih taşmaları (ay sonu, artık yıl, yıl sınırı) ile `parseKey ∘ dateKey` kimliği, `currentStreak`/`longestStreak` kesintileri ve ay/yıl sınırını aşan koşular, `breakAfter`/`formatClock`/`clampMinutes`, localStorage taklidi üzerinde `load`/`save` (JSON kodlama, bozuk JSON ve kota hatasında `false`, kayıtlı `null`'un yedek değil `null` dönmesi), `KEYS`/`CYCLE_LEN` sabitleri ve not/liste sıralama yardımcıları (`normalizeNotes`/`sortNotes`/`moveNote`/`placeNote`, `todoListsInit`, `moveList`/`placeList`) regresyonları; `tests/pomodoro.test.js` ise elle kurulmuş taklit DOM ve Web Audio üzerinde uyarı zilini (üç vuruş 880/880/660 Hz, sönümlenen zarf, `focus:pomodoro-completed` olayının tek yayını), ses kilidi ile zil açma/kapama tercihini, sayfa kapalıyken tamamlanan fazın açılışta zil çalmamasını, elle faz geçişinde sayacın kendiliğinden ilerlememesini ve çalışan bir odak bölündüğünde sayacın durduğunu, döngü sayacının korunduğunu, yarım kalan odağın zinciri işaretlemediğini doğrular — bu ikisi `tests/browser-harness.js` kullanmaz, tarayıcı olmasa da koşar. Sistem Chrome'u kullanır; yoksa `npx playwright install chromium` ile Playwright tarayıcısı kurulabilir. Hiç tarayıcı bulunamazsa `tests/browser-harness.js` kullanan sekiz test `skip` olur, birim testleri (`markdown`, `store`, `pomodoro`) yeşil kalır.