/* Odak — ortak katman: kalıcılık + saf mantık.
   Tarayıcıda `window.FocusStore`, Node smoke testinde CommonJS olarak yüklenir;
   saf yardımcılar localStorage'a dokunmadığı için uçtan uca test edilebilir. */
(function (global) {
  'use strict';

  var KEYS = {
    notes: 'focus-app:notes',
    todos: 'focus-app:todos',
    todoLists: 'focus-app:todo-lists',
    todoActive: 'focus-app:todo-active',
    chain: 'focus-app:chain',
    pomodoro: 'focus-app:pomodoro',
    theme: 'focus-app:theme'
  };

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ── kalıcılık ─────────────────────────────────────────── */
  function load(key, fallback) {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(key) : null;
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback; // bozuk kayıt: varsayılana düş, uygulama çalışmaya devam eder
    }
  }

  function save(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Kota dolu / gizli mod: sessizce yutma — çağıran taraf kullanıcıya haber vermeli.
      return false;
    }
  }

  /* ── tarih anahtarları: yerel güne göre YYYY-MM-DD ─────── */
  function dateKey(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function parseKey(k) {
    var p = String(k).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setDate(c.getDate() + n);
    return c;
  }

  function mondayOf(d) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var shift = (c.getDay() + 6) % 7; // Pzt=0 … Paz=6
    return addDays(c, -shift);
  }

  /* ── zincir: seri hesapları ─────────────────────────────
     marks: { "2026-10-01": true, … } (yalnızca işaretli günler) */
  function isMarked(marks, d) {
    return marks[dateKey(d)] === true;
  }

  function currentStreak(marks, today) {
    // Seri bugünden ya da dünden geriye doğru kesintisiz işaretli gündür;
    // bugün henüz işaretlenmediyse seri kırılmış sayılmaz.
    var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!isMarked(marks, cursor)) cursor = addDays(cursor, -1);
    var n = 0;
    while (isMarked(marks, cursor)) {
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  function longestStreak(marks) {
    var keys = Object.keys(marks).filter(function (k) { return marks[k] === true; }).sort();
    var best = 0;
    var run = 0;
    var prev = null;
    keys.forEach(function (k) {
      if (prev && dateKey(addDays(prev, 1)) === k) run += 1;
      else run = 1;
      prev = parseKey(k);
      if (run > best) best = run;
    });
    return best;
  }

  function markedCount(marks) {
    return Object.keys(marks).filter(function (k) { return marks[k] === true; }).length;
  }

  function toggleMark(marks, d) {
    var k = dateKey(d);
    if (marks[k] === true) delete marks[k];
    else marks[k] = true;
    return marks[k] === true;
  }

  /* ── pomodoro: faz mantığı ──────────────────────────────── */
  var CYCLE_LEN = 4;

  function clampMinutes(v, min, max, fallback) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function phaseMinutes(phase, s) {
    return phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin;
  }

  // Tamamlanan odak sayısı 4'ün katıysa uzun mola, değilse kısa mola.
  function breakAfter(focusCompleted) {
    return focusCompleted % CYCLE_LEN === 0 ? 'long' : 'short';
  }

  function remainingSeconds(endAt, now) {
    return Math.max(0, Math.ceil((endAt - now) / 1000));
  }

  function formatClock(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  /* ── not taslağı ───────────────────────────────────────── */
  // "Yeni not" formundan gelen değerler; her ikisi de boşsa null — boş not kaydedilmez.
  function noteDraft(title, body) {
    var t = String(title == null ? '' : title).trim();
    var b = String(body == null ? '' : body).trim();
    if (!t && !b) return null;
    return { title: t, body: b };
  }

  /* ── not sırası: kullanıcıya ait, zamandan bağımsız ─────── */
  // Sıra `order` alanındadır (büyük olan üstte). Bir notu açmak/görüntü
  // sayaçlarına dokunmak yalnız updatedAt'e yazar; sıra değişmez. Eski
  // kayıtlarda order yoktur: updatedAt epoch'u ile doldurulur ki geçişte
  // bugünkü görünüm korunsun.
  function normalizeNotes(list) {
    var arr = Array.isArray(list) ? list : [];
    arr.forEach(function (n) {
      if (typeof n.order !== 'number' || !isFinite(n.order)) {
        n.order = Date.parse(n.updatedAt || n.createdAt || '') || 0;
      }
    });
    return arr;
  }

  function sortNotes(list) {
    return normalizeNotes(Array.isArray(list) ? list : []).slice().sort(function (a, b) {
      return (b.order - a.order) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  // dir: -1 yukari, +1 asagi. Yalniz order alanlari degisir; esit order'li
  // (miras) komsularda bile sessiz no-op yok — yerlestirme tabanli yeniden dagitim.
  function moveNote(list, id, dir) {
    var arr = sortNotes(list);
    var from = -1;
    arr.forEach(function (n, i) { if (n.id === id) from = i; });
    if (from < 0) return false;
    return placeNote(list, id, from + dir);
  }

  /* ── markdown alt kümesi → güvenli HTML ─────────────────── */
  // Desteklenen: # başlıklar, -,*,+ ve 1. listeler, **kalın**, __kalın__,
  // *italik*, _italik_, `kod`, ~~üstü çizili~~, [metin](bağlantı), > alıntı,
  // paragraf (paragraf içi tek satır sonu <br>). Girdi her zaman kaçırılır;
  // bağlantı şeması beyaz listelidir (https?, mailto) — javascript: HTML'e girmez.
  function mdEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\u0000/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Bağlantılar önce yer tutucuya alınır: URL vurgu kurallarının eline düşmez
  // (https://a.com/a*b*c gibi hedefler bozulmaz); yalnız etiket vurgulanır.
  function applyEmphasis(t) {
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[\s([{>])__([^_\n]+)__/gm, '$1<strong>$2</strong>');
    t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    t = t.replace(/(^|[\s([{>])_([^_\n]+)_/gm, '$1<em>$2</em>');
    t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return t;
  }

  function mdEmphasis(t) {
    var links = [];
    t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]*)\)/gi, function (m, label, url) {
      links.push('<a href="' + url + '" rel="noopener noreferrer">' + applyEmphasis(label) + '</a>');
      return '\u0000' + (links.length - 1) + '\u0000';
    });
    t = applyEmphasis(t);
    return t.replace(/\u0000(\d+)\u0000/g, function (m, i) { var v = links[Number(i)]; return v == null ? m : v; });
  }

  function mdInline(escaped) {
    // `kod` dilimleri diğer dönüşümlerden korunur; eşleşmeyen ters tırnak metin kalır.
    var out = '';
    var rest = escaped;
    for (;;) {
      var open = rest.indexOf('`');
      var close = open < 0 ? -1 : rest.indexOf('`', open + 1);
      if (open < 0 || close < 0) { out += mdEmphasis(rest); break; }
      out += mdEmphasis(rest.slice(0, open));
      out += '<code>' + rest.slice(open + 1, close) + '</code>';
      rest = rest.slice(close + 1);
    }
    return out;
  }

  function mdToHtml(src) {
    var lines = mdEscape(src).split(/\r\n|\r|\n/);
    var html = [];
    var para = [];
    var quote = [];
    var list = null;

    function flushPara() {
      if (!para.length) return;
      html.push('<p>' + para.map(mdInline).join('<br>') + '</p>');
      para = [];
    }
    function flushQuote() {
      if (!quote.length) return;
      html.push('<blockquote>' + quote.map(mdInline).join('<br>') + '</blockquote>');
      quote = [];
    }
    function flushList() {
      if (!list) return;
      html.push('<' + list.tag + '>' + list.items.map(function (it) {
        return '<li>' + mdInline(it) + '</li>';
      }).join('') + '</' + list.tag + '>');
      list = null;
    }
    function flushAll() { flushPara(); flushList(); flushQuote(); }

    lines.forEach(function (line) {
      var h = /^(#{1,6})\s+(.+)$/.exec(line);
      var li = /^[-*+]\s+(.+)$/.exec(line);
      var oli = /^\d+[.)]\s+(.+)$/.exec(line);
      var q = /^&gt;\s?(.*)$/.exec(line);
      if (q) { flushPara(); flushList(); quote.push(q[1]); return; }
      if (h) {
        flushAll();
        html.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>');
        return;
      }
      if (li || oli) {
        flushPara();
        flushQuote();
        var tag = li ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
        list.items.push((li || oli)[1]);
        return;
      }
      if (!line.trim()) { flushAll(); return; }
      flushList();
      flushQuote();
      para.push(line.trim());
    });
    flushAll();
    return html.join('\n');
  }



  // Surukle-birak: id'yi gorunum diziliminde targetIndex noktasina tasir (0 = tepe).
  // Yalniz order alanlari yeniden dagitilir (azalan tamsayilar); updatedAt'e dokunulmaz.
  function placeNote(list, id, targetIndex) {
    var arr = sortNotes(list);
    var from = -1;
    arr.forEach(function (n, i) { if (n.id === id) from = i; });
    if (from < 0 || targetIndex < 0 || targetIndex >= arr.length || from === targetIndex) return false;
    var moved = arr.splice(from, 1)[0];
    arr.splice(targetIndex, 0, moved);
    arr.forEach(function (n, i) { n.order = arr.length - i; });
    return true;
  }

  /* ── liste sırası: şerit sırası = dizi sırası (ayrı order alanı yok) ──
     placeList: id'yi hedef indekse taşır (splice tabanlı yer değiştirme);
     moveList: odaklı sekmeden komşu sekmeye taşır (-1 sol, +1 sağ).
     İkisi de GİRDİ DİZİSİNİ yerinde değiştirir ve gerçek taşınmada true
     döner; aynı yer / sınır dışı / bulunamayan id false — sessiz no-op. */
  function placeList(lists, id, targetIndex) {
    if (!Array.isArray(lists)) return false;
    var from = -1;
    lists.forEach(function (l, i) { if (l && l.id === id) from = i; });
    if (from < 0 || targetIndex < 0 || targetIndex >= lists.length || from === targetIndex) return false;
    var moved = lists.splice(from, 1)[0];
    lists.splice(targetIndex, 0, moved);
    return true;
  }

  function moveList(lists, id, dir) {
    if (!Array.isArray(lists)) return false;
    var from = -1;
    lists.forEach(function (l, i) { if (l && l.id === id) from = i; });
    if (from < 0) return false;
    return placeList(lists, id, from + dir);
  }

  /* ── yapılacaklar listeleri: çoklu liste modeli + geçiş ────────
     lists: [{id,name}] — sekme şeridi; görüntüleme sırası dizi sırasıdır
     (sıra placeList/moveList ile kullanıcı tarafından değiştirilebilir).
     Her madde `listId`
     ile bir listeye bağlıdır; listesiz (eski) maddeler ilk yüklemede
     varsayılan ada bağlanır. `changed` yalnız gerçek onarım/üretim olduysa
     true — gereksiz kalıcı yazım yapılmaz. */
  // "Yeni liste" diyalog ad taslağı: boş/boşluk ad null — boş liste kurulmaz.
  function listNameDraft(name) {
    var t = String(name == null ? '' : name).trim();
    return t || null;
  }

  function todoListsInit(lists, todos, defaultName) {
    var raw = Array.isArray(lists) ? lists : [];
    var seen = Object.create(null); // prototip adlı id'ler (constructor vb.) seen sanılmasın
    var clean = [];
    raw.forEach(function (l) {
      if (!l || typeof l.id !== 'string' || !l.id || typeof l.name !== 'string' || !l.name.trim() || seen[l.id]) return;
      seen[l.id] = true;
      clean.push({ id: l.id, name: l.name.trim() });
    });
    var changed = clean.length !== raw.length;
    var items = Array.isArray(todos) ? todos : [];
    if (!clean.length) { // ilk kurulum ya tümüyle bozuk kayıt: tek varsayılan liste
      clean = [{ id: uid(), name: listNameDraft(defaultName) || 'Liste' }];
      seen[clean[0].id] = true;
      changed = true;
    }
    items.forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      if (typeof t.listId !== 'string' || !seen[t.listId]) { t.listId = clean[0].id; changed = true; }
    });
    return { lists: clean, todos: items, changed: changed };
  }

  var api = {
    KEYS: KEYS,
    CYCLE_LEN: CYCLE_LEN,
    uid: uid,
    load: load,
    save: save,
    dateKey: dateKey,
    parseKey: parseKey,
    addDays: addDays,
    mondayOf: mondayOf,
    isMarked: isMarked,
    currentStreak: currentStreak,
    longestStreak: longestStreak,
    markedCount: markedCount,
    toggleMark: toggleMark,
    clampMinutes: clampMinutes,
    phaseMinutes: phaseMinutes,
    breakAfter: breakAfter,
    remainingSeconds: remainingSeconds,
    formatClock: formatClock,
    noteDraft: noteDraft,
    normalizeNotes: normalizeNotes,
    sortNotes: sortNotes,
    moveNote: moveNote,
    placeNote: placeNote,
    mdToHtml: mdToHtml,
    listNameDraft: listNameDraft,
    todoListsInit: todoListsInit,
    moveList: moveList,
    placeList: placeList
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FocusStore = api;
})(typeof window !== 'undefined' ? window : globalThis);