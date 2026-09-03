/* ===== 북리포트 워크시트 자동 생성 =====
 * 도서 정보와 학생 정보를 받아 A4 세로 1장짜리 영어 워크시트를 만듭니다.
 * 규칙
 *  - 워크시트 안의 글자는 모두 영어입니다.
 *  - 책 내용은 지어내지 않습니다. 등록된 단어·등장인물이 없으면 학생이 채우는 빈칸으로 둡니다.
 *  - 레벨은 시리즈 표기 → AR/Lexile → 분류 순으로 판정합니다.
 */
var Worksheet = (function () {

  var LEVELS = {
    1: { name: 'Phonics / Emergent' },
    2: { name: 'Early Reader' },
    3: { name: 'Beginning Reader' },
    4: { name: 'Developing Reader' },
    5: { name: 'Fluent / Chapter' }
  };

  /** 자주 쓰는 고빈도어 — 책 내용이 아니라 공용 목록이라 그대로 써도 됩니다 */
  var SIGHT_WORDS = {
    1: ['the', 'is', 'you', 'and', 'can', 'see', 'go', 'my'],
    2: ['they', 'said', 'have', 'like', 'was', 'with', 'this', 'what']
  };

  /** 분류 한글 이름 -> 워크시트에 찍을 영어 이름 */
  var CATEGORY_EN = {
    '리더스': 'Readers', '챕터북': 'Chapter Book', '노블': 'Novel',
    '논픽션': 'Non-fiction', '그림책': 'Picture Book', '워크북': 'Workbook'
  };

  function clamp(n) { return Math.max(1, Math.min(5, n)); }

  /** AR 점수 → 레벨 */
  function fromAr(ar) {
    if (ar < 1.0) return 1;
    if (ar < 1.5) return 2;
    if (ar < 2.2) return 3;
    if (ar < 3.0) return 4;
    return 5;
  }
  /** Lexile → 레벨 */
  function fromLexile(lx) {
    if (lx <= 200) return 1;
    if (lx <= 350) return 2;
    if (lx <= 500) return 3;
    if (lx <= 650) return 4;
    return 5;
  }
  /** 시리즈 표기 → 레벨 */
  function fromSeries(text) {
    var t = String(text || '').toLowerCase();
    var m;
    if (/ladybird|phonics/.test(t)) {
      m = t.match(/(\d)/);
      var n = m ? +m[1] : 2;
      return n <= 2 ? 1 : 2;
    }
    if (/step into reading|step-into-reading/.test(t)) {
      m = t.match(/(\d)/);
      return m ? clamp(+m[1] + 1) : 3;
    }
    if (/i can read/.test(t)) {
      m = t.match(/(\d)/);
      return m ? clamp(+m[1] + 2) : 3;
    }
    if (/young readers|pyr/.test(t)) {
      m = t.match(/(\d)/);
      return m ? clamp(+m[1] + 1) : 2;
    }
    if (/oxford reading tree|ort/.test(t)) {
      m = t.match(/(\d+)/);
      if (!m) return 3;
      var v = +m[1];
      return v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : 4;
    }
    return 0;
  }

  /**
   * 책의 레벨 판정.
   * 선생님이 직접 정한 값(wsLevel)이 있으면 그것을 씁니다.
   * 여러 근거가 엇갈리면 낮은 쪽을 택합니다 — 쉬운 워크시트가 어려운 것보다 낫습니다.
   */
  function levelOf(b) {
    if (b && b.wsLevel) return clamp(+b.wsLevel);
    var found = [];
    var text = [b && b.level, b && b.series, b && b.title].join(' ');

    var s = fromSeries(text);
    if (s) found.push(s);

    var ar = String(b && b.level || '').match(/ar\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (ar) found.push(fromAr(parseFloat(ar[1])));

    var lx = String(b && b.level || '').match(/([0-9]{2,4})\s*L/i);
    if (lx) found.push(fromLexile(parseInt(lx[1], 10)));

    if (!found.length) {
      var cat = { '그림책': 2, '리더스': 3, '챕터북': 4, '노블': 5, '논픽션': 4, '워크북': 3 };
      found.push(cat[b && b.category] || 3);
    }
    return clamp(Math.min.apply(null, found));
  }

  /* ---------- 작은 조각들 ---------- */
  function e(s) { return U.esc(s); }
  function lines(n, size, guide) {
    var cls = 'lines' + (guide ? ' guide' : '') + ' ' + (size || 'mid');
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="ln"></div>';
    return '<div class="' + cls + '">' + out + '</div>';
  }
  function act(n, title, hint, body, grow) {
    return '<section class="act"' + (grow ? ' style="display:flex;flex-direction:column;flex:1"' : '') + '>' +
      '<div class="act-h"><span class="n">' + n + '</span><h3>' + e(title) + '</h3>' +
      '<span class="hint">' + e(hint) + '</span></div>' + body + '</section>';
  }
  function star() {
    return '<span class="star"><svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95L12 2.6Z" stroke-linejoin="round"/></svg></span>';
  }
  function rate(question) {
    return '<div class="rate"><div class="stars">' + star() + star() + star() + star() + star() + '</div>' +
      '<span class="q">' + e(question) + '</span></div>' +
      '<div class="lines slim" style="margin-top:1.4mm"><div class="ln"></div></div>';
  }
  function drawWrite(rows, size, guide) {
    return '<div class="split" style="flex:1">' +
      '<div><div class="drawbox"><span>Draw here</span></div></div>' +
      '<div><div class="lines fill' + (guide ? ' guide' : '') + ' ' + size + '">' +
        new Array(rows + 1).join('<div class="ln"></div>') + '</div></div></div>';
  }
  function wordTable(words, mode) {
    var head = mode === 'meaning'
      ? '<tr><th>Word</th><th>Meaning</th><th>My Own Sentence</th></tr>'
      : '<tr><th>Word</th><th>Write</th><th>Draw</th></tr>';
    var rows = '';
    var n = mode === 'meaning' ? 3 : Math.max(3, Math.min(5, words.length || 4));
    for (var i = 0; i < n; i++) {
      // 선생님이 등록한 단어가 있으면 채우고, 없으면 학생이 쓰도록 비워 둡니다.
      rows += '<tr><td class="w">' + e(words[i] || '') + '</td><td class="p"></td><td class="d"></td></tr>';
    }
    return '<table class="wtable"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }
  function chips(list) {
    return '<div class="chips">' + list.map(function (w) {
      return '<span class="chip">' + e(w) + '</span>';
    }).join('') + '</div>';
  }
  function match(names) {
    // 오른쪽 열은 순서를 섞습니다.
    var left = names.slice(0, 4);
    var right = left.slice().reverse();
    function col(items, cls) {
      return '<div class="mcol' + (cls ? ' ' + cls : '') + '">' + items.map(function (x) {
        return '<div class="mrow"><span>' + e(x || '') + '</span><span class="mdot"></span></div>';
      }).join('') + '</div>';
    }
    if (!left.length) {
      // 등록된 등장인물이 없으면 학생이 직접 적는 빈칸으로 둡니다.
      left = ['', '', '', ''];
      right = ['', '', '', ''];
    }
    return '<div class="match">' + col(left) + col(right, 'right') + '</div>';
  }
  function fields(items) {
    return '<div class="lv">' + items.map(function (k) {
      return '<div class="lvrow"><span class="k">' + e(k) + '</span><span class="sp"></span></div>';
    }).join('') + '</div>';
  }
  function storymap() {
    return '<div class="map">' +
      [['Beginning', ''], ['Middle', 'b'], ['End', 'c']].map(function (c) {
        return '<div class="mapcell"><div class="cap' + (c[1] ? ' ' + c[1] : '') + '">' + c[0] + '</div>' +
          '<div class="drawbox" style="min-height:13mm"></div>' +
          '<div class="lines slim" style="margin-top:1.4mm"><div class="ln"></div></div></div>';
      }).join('') + '</div>';
  }

  /* ---------- 레벨별 활동 ---------- */
  function activities(lv, words, chars) {
    switch (lv) {
      case 1: return [
        act(1, 'Story Words I Learn', 'Trace, write, then draw.', wordTable(words, 'draw')),
        act(2, 'Sight Words I Can Read', 'Circle the ones you read on your own.', chips(SIGHT_WORDS[1])),
        act(3, 'My Favourite Part', 'Draw it, then write one sentence.', drawWrite(2, 'tall', true), true),
        act(4, 'How Was This Book?', 'Colour the stars.', rate('Why?'))
      ];
      case 2: return [
        act(1, 'Match the Characters', 'Draw a line to match.', match(chars)),
        act(2, 'New Words I Learned', 'Write the word, then draw it.', wordTable(words.slice(0, 3), 'draw')),
        act(3, 'My Favourite Part', 'Draw and write.', drawWrite(2, 'tall', true), true),
        act(4, 'My Rating', 'Colour the stars.', rate('Why?'))
      ];
      case 3: return [
        act(1, 'Meet the Characters', 'Name them and add one describing word.',
          fields(['Main character', 'One word to describe', 'Another character', 'One word to describe'])),
        act(2, 'Sequencing the Story', 'What happened first, next and last?', storymap()),
        act(3, 'My Favourite Part', 'Draw it and tell why you like it.', drawWrite(2, 'mid', false), true),
        act(4, 'Word of the Day', 'Find a new word and use it in your own sentence.', lines(1, 'mid')),
        act(5, 'Would You Tell a Friend to Read It?', 'Colour the stars and say why.', rate('Why?'))
      ];
      case 4: return [
        act(1, 'Character Recall', 'Who are they and how do they feel?',
          fields(['Character', 'How they feel', 'Why they feel that way'])),
        act(2, 'Problem & Solution', 'What went wrong, and how was it fixed?', lines(3, 'mid')),
        act(3, 'New Words I Learned', 'Write the meaning in your own words.', wordTable(words, 'meaning')),
        act(4, 'My Favourite Part', 'Draw it and explain your choice.', drawWrite(1, 'mid', false), true),
        act(5, 'The Lesson of This Book', 'Colour the stars and tell why.', rate('Why?'))
      ];
      default: return [
        act(1, 'Summary', 'Somebody... wanted... but... so... then...', lines(4, 'slim')),
        act(2, 'Character Study', 'Give one detail from the book as proof.',
          fields(['Character', 'Trait', 'Proof from the book'])),
        act(3, 'Three New Words', 'Word, meaning, and my own sentence.', wordTable(words, 'meaning')),
        act(4, 'Theme & My Opinion', 'What is the most important idea? Do you agree?', lines(3, 'slim')),
        act(5, 'My Recommendation', 'Colour the stars and give your reason.', rate('Why?'))
      ];
    }
  }

  function splitList(text) {
    return String(text || '').split(/[,\n]/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  /** 책 표지 자리 */
  function coverBlock(b) {
    return b && b.wsCover
      ? '<div class="cover"><img src="' + e(b.wsCover) + '" alt=""></div>'
      : '<div class="cover"><span class="ph">BOOK<br>COVER</span></div>';
  }

  /**
   * 워크시트 전체 HTML (파일 하나로 완결).
   * @param {object} b 도서
   * @param {object} s 학생 (없으면 이름 칸을 비웁니다)
   */
  function build(b, s, opts) {
    opts = opts || {};
    var lv = levelOf(b);
    var words = splitList(b.wsWords);
    var chars = splitList(b.wsCharacters);
    var ac = Store.get().academy;

    var tags = [];
    if (b.series) tags.push('<span class="tag">' + e(b.series) + '</span>');
    if (b.level) tags.push('<span class="tag plain">' + e(b.level) + '</span>');
    // 워크시트 안은 영어만 씁니다. 영어 이름이 없는 분류는 아예 넣지 않습니다.
    if (b.category && CATEGORY_EN[b.category]) {
      tags.push('<span class="tag plain">' + e(CATEGORY_EN[b.category]) + '</span>');
    }
    if (!tags.length) tags.push('<span class="tag plain">Reading Log</span>');

    var body =
      '<div class="sheet"><div class="sheet-inner">' +
        '<header class="ws-head">' +
          '<div class="ws-title"><div class="eyebrow">My Reading Record</div><h1>Book Report</h1></div>' +
          '<div class="ws-level"><div class="lv-k">Level</div><div class="lv-n">' + lv + '</div>' +
            '<div class="lv-t">' + e(LEVELS[lv].name) + '</div></div>' +
        '</header>' +

        '<div class="ws-student">' +
          '<div class="fillfield"><span class="k">Name</span><span class="v">' + e(s ? s.name : '') + '</span></div>' +
          '<div class="fillfield" style="max-width:52mm"><span class="k">Date</span>' +
            '<span class="v">' + e(opts.date || '') + '</span></div>' +
        '</div>' +

        '<div class="ws-book">' + coverBlock(b) +
          '<div class="bookmeta">' +
            '<div class="bt">' + e(b.title) + '</div>' +
            '<div class="by">' + (b.author ? 'Written by ' + e(b.author) : 'Written by ______________') + '</div>' +
            '<div class="tags">' + tags.join('') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="acts">' + activities(lv, words, chars).join('') + '</div>' +

        '<div class="footwrap">' +
          '<div class="ws-foot">' +
            '<div class="tcomment"><span class="k">Teacher&rsquo;s Comment</span></div>' +
            '<div class="stamp">WELL<br>DONE</div>' +
          '</div>' +
          '<div class="brandline">' + e((ac.enName || 'GORAE ENGLISH').toUpperCase()) + ' &middot; READING LOG</div>' +
        '</div>' +
      '</div></div>';

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Book Report — ' + e(b.title) + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,600&family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap">' +
      '<style>' + WORKSHEET_CSS + '</style></head><body>' + body + '</body></html>';
  }

  /** 파일 이름 (책 제목 + 학생) */
  function filename(b, s) {
    var t = String(b.title || 'book').replace(/[^\w가-힣 -]/g, '').trim().slice(0, 40);
    return 'BookReport_' + t.replace(/\s+/g, '_') + (s ? '_' + s.name : '') + '.html';
  }

  return { build: build, levelOf: levelOf, LEVELS: LEVELS, filename: filename, splitList: splitList };
})();
