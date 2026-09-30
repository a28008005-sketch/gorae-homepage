/* ===== 도서 등록 도우미 (Books) =====
 *
 * 도서 대여 화면이 쓰는 도구 모음입니다. 화면(views/library.js)과 떨어뜨려 둔 이유는
 * 여기 있는 것들이 전부 '책 한 권의 정보를 어떻게 만들고 읽느냐'에 관한 것이라서입니다.
 *
 *  1. ISBN       — 바코드로 찍힌 숫자가 맞는 ISBN 인지 확인하고 13자리로 맞춥니다.
 *  2. 도서 조회   — ISBN 으로 제목·지은이·출판사·출판일·표지를 자동으로 가져옵니다.
 *  3. 청구기호    — [레벨]-[분류]-[번호] 규칙(예: Lv3-RD-001)으로 자동으로 만듭니다.
 *  4. CSV 읽기   — 엑셀에서 저장한 CSV(한글 인코딩 포함)와 엑셀에서 복사해 붙여넣은 표를 읽습니다.
 *  5. 라벨       — 책등에 붙일 청구기호 라벨(바코드 포함)을 A4 라벨지로 뽑습니다.
 *  6. 한/영 보정  — 바코드 스캐너가 한글 입력 상태에서 찍혀 'ㅣㅍ3-ㄱㅇ-001' 처럼 들어온 것을 되돌립니다.
 */
window.Books = (function () {

  /* =====================================================================
   * 1. ISBN
   * ===================================================================== */

  /** 숫자와 X 만 남깁니다 */
  function digits(s) {
    return String(s || '').replace(/[^0-9xX]/g, '').toUpperCase();
  }

  function isbn13Ok(d) {
    if (!/^97[89][0-9]{10}$/.test(d)) return false;
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += (+d.charAt(i)) * (i % 2 ? 3 : 1);
    return (10 - sum % 10) % 10 === +d.charAt(12);
  }
  function isbn10Ok(d) {
    if (!/^[0-9]{9}[0-9X]$/.test(d)) return false;
    var sum = 0;
    for (var i = 0; i < 10; i++) sum += (d.charAt(i) === 'X' ? 10 : +d.charAt(i)) * (10 - i);
    return sum % 11 === 0;
  }
  function to13(d10) {
    var core = '978' + d10.slice(0, 9), sum = 0;
    for (var i = 0; i < 12; i++) sum += (+core.charAt(i)) * (i % 2 ? 3 : 1);
    return core + ((10 - sum % 10) % 10);
  }

  /**
   * 바코드로 찍힌 값을 13자리 ISBN 으로 맞춥니다. ISBN 이 아니면 '' 를 돌려줍니다.
   * 책 뒤 바코드 옆에 붙은 5자리 부가기호(가격 바코드)가 같이 찍혀 18자리로 들어와도 앞 13자리를 씁니다.
   */
  function normIsbn(s) {
    var d = digits(s);
    if (d.length === 18 && isbn13Ok(d.slice(0, 13))) return d.slice(0, 13);
    if (d.length === 13 && isbn13Ok(d)) return d;
    if (d.length === 10 && isbn10Ok(d)) return to13(d);
    return '';
  }
  /** 사람이 입력한 값이 ISBN 모양(10·13자리 숫자)인지만 봅니다 */
  function looksIsbn(s) {
    var d = digits(s);
    return d.length === 10 || d.length === 13 || d.length === 18;
  }

  /* =====================================================================
   * 2. 도서 조회
   *
   * 순서대로 물어보고 먼저 답이 온 곳의 정보를 씁니다.
   *   ① 학원 워커(/api/book) — 네이버 책 · 알라딘. 열쇠가 필요해서 워커에 넣어 두고 거기서 대신 물어봅니다.
   *      (네이버 비밀키를 화면 코드에 넣으면 누구나 볼 수 있어서 이렇게 합니다.)
   *   ② 구글 도서 — 열쇠 없이 됩니다. 영어 원서는 대부분 나옵니다.
   *   ③ 오픈 라이브러리 — 열쇠 없이 됩니다. 구글에 없는 영어 원서 보충용.
   * ===================================================================== */

  var TIMEOUT = 7000;

  function getJson(url, opts) {
    return new Promise(function (resolve) {
      var done = false;
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctl) ctl.abort();
        resolve(null);
      }, TIMEOUT);
      var init = Object.assign({ cache: 'no-store' }, opts || {});
      if (ctl) init.signal = ctl.signal;
      fetch(url, init).then(function (res) {
        if (!res.ok) return null;
        var type = res.headers.get('content-type') || '';
        if (type.indexOf('json') < 0) return null;
        return res.json();
      }).then(function (j) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(j || null);
      }).catch(function () {
        if (done) return;
        done = true; clearTimeout(timer); resolve(null);
      });
    });
  }

  function clean(s) {
    return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
  function https(u) {
    u = String(u || '').trim();
    return u.indexOf('http://') === 0 ? 'https://' + u.slice(7) : u;
  }
  /** 날짜 모양을 YYYY-MM-DD / YYYY-MM / YYYY 중 하나로 맞춥니다 */
  function normDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})[-./]?(\d{1,2})?[-./]?(\d{1,2})?/);
    if (!m) {
      var y = s.match(/(\d{4})/);
      return y ? y[1] : '';
    }
    var out = m[1];
    if (m[2]) out += '-' + U.pad(+m[2]);
    if (m[2] && m[3]) out += '-' + U.pad(+m[3]);
    return out;
  }

  function viaWorker(isbn) {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
    return getJson('/api/book?isbn=' + isbn, { credentials: 'same-origin' }).then(function (j) {
      return j && j.title ? j : null;
    });
  }

  function viaGoogle(isbn) {
    return getJson('https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn).then(function (j) {
      var v = j && j.items && j.items[0] && j.items[0].volumeInfo;
      if (!v || !v.title) return null;
      var img = v.imageLinks || {};
      return {
        title: clean(v.title + (v.subtitle ? ': ' + v.subtitle : '')),
        author: (v.authors || []).join(', '),
        publisher: clean(v.publisher),
        pubDate: normDate(v.publishedDate),
        cover: https(img.thumbnail || img.smallThumbnail || ''),
        source: '구글 도서'
      };
    });
  }

  function viaOpenLibrary(isbn) {
    return getJson('https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn + '&format=json&jscmd=data')
      .then(function (j) {
        var v = j && j['ISBN:' + isbn];
        if (!v || !v.title) return null;
        return {
          title: clean(v.title + (v.subtitle ? ': ' + v.subtitle : '')),
          author: (v.authors || []).map(function (a) { return a.name; }).join(', '),
          publisher: (v.publishers || []).map(function (p) { return p.name; }).join(', '),
          pubDate: normDate(v.publish_date),
          cover: https(v.cover && (v.cover.medium || v.cover.small) || ''),
          source: '오픈 라이브러리'
        };
      });
  }

  /** 시험용으로 조회 방법을 갈아 끼울 수 있게 배열로 둡니다 */
  var sources = [viaWorker, viaGoogle, viaOpenLibrary];

  /**
   * ISBN 으로 책 정보를 찾습니다.
   * @returns Promise<{isbn,title,author,publisher,pubDate,cover,source} | null>
   */
  function lookup(raw) {
    var isbn = normIsbn(raw);
    if (!isbn) return Promise.resolve(null);
    var i = 0;
    function next() {
      if (i >= sources.length) return Promise.resolve(null);
      var fn = sources[i++];
      return Promise.resolve().then(function () { return fn(isbn); })
        .catch(function () { return null; })
        .then(function (r) {
          if (!r || !r.title) return next();
          r.isbn = isbn;
          r.title = clean(r.title);
          r.author = clean(r.author);
          r.publisher = clean(r.publisher);
          r.pubDate = normDate(r.pubDate);
          r.cover = https(r.cover);
          return r;
        });
    }
    return next();
  }

  /* =====================================================================
   * 3. 청구기호 — [레벨]-[분류]-[번호]
   *
   * 예) Lv3-RD-001  →  레벨 3 · 리더스 · 1번
   * 바코드 스캐너로 다시 찍을 수 있도록 영문·숫자만 씁니다.
   * (라벨 바코드는 한글을 담을 수 없습니다)
   * ===================================================================== */

  var CAT_CODE = {
    '리더스': 'RD', '챕터북': 'CB', '노블': 'NV', '논픽션': 'NF', '그림책': 'PB', '워크북': 'WB'
  };
  var OTHER_CODE = 'ET';

  function catCode(category) { return CAT_CODE[category] || OTHER_CODE; }

  /** 이 책의 레벨 (1~5) — 워크시트 레벨 판정과 같은 기준을 씁니다 */
  function levelNo(b) {
    try { return Worksheet.levelOf(b || {}); } catch (e) { return 3; }
  }

  function codePrefix(b) {
    return 'Lv' + levelNo(b) + '-' + catCode(b && b.category);
  }

  /**
   * 다음 청구기호를 만듭니다.
   * @param b      책 정보 (레벨·분류를 봅니다)
   * @param taken  이번에 함께 등록하느라 아직 저장 안 된 기호들 (일괄 등록용)
   */
  function nextCode(b, taken) {
    var prefix = codePrefix(b);
    var re = new RegExp('^' + prefix.replace(/[-]/g, '\\-') + '-(\\d+)$', 'i');
    var max = 0;
    var all = Store.books().map(function (x) { return x.code || ''; }).concat(taken || []);
    all.forEach(function (c) {
      var m = String(c).match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var n = String(max + 1);
    while (n.length < 3) n = '0' + n;
    return prefix + '-' + n;
  }

  /* =====================================================================
   * 4. CSV 읽기
   * ===================================================================== */

  /**
   * 파일을 글자로 읽습니다. 엑셀에서 그냥 'CSV'로 저장하면 한글이 EUC-KR 로 저장되므로
   * UTF-8 로 읽어 보고 깨지면 EUC-KR 로 다시 읽습니다.
   */
  function readText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      r.onload = function () {
        var buf = r.result, text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        } catch (e) {
          try { text = new TextDecoder('euc-kr').decode(buf); }
          catch (e2) { text = new TextDecoder('utf-8').decode(buf); }
        }
        resolve(text.replace(/^﻿/, ''));
      };
      r.readAsArrayBuffer(file);
    });
  }

  /**
   * CSV / 탭 구분 표를 2차원 배열로 바꿉니다.
   * 따옴표로 감싼 칸("Frog, Toad") 과 칸 안의 줄바꿈을 제대로 읽습니다.
   * 엑셀에서 칸을 복사해 붙여넣으면 탭으로 구분되어 들어오는데, 첫 줄에 탭이 있으면 탭 표로 읽습니다.
   */
  function parseTable(text) {
    text = String(text || '').replace(/^﻿/, '');
    var firstLine = text.split(/\r?\n/)[0] || '';
    var sep = firstLine.indexOf('\t') >= 0 ? '\t' : (firstLine.indexOf(',') < 0 && firstLine.indexOf(';') >= 0 ? ';' : ',');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else q = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"' && cell === '') { q = true; continue; }
      if (ch === sep) { row.push(cell); cell = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /** 열 이름 → 필드 이름 */
  var HEAD = {
    '청구기호': 'code', '바코드': 'code', 'code': 'code', 'callno': 'code',
    'isbn': 'isbn', 'isbn13': 'isbn', '국제표준도서번호': 'isbn',
    '제목': 'title', '도서명': 'title', '책제목': 'title', 'title': 'title',
    '지은이': 'author', '저자': 'author', '글쓴이': 'author', 'author': 'author',
    '출판사': 'publisher', 'publisher': 'publisher',
    '출판일': 'pubDate', '출간일': 'pubDate', '발행일': 'pubDate', 'pubdate': 'pubDate',
    '레벨': 'level', 'level': 'level', 'ar': 'level', 'lexile': 'level',
    '분류': 'category', '장르': 'category', 'category': 'category',
    '시리즈': 'series', 'series': 'series',
    '메모': 'note', '비고': 'note', 'note': 'note',
    '표지': 'cover', '표지이미지': 'cover', 'cover': 'cover'
  };
  function headKey(h) {
    var k = String(h || '').replace(/\s+/g, '').toLowerCase();
    return HEAD[k] || HEAD[String(h || '').trim()] || '';
  }

  /**
   * 표 글자를 책 목록으로 바꿉니다.
   * @returns { rows: [{title, isbn, ...}], unknown: ['모르는 열 이름'], error: '' }
   */
  function parseBooks(text) {
    var t = parseTable(text);
    if (t.length < 2) return { rows: [], unknown: [], error: '열 이름 줄과 자료 줄이 모두 필요합니다.' };
    var keys = t[0].map(headKey);
    var unknown = t[0].filter(function (h, i) { return !keys[i] && String(h).trim(); });
    if (keys.indexOf('title') < 0 && keys.indexOf('isbn') < 0) {
      return { rows: [], unknown: unknown, error: '제목 또는 ISBN 열을 찾지 못했습니다. 첫 줄에 열 이름을 넣어 주세요.' };
    }
    var rows = [];
    t.slice(1).forEach(function (cells) {
      var r = {};
      keys.forEach(function (k, i) {
        if (k) r[k] = String(cells[i] == null ? '' : cells[i]).trim();
      });
      if (r.isbn) {
        // 엑셀이 13자리 숫자를 9.78E+12 처럼 바꿔 저장한 경우는 되살릴 수 없어 그대로 두고 표시합니다.
        var n = normIsbn(r.isbn);
        r.isbnBad = !n;
        r.isbnSci = /e\+/i.test(r.isbn);
        if (n) r.isbn = n;
      }
      if (r.pubDate) r.pubDate = normDate(r.pubDate);
      if (r.title || r.isbn) rows.push(r);
    });
    return { rows: rows, unknown: unknown, error: rows.length ? '' : '읽을 수 있는 줄이 없습니다.' };
  }

  var TEMPLATE_HEAD = ['청구기호', 'ISBN', '제목', '지은이', '출판사', '출판일', '레벨', '분류', '시리즈', '메모'];
  /** 엑셀이 13자리 숫자를 9.78E+12 로 바꾸지 않도록 ="..." 모양(글자)으로 적습니다 */
  function asText(isbn) { return '="' + isbn + '"'; }
  function templateRows() {
    return [
      TEMPLATE_HEAD,
      ['', asText('9780064440202'), 'Frog and Toad Are Friends', 'Arnold Lobel', 'HarperCollins', '1979', 'AR 2.9', '리더스', 'Frog and Toad', ''],
      ['', asText('9780679824114'), '', '', '', '', 'AR 2.6', '챕터북', 'Magic Tree House', 'ISBN만 적어도 됩니다'],
      ['Lv2-PB-001', '', 'Brown Bear, Brown Bear, What Do You See?', 'Bill Martin Jr.', '', '', '', '그림책', '', '청구기호를 직접 적어도 됩니다']
    ];
  }

  /* =====================================================================
   * 5. 라벨 — Code 128 바코드 + 청구기호
   * ===================================================================== */

  // Code 128 막대 폭 표 (0~105). 각 값은 막대·빈칸을 번갈아 적은 폭입니다.
  var C128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232'
  ];
  var C128_STOP = '2331112';

  /** Code 128-B 로 인코딩한 막대 폭 문자열 (영문·숫자·기호만). 인코딩할 수 없으면 '' */
  function code128(text) {
    text = String(text || '');
    if (!text || /[^\x20-\x7E]/.test(text)) return '';
    var codes = [104];                                   // Start B
    for (var i = 0; i < text.length; i++) codes.push(text.charCodeAt(i) - 32);
    var sum = codes[0];
    for (var j = 1; j < codes.length; j++) sum += codes[j] * j;
    codes.push(sum % 103);
    return codes.map(function (c) { return C128[c]; }).join('') + C128_STOP;
  }

  /** 바코드 SVG — 높이는 CSS 로 정합니다 */
  function barcodeSvg(text) {
    var w = code128(text);
    if (!w) return '';
    var quiet = 10, x = quiet, rects = '';
    for (var i = 0; i < w.length; i++) {
      var n = +w.charAt(i);
      if (i % 2 === 0) rects += '<rect x="' + x + '" y="0" width="' + n + '" height="40"/>';
      x += n;
    }
    return '<svg class="bc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x + quiet) + ' 40" preserveAspectRatio="none">' +
      '<g fill="#000">' + rects + '</g></svg>';
  }

  /** 라벨지 규격. 칸 크기는 A4(210×297mm) 에서 여백을 뺀 나머지를 똑같이 나눕니다. */
  var SHEETS = {
    '3x8':  { cols: 3, rows: 8,  top: 13, side: 7, gapX: 2.5, gapY: 0, name: 'A4 24칸 (3×8)' },
    '4x10': { cols: 4, rows: 10, top: 13, side: 7, gapX: 2.5, gapY: 0, name: 'A4 40칸 (4×10)' },
    '5x13': { cols: 5, rows: 13, top: 10.7, side: 4.7, gapX: 2.5, gapY: 0, name: 'A4 65칸 (5×13)' }
  };

  /**
   * 라벨 인쇄용 HTML 한 장(여러 쪽)을 만듭니다.
   * @param list   책 목록
   * @param opts   { sheet: '4x10', skip: 이미 쓴 칸 수, barcode: true, title: true }
   */
  function labelsHtml(list, opts) {
    opts = opts || {};
    var sh = SHEETS[opts.sheet] || SHEETS['4x10'];
    var per = sh.cols * sh.rows;
    var cellW = (210 - sh.side * 2 - sh.gapX * (sh.cols - 1)) / sh.cols;
    var cellH = (297 - sh.top * 2 - sh.gapY * (sh.rows - 1)) / sh.rows;
    var academy = '';
    try { academy = (Store.get().academy || {}).name || ''; } catch (e) { academy = ''; }

    var cells = [];
    for (var s = 0; s < (opts.skip || 0); s++) cells.push('');
    list.forEach(function (b) {
      var bc = opts.barcode === false ? '' : barcodeSvg(b.code);
      cells.push(
        '<div class="lb-code">' + U.esc(b.code || '') + '</div>' +
        (bc ? '<div class="lb-bc">' + bc + '</div>' : '') +
        (opts.title === false ? '' : '<div class="lb-title">' + U.esc(b.title || '') + '</div>') +
        (academy ? '<div class="lb-ac">' + U.esc(academy) + '</div>' : ''));
    });

    var pages = [];
    for (var p = 0; p < cells.length; p += per) {
      pages.push('<section class="page"><div class="grid">' +
        cells.slice(p, p + per).map(function (c) { return '<div class="cell">' + c + '</div>'; }).join('') +
        '</div></section>');
    }
    if (!pages.length) pages.push('<section class="page"></section>');

    var small = cellH < 25;
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>청구기호 라벨</title><style>' +
      '@page{size:A4 portrait;margin:0}' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#000;background:#e9edf1}' +
      '.page{width:210mm;height:297mm;background:#fff;margin:0 auto 8mm;padding:' + sh.top + 'mm ' + sh.side + 'mm;overflow:hidden;page-break-after:always}' +
      '.grid{display:grid;grid-template-columns:repeat(' + sh.cols + ',' + cellW.toFixed(2) + 'mm);' +
        'grid-auto-rows:' + cellH.toFixed(2) + 'mm;column-gap:' + sh.gapX + 'mm;row-gap:' + sh.gapY + 'mm}' +
      '.cell{padding:' + (small ? '1.2mm 1.6mm' : '2mm 2.4mm') + ';display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden;outline:0.2mm dashed #c9d2da;outline-offset:-0.1mm}' +
      '.lb-code{font-weight:800;font-size:' + (small ? '9pt' : '11.5pt') + ';letter-spacing:.02em;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace}' +
      '.lb-bc{width:100%;margin-top:0.8mm}' +
      '.lb-bc svg{display:block;width:100%;height:' + (small ? '5mm' : '8mm') + '}' +
      '.lb-title{font-size:' + (small ? '5.5pt' : '6.5pt') + ';margin-top:0.8mm;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.lb-ac{font-size:5pt;color:#555;margin-top:0.3mm;white-space:nowrap}' +
      '@media print{body{background:#fff}.page{margin:0}.cell{outline:none}}' +
      '</style></head><body>' + pages.join('') + '</body></html>';
  }

  /* =====================================================================
   * 6. 한/영 보정 — 스캐너가 한글 입력 상태에서 찍었을 때
   * ===================================================================== */

  var KEY = {
    'ㅂ': 'q', 'ㅈ': 'w', 'ㄷ': 'e', 'ㄱ': 'r', 'ㅅ': 't', 'ㅛ': 'y', 'ㅕ': 'u', 'ㅑ': 'i', 'ㅐ': 'o', 'ㅔ': 'p',
    'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd', 'ㄹ': 'f', 'ㅎ': 'g', 'ㅗ': 'h', 'ㅓ': 'j', 'ㅏ': 'k', 'ㅣ': 'l',
    'ㅋ': 'z', 'ㅌ': 'x', 'ㅊ': 'c', 'ㅍ': 'v', 'ㅠ': 'b', 'ㅜ': 'n', 'ㅡ': 'm',
    'ㅃ': 'Q', 'ㅉ': 'W', 'ㄸ': 'E', 'ㄲ': 'R', 'ㅆ': 'T', 'ㅒ': 'O', 'ㅖ': 'P',
    'ㅘ': 'hk', 'ㅙ': 'ho', 'ㅚ': 'hl', 'ㅝ': 'nj', 'ㅞ': 'np', 'ㅟ': 'nl', 'ㅢ': 'ml',
    'ㄳ': 'rt', 'ㄵ': 'sw', 'ㄶ': 'sg', 'ㄺ': 'fr', 'ㄻ': 'fa', 'ㄼ': 'fq', 'ㄽ': 'ft', 'ㄾ': 'fx', 'ㄿ': 'fv', 'ㅀ': 'fg', 'ㅄ': 'qt'
  };
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
              'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  /** 한글 자판으로 들어온 글자를 영문 자판 글자로 되돌립니다 ('ㅣㅍ3-ㄲㅇ-001' → 'lv3-Rd-001') */
  function fixIme(s) {
    s = String(s || '');
    if (!/[ㄱ-ㆎ가-힣]/.test(s)) return s;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), code = s.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        var idx = code - 0xAC00;
        out += KEY[CHO.charAt(Math.floor(idx / 588))] || '';
        out += KEY[JUNG.charAt(Math.floor((idx % 588) / 28))] || '';
        var jong = JONG[idx % 28];
        if (jong) out += KEY[jong] || '';
      } else out += KEY[ch] || ch;
    }
    return out;
  }

  return {
    normIsbn: normIsbn, looksIsbn: looksIsbn,
    lookup: lookup, sources: sources,
    CAT_CODE: CAT_CODE, catCode: catCode, levelNo: levelNo, codePrefix: codePrefix, nextCode: nextCode,
    readText: readText, parseTable: parseTable, parseBooks: parseBooks,
    TEMPLATE_HEAD: TEMPLATE_HEAD, templateRows: templateRows,
    code128: code128, barcodeSvg: barcodeSvg, SHEETS: SHEETS, labelsHtml: labelsHtml,
    fixIme: fixIme
  };
})();
