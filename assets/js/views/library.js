/* ===== 도서 대여 ===== */
window.Views = window.Views || {};
Views.library = (function () {

  var filter = { q: '', category: '', state: 'all' };  // state: all | out | overdue | in

  function title() { return '도서 대여'; }
  function sub() {
    var out = Store.loans({ open: true }).length;
    var over = Store.overdueLoans().length;
    return '보유 ' + Store.books().length + '권 · 대출 중 ' + out + '권' + (over ? ' · 연체 ' + over + '권' : '');
  }

  function visible() {
    return Store.books({ q: filter.q, category: filter.category }).filter(function (b) {
      if (filter.state === 'all') return true;
      var st = Store.bookStatus(b);
      if (filter.state === 'in') return st.key === 'in';
      if (filter.state === 'out') return st.key === 'out' || st.key === 'overdue';
      if (filter.state === 'overdue') return st.key === 'overdue';
      return true;
    });
  }

  /** 표지 이미지 — 없으면 빈 자리 */
  function coverImg(b, cls) {
    if (b && b.cover) {
      return '<img class="' + cls + '" src="' + U.esc(b.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
        'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'' + cls + ' none\'}))">';
    }
    return '<span class="' + cls + ' none"></span>';
  }

  function rows() {
    var list = visible();
    if (!list.length) {
      return '<tr><td colspan="7">' + UI.emptyBox(
        Store.books().length ? '조건에 맞는 책이 없습니다.' : '등록된 도서가 없습니다. [바코드로 등록] · [CSV 일괄 등록] · [+ 도서 등록] 중 편한 방법으로 시작하세요.',
        'book') + '</td></tr>';
    }
    return list.slice(0, 300).map(function (b) {
      var st = Store.bookStatus(b);
      var borrower = st.loan ? Store.student(st.loan.studentId) : null;
      return '<tr data-bid="' + b.id + '">' +
        '<td>' + (b.code ? '<span class="code-chip">' + U.esc(b.code) + '</span>' : '-') + '</td>' +
        '<td class="nm"><div class="bk-cell">' + coverImg(b, 'bk-thumb') +
          '<div>' + U.esc(b.title) +
          (b.series || b.publisher ? '<br><span class="hint">' + U.esc([b.series, b.publisher].filter(Boolean).join(' · ')) + '</span>' : '') +
          '</div></div></td>' +
        '<td>' + U.esc(b.level || '-') + '</td>' +
        '<td>' + U.esc(b.category || '-') + '<br>' +
          '<span class="hint">' + (b.wsUrl ? '워크시트 링크' : b.wsHtml ? '워크시트 등록됨' : '자동 Lv' + Worksheet.levelOf(b)) + '</span></td>' +
        '<td><span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span></td>' +
        '<td>' + (borrower
            ? U.esc(borrower.name) + '<br><span class="hint">~' + U.esc(st.loan.dueDate || '') + '</span>'
            : '-') + '</td>' +
        '<td style="white-space:nowrap">' +
          (st.key === 'in'
            ? '<button class="btn sm primary" data-lend="' + b.id + '">대여</button> '
            : '<button class="btn sm" data-return="' + st.loan.id + '">반납</button> ') +
          '<button class="btn sm ghost" data-ws="' + b.id + '">워크시트</button> ' +
          '<button class="btn sm ghost" data-edit="' + b.id + '">수정</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  /* ---------- 도서 등록 / 수정 ---------- */
  function openBookForm(id) {
    var b = id ? Store.book(id) : null;
    UI.modal({
      title: b ? '도서 수정' : '도서 등록',
      body:
        '<div class="bk-form-top">' +
          '<div id="b-coverbox">' + coverImg(b, 'bk-cover') + '</div>' +
          '<div class="form-grid" style="flex:1">' +
            '<label class="fld full">ISBN <span style="font-weight:400">(책 뒤 바코드를 찍거나 숫자를 넣고 Enter — 나머지 칸이 자동으로 채워집니다)</span>' +
              '<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="b-isbn" inputmode="numeric" value="' + U.esc(b && b.isbn ? b.isbn : '') + '" placeholder="9780064440202" style="flex:1">' +
              '<button class="btn" id="b-lookup" type="button">조회</button></div></label>' +
            '<label class="fld full">제목 *<input type="text" id="b-title" value="' + U.esc(b ? b.title : '') + '" placeholder="Frog and Toad Are Friends"></label>' +
            '<label class="fld">지은이<input type="text" id="b-author" value="' + U.esc(b && b.author ? b.author : '') + '"></label>' +
            '<label class="fld">출판사<input type="text" id="b-pub" value="' + U.esc(b && b.publisher ? b.publisher : '') + '"></label>' +
            '<label class="fld">출판일<input type="text" id="b-pubdate" value="' + U.esc(b && b.pubDate ? b.pubDate : '') + '" placeholder="예: 2019-05-01"></label>' +
            '<label class="fld">레벨<input type="text" id="b-level" value="' + U.esc(b && b.level ? b.level : '') + '" placeholder="예: AR 2.5 / Lexile 450L"></label>' +
            '<label class="fld">분류<select id="b-cat">' + UI.options(Store.BOOK_CATEGORIES, b ? b.category : '', '선택 안 함') + '</select></label>' +
            '<label class="fld">시리즈<input type="text" id="b-series" value="' + U.esc(b && b.series ? b.series : '') + '" placeholder="예: Frog and Toad"></label>' +
            '<label class="fld full">청구기호 <span style="font-weight:400">(비워 두면 레벨·분류로 자동 생성 — 예: Lv3-RD-001)</span>' +
              '<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="b-code" value="' + U.esc(b && b.code ? b.code : '') + '" placeholder="자동" style="flex:1">' +
              '<button class="btn" id="b-autocode" type="button">자동 생성</button></div></label>' +
            '<label class="fld full">메모<input type="text" id="b-note" value="' + U.esc(b && b.note ? b.note : '') + '" placeholder="보관 위치, 상태 등"></label>' +
            '<input type="hidden" id="b-cover" value="' + U.esc(b && b.cover ? b.cover : '') + '">' +
          '</div>' +
        '</div>' +
        '<p class="hint" id="b-lookstate" style="margin:8px 0 0"></p>' +

        '<div class="section-title">워크시트</div>' +
        '<p class="hint" style="margin-top:0">이 책을 빌려줄 때 나갈 독후활동지입니다. ' +
        '<b>등록된 워크시트가 있으면 그것을</b>, 없으면 아래 자료로 <b>자동 생성한 A4 1장</b>을 뽑습니다.</p>' +
        '<div class="form-grid" style="margin-top:12px">' +
          '<label class="fld">워크시트 레벨' +
            '<select id="b-wslv"><option value="">책 정보로 자동 판정</option>' +
              [1, 2, 3, 4, 5].map(function (n) {
                return '<option value="' + n + '"' + (b && +b.wsLevel === n ? ' selected' : '') + '>Level ' + n + ' · ' + Worksheet.LEVELS[n].name + '</option>';
              }).join('') + '</select></label>' +
          '<label class="fld">등록된 워크시트 링크' +
            '<input type="url" id="b-wsurl" value="' + U.esc(b && b.wsUrl ? b.wsUrl : '') + '" placeholder="https://... (PDF · 구글드라이브 등)"></label>' +
          '<label class="fld full">핵심 단어 <span style="font-weight:400">(쉼표로 구분 — 단어 활동에 들어갑니다)</span>' +
            '<input type="text" id="b-wswords" value="' + U.esc(b && b.wsWords ? b.wsWords : '') + '" placeholder="nap, tap, cap, map"></label>' +
          '<label class="fld full">등장인물 <span style="font-weight:400">(쉼표로 구분 — 인물 활동에 들어갑니다)</span>' +
            '<input type="text" id="b-wschars" value="' + U.esc(b && b.wsCharacters ? b.wsCharacters : '') + '" placeholder="Frog, Toad"></label>' +
        '</div>' +
        '<div class="row" style="margin-top:12px">' +
          '<button class="btn" id="b-wsfile">워크시트 파일 등록</button>' +
          '<input type="file" id="b-wsfileinput" accept=".html,.htm,text/html" style="display:none">' +
          '<button class="btn" id="b-wspreview">자동 워크시트 미리보기</button>' +
          '<span class="hint" id="b-wsstate">' +
            (b && b.wsHtml ? '등록된 파일 있음' : (b && b.wsUrl ? '등록된 링크 사용' : '자동 생성')) + '</span>' +
          (b && b.wsHtml ? '<button class="btn danger sm" id="b-wsclear">등록 파일 지우기</button>' : '') +
        '</div>',
      footer: (b ? '<button class="btn danger" id="b-del">삭제</button><div class="sp"></div>' : '') +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="b-save">저장</button>',
      onMount: function (w) {
        var wsHtml = (b && b.wsHtml) || '';
        var $ = function (s) { return w.querySelector(s); };

        function draftBook() {
          return { level: $('#b-level').value.trim(), category: $('#b-cat').value,
                   series: $('#b-series').value.trim(), title: $('#b-title').value.trim(), wsLevel: $('#b-wslv').value };
        }
        $('#b-autocode').addEventListener('click', function () {
          $('#b-code').value = Books.nextCode(draftBook());
        });

        function doLookup() {
          var raw = $('#b-isbn').value.trim();
          var isbn = Books.normIsbn(raw);
          if (!isbn) { $('#b-lookstate').textContent = raw ? 'ISBN 번호가 맞지 않습니다. 10자리 또는 13자리인지 확인해 주세요.' : ''; return; }
          $('#b-isbn').value = isbn;
          var same = Store.booksByIsbn(isbn).filter(function (x) { return !b || x.id !== b.id; });
          $('#b-lookstate').textContent = '도서 정보를 찾는 중…';
          Books.lookup(isbn).then(function (r) {
            if (!w.isConnected) return;
            var note = same.length ? ' · 같은 책이 이미 ' + same.length + '권 있습니다 (한 권 더 등록됩니다)' : '';
            if (!r) {
              $('#b-lookstate').textContent = '도서 정보를 찾지 못했습니다. 제목을 직접 입력해 주세요.' + note;
              return;
            }
            // 이미 적어 둔 칸은 건드리지 않고 빈 칸만 채웁니다
            [['#b-title', r.title], ['#b-author', r.author], ['#b-pub', r.publisher], ['#b-pubdate', r.pubDate]].forEach(function (p) {
              if (!$(p[0]).value.trim() && p[1]) $(p[0]).value = p[1];
            });
            if (r.cover && !$('#b-cover').value) {
              $('#b-cover').value = r.cover;
              $('#b-coverbox').innerHTML = coverImg({ cover: r.cover }, 'bk-cover');
            }
            $('#b-lookstate').textContent = r.source + '에서 정보를 가져왔습니다.' + note;
          });
        }
        $('#b-lookup').addEventListener('click', doLookup);
        $('#b-isbn').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
        });

        w.querySelector('#b-wsfile').addEventListener('click', function () {
          w.querySelector('#b-wsfileinput').click();
        });
        w.querySelector('#b-wsfileinput').addEventListener('change', function (ev) {
          var f = ev.target.files[0];
          ev.target.value = '';
          if (!f) return;
          if (f.size > 500 * 1024) {
            UI.toast('파일이 너무 큽니다(500KB 초과). 링크로 등록해 주세요.', true);
            return;
          }
          var r = new FileReader();
          r.onload = function () {
            wsHtml = String(r.result);
            w.querySelector('#b-wsstate').textContent = '등록된 파일 있음 (' + Math.round(f.size / 1024) + 'KB) · 저장을 눌러 주세요';
          };
          r.readAsText(f);
        });
        var clearBtn = w.querySelector('#b-wsclear');
        if (clearBtn) clearBtn.addEventListener('click', function () {
          wsHtml = '';
          w.querySelector('#b-wsstate').textContent = '자동 생성 · 저장을 눌러 주세요';
          clearBtn.remove();
        });
        w.querySelector('#b-wspreview').addEventListener('click', function () {
          var draft = {
            title: w.querySelector('#b-title').value.trim() || '(제목 없음)',
            author: w.querySelector('#b-author').value.trim(),
            level: w.querySelector('#b-level').value.trim(),
            category: w.querySelector('#b-cat').value,
            series: w.querySelector('#b-series').value.trim(),
            wsLevel: w.querySelector('#b-wslv').value,
            wsWords: w.querySelector('#b-wswords').value.trim(),
            wsCharacters: w.querySelector('#b-wschars').value.trim()
          };
          openSheet(Worksheet.build(draft, null, { date: '' }), draft, null);
        });

        w.querySelector('#b-save').addEventListener('click', function () {
          var t = w.querySelector('#b-title').value.trim();
          if (!t) { UI.toast('제목을 입력해 주세요.', true); return; }
          var code = w.querySelector('#b-code').value.trim();
          if (!code && !b) code = Books.nextCode(draftBook());
          var dup = code ? Store.bookByCode(code) : null;
          if (dup && (!b || dup.id !== b.id)) {
            UI.toast('같은 청구기호를 쓰는 책이 이미 있습니다: ' + dup.title, true);
            return;
          }
          var isbnRaw = w.querySelector('#b-isbn').value.trim();
          Store.saveBook({
            id: b ? b.id : null, title: t, code: code,
            isbn: Books.normIsbn(isbnRaw) || isbnRaw,
            publisher: w.querySelector('#b-pub').value.trim(),
            pubDate: w.querySelector('#b-pubdate').value.trim(),
            cover: w.querySelector('#b-cover').value.trim(),
            level: w.querySelector('#b-level').value.trim(),
            category: w.querySelector('#b-cat').value,
            series: w.querySelector('#b-series').value.trim(),
            author: w.querySelector('#b-author').value.trim(),
            note: w.querySelector('#b-note').value.trim(),
            wsLevel: w.querySelector('#b-wslv').value,
            wsUrl: w.querySelector('#b-wsurl').value.trim(),
            wsWords: w.querySelector('#b-wswords').value.trim(),
            wsCharacters: w.querySelector('#b-wschars').value.trim(),
            wsHtml: wsHtml
          });
          UI.close();
          UI.toast(b ? '수정했습니다.' : '도서를 등록했습니다 · 청구기호 ' + (code || '없음'));
          App.rerender();
        });
        if (b) {
          w.querySelector('#b-del').addEventListener('click', function () {
            UI.close();
            UI.confirm('<b>' + U.esc(b.title) + '</b> 를 목록에서 지울까요?<br>' +
              '<span style="font-size:13px;color:#6b7b8a">지난 대여 기록은 남습니다.</span>',
              function () {
                Store.deleteBook(b.id);
                UI.toast('삭제했습니다.');
                App.rerender();
              }, { danger: true, yes: '삭제' });
          });
        }
      }
    });
  }

  /* ---------- 워크시트 ---------- */
  /** 이 책에 등록된 워크시트가 있는지 */
  function hasRegistered(b) { return !!(b && (b.wsUrl || b.wsHtml)); }

  /**
   * 워크시트를 화면에 띄웁니다.
   * 등록된 링크가 있으면 그 링크를 새 창으로 열고,
   * 등록된 파일이나 자동 생성본은 인쇄 창으로 보여줍니다.
   */
  function issueWorksheet(bookId, studentId, loanId) {
    var b = Store.book(bookId);
    if (!b) return;
    var s = studentId ? Store.student(studentId) : null;

    if (b.wsUrl) {
      window.open(b.wsUrl, '_blank', 'noopener');
      markIssued(loanId);
      return;
    }
    var html = b.wsHtml || Worksheet.build(b, s, { date: U.ymd() });
    openSheet(html, b, s, loanId);
  }

  function markIssued(loanId) {
    if (!loanId) return;
    var l = Store.loans({}).filter(function (x) { return x.id === loanId; })[0];
    if (l && !l.wsIssued) Store.updateLoan(loanId, { wsIssued: U.ymd() });
  }

  /** 워크시트를 iframe 으로 띄우는 창 — 관리 화면 스타일과 섞이지 않습니다 */
  function openSheet(html, b, s, loanId) {
    UI.modal({
      title: '워크시트 · ' + (b ? b.title : ''),
      wide: true,
      body: '<div class="ws-frame"><iframe id="ws-if" title="워크시트 미리보기"></iframe></div>' +
            '<p class="hint" style="margin-top:10px">인쇄 창에서 <b>A4 · 세로 · 배율 100% · 여백 없음 · 배경 그래픽 인쇄 켜기</b>로 뽑으시면 됩니다.</p>',
      footer: '<button class="btn" id="ws-dl">HTML로 저장</button><div class="sp"></div>' +
              '<button class="btn" data-close>닫기</button>' +
              '<button class="btn primary" id="ws-print">인쇄</button>',
      onMount: function (w) {
        var f = w.querySelector('#ws-if');
        f.srcdoc = html;
        w.querySelector('#ws-print').addEventListener('click', function () {
          f.contentWindow.focus();
          f.contentWindow.print();
        });
        w.querySelector('#ws-dl').addEventListener('click', function () {
          U.download(Worksheet.filename(b || { title: 'book' }, s), html, 'text/html');
          UI.toast('워크시트를 내려받았습니다.');
        });
        markIssued(loanId);
      }
    });
  }

  /* ---------- 대여 ---------- */
  function openLend(bookId) {
    var b = Store.book(bookId);
    if (!b) return;
    var list = Store.students({ active: true });
    UI.modal({
      title: '도서 대여',
      body:
        '<p style="margin:0 0 14px"><b>' + U.esc(b.title) + '</b>' +
          (b.level ? ' <span class="tag gray">' + U.esc(b.level) + '</span>' : '') + '</p>' +
        '<div class="form-grid">' +
          '<label class="fld">빌려가는 학생 *<select id="l-stu">' +
            UI.options(list.map(function (s) {
              return { value: s.id, label: s.name + (Store.scheduleOf(s).className ? ' · ' + Store.scheduleOf(s).className : '') };
            }), '', '학생 선택') + '</select></label>' +
          '<label class="fld">반납 예정일<input type="date" id="l-due" value="' + U.daysAgo(-Store.LOAN_DAYS) + '"></label>' +
        '</div>' +
        '<label class="check on" style="margin-top:14px;display:inline-flex">' +
          '<input type="checkbox" id="l-ws" checked>워크시트 같이 뽑기' +
        '</label> <span class="hint">' +
          (hasRegistered(b) ? '이 책에 등록된 워크시트를 씁니다.' : 'Level ' + Worksheet.levelOf(b) + ' 워크시트를 자동으로 만듭니다.') +
        '</span>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="l-save">대여 처리</button>',
      onMount: function (w) {
        w.querySelector('#l-save').addEventListener('click', function () {
          var sid = w.querySelector('#l-stu').value;
          if (!sid) { UI.toast('학생을 선택해 주세요.', true); return; }
          var wantSheet = w.querySelector('#l-ws').checked;
          try {
            var loanId = Store.lendBook(bookId, sid, w.querySelector('#l-due').value);
            UI.close();
            UI.toast('대여 처리했습니다.');
            App.rerender();
            if (wantSheet) issueWorksheet(bookId, sid, loanId);
          } catch (e) {
            UI.toast(e.message, true);
          }
        });
      }
    });
  }

  /* ---------- 청구기호 · ISBN 으로 빠른 대여·반납 ---------- */
  function lendOrReturn(b) {
    var st = Store.bookStatus(b);
    if (st.key === 'in') { openLend(b.id); return; }
    var s = Store.student(st.loan.studentId);
    UI.confirm('<b>' + U.esc(b.title) + '</b> <span class="code-chip">' + U.esc(b.code || '') + '</span><br>' +
      U.esc(s ? s.name : '') + ' 학생이 빌려간 책입니다. 반납 처리할까요?',
      function () {
        Store.returnBook(st.loan.id);
        UI.toast('반납했습니다.');
        App.rerender();
      }, { yes: '반납' });
  }

  /** 같은 ISBN 책이 여러 권일 때 어느 권인지 고릅니다 */
  function pickCopy(list) {
    UI.modal({
      title: '같은 책이 ' + list.length + '권 있습니다',
      body: '<p class="hint" style="margin-top:0">ISBN 은 같은 책이면 모두 같습니다. 책등에 붙은 청구기호를 확인해 골라 주세요.</p>' +
        '<div class="table-wrap"><table class="tbl" style="min-width:auto"><tbody>' +
        list.map(function (b) {
          var st = Store.bookStatus(b), s = st.loan ? Store.student(st.loan.studentId) : null;
          return '<tr><td><span class="code-chip">' + U.esc(b.code || '-') + '</span></td>' +
            '<td class="nm">' + U.esc(b.title) + '</td>' +
            '<td><span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span>' + (s ? ' ' + U.esc(s.name) : '') + '</td>' +
            '<td><button class="btn sm ' + (st.key === 'in' ? 'primary' : '') + '" data-pick="' + b.id + '">' +
              (st.key === 'in' ? '대여' : '반납') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>',
      footer: '<button class="btn" data-close>닫기</button>',
      onMount: function (w) {
        UI.on(w, '[data-pick]', 'click', function (e, btn) {
          var b = Store.book(btn.getAttribute('data-pick'));
          UI.close();
          if (b) lendOrReturn(b);
        });
      }
    });
  }

  function quickScan(raw) {
    var b = Store.bookByCode(raw) || Store.bookByCode(Books.fixIme(raw));
    if (b) { lendOrReturn(b); return; }
    var isbn = Books.normIsbn(raw);
    if (isbn) {
      var list = Store.booksByIsbn(isbn);
      if (list.length === 1) { lendOrReturn(list[0]); return; }
      if (list.length > 1) { pickCopy(list); return; }
      UI.confirm('ISBN <b>' + isbn + '</b> 인 책은 아직 등록되지 않았습니다.<br>지금 등록할까요?',
        function () { openScanRegister(isbn); }, { yes: '등록하기' });
      return;
    }
    UI.toast('"' + raw + '" 인 책을 찾지 못했습니다.', true);
  }

  /* ---------- 바코드(ISBN)로 등록 ---------- */
  // 창을 닫았다 열어도 마지막에 고른 레벨·분류·시리즈를 기억합니다 (시리즈를 연달아 찍을 때 편하도록)
  var scanDefaults = { level: '', category: '', series: '', auto: false };

  function openScanRegister(firstIsbn) {
    var session = [];      // 이번 창에서 등록한 책 id
    var cur = null;        // 지금 확인 중인 책 { isbn, title, author, publisher, pubDate, cover, source, loading }
    var token = 0;

    UI.modal({
      title: '바코드로 도서 등록',
      wide: true,
      body:
        '<p class="hint" style="margin-top:0">USB 바코드 스캐너로 <b>책 뒤표지의 ISBN 바코드</b>를 찍으세요. ' +
          '제목·지은이·출판사·출판일·표지가 자동으로 채워지고, 청구기호도 자동으로 붙습니다. ' +
          '스캐너가 없으면 ISBN 숫자를 입력하고 Enter 를 눌러도 됩니다.</p>' +
        '<input type="text" id="sc-isbn" class="scan-input" inputmode="numeric" autocomplete="off" placeholder="여기를 누른 뒤 바코드를 찍으세요">' +
        '<div class="section-title" style="margin-top:16px">이번에 찍는 책들에 공통으로 넣을 정보</div>' +
        '<div class="form-grid bk-3col">' +
          '<label class="fld">레벨<input type="text" id="sc-level" value="' + U.esc(scanDefaults.level) + '" placeholder="예: AR 2.5"></label>' +
          '<label class="fld">분류<select id="sc-cat">' + UI.options(Store.BOOK_CATEGORIES, scanDefaults.category, '선택 안 함') + '</select></label>' +
          '<label class="fld">시리즈<input type="text" id="sc-series" value="' + U.esc(scanDefaults.series) + '" placeholder="예: Magic Tree House"></label>' +
        '</div>' +
        '<label class="check' + (scanDefaults.auto ? ' on' : '') + '" style="margin-top:12px;display:inline-flex">' +
          '<input type="checkbox" id="sc-auto"' + (scanDefaults.auto ? ' checked' : '') + '>정보를 찾으면 확인 없이 바로 등록 (연속 등록)</label>' +
        '<div id="sc-card" style="margin-top:14px"></div>' +
        '<div id="sc-done" style="margin-top:14px"></div>',
      footer: '<button class="btn" id="sc-labels" disabled>이번에 등록한 책 라벨 출력</button><div class="sp"></div>' +
              '<button class="btn primary" data-close>다 했어요</button>',
      onMount: function (w) {
        var $ = function (s) { return w.querySelector(s); };

        function common() {
          scanDefaults.level = $('#sc-level').value.trim();
          scanDefaults.category = $('#sc-cat').value;
          scanDefaults.series = $('#sc-series').value.trim();
          scanDefaults.auto = $('#sc-auto').checked;
          return scanDefaults;
        }
        function draft() {
          var c = common();
          return { title: cur && cur.title || '', level: c.level, category: c.category, series: c.series };
        }

        function drawCard(msg) {
          var box = $('#sc-card');
          if (!cur) { box.innerHTML = msg ? '<div class="scan-msg">' + msg + '</div>' : ''; return; }
          if (cur.loading) {
            box.innerHTML = '<div class="scan-card"><span class="bk-cover none"></span><div style="flex:1">' +
              '<div class="hint">ISBN ' + cur.isbn + '</div><b>도서 정보를 찾는 중…</b></div></div>';
            return;
          }
          var same = Store.booksByIsbn(cur.isbn).length;
          box.innerHTML =
            '<div class="scan-card">' + coverImg(cur, 'bk-cover') +
              '<div style="flex:1;min-width:0">' +
                '<div class="hint">ISBN ' + cur.isbn + ' · ' + (cur.source ? cur.source + '에서 찾음' : '<b style="color:#a8453f">정보를 찾지 못했습니다 — 제목을 입력해 주세요</b>') +
                  (same ? ' · <b>같은 책 ' + same + '권 보유 중</b> (한 권 더 등록)' : '') + '</div>' +
                '<div class="form-grid" style="margin-top:8px">' +
                  '<label class="fld full">제목 *<input type="text" id="sc-title" value="' + U.esc(cur.title || '') + '"></label>' +
                  '<label class="fld">지은이<input type="text" id="sc-author" value="' + U.esc(cur.author || '') + '"></label>' +
                  '<label class="fld">출판사 · 출판일<input type="text" id="sc-pub" value="' + U.esc([cur.publisher, cur.pubDate].filter(Boolean).join(' · ')) + '" disabled></label>' +
                '</div>' +
                '<div class="row" style="margin-top:10px">' +
                  '<span>청구기호 <span class="code-chip" id="sc-code">' + U.esc(Books.nextCode(draft())) + '</span></span>' +
                  '<div class="sp"></div>' +
                  '<button class="btn" id="sc-skip">건너뛰기</button>' +
                  '<button class="btn primary" id="sc-save">등록 (Enter)</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          $('#sc-title').addEventListener('input', function (e) { cur.title = e.target.value; });
          $('#sc-author').addEventListener('input', function (e) { cur.author = e.target.value; });
          [$('#sc-title'), $('#sc-author')].forEach(function (inp) {
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
          });
          $('#sc-save').addEventListener('click', commit);
          $('#sc-skip').addEventListener('click', function () { cur = null; drawCard('건너뛰었습니다.'); $('#sc-isbn').focus(); });
          if (!cur.title) $('#sc-title').focus();
        }

        function drawDone() {
          $('#sc-labels').disabled = !session.length;
          $('#sc-labels').textContent = session.length ? '이번에 등록한 ' + session.length + '권 라벨 출력' : '이번에 등록한 책 라벨 출력';
          if (!session.length) { $('#sc-done').innerHTML = ''; return; }
          $('#sc-done').innerHTML = '<div class="section-title">이번에 등록한 책 ' + session.length + '권</div>' +
            '<div class="scan-done">' + session.slice().reverse().map(function (id) {
              var b = Store.book(id);
              if (!b) return '';
              return '<div class="scan-done-row"><span class="code-chip">' + U.esc(b.code) + '</span> ' + U.esc(b.title) + '</div>';
            }).join('') + '</div>';
        }

        function commit() {
          if (!cur || cur.loading) return;
          var t = String(cur.title || '').trim();
          if (!t) { UI.toast('제목을 입력해 주세요.', true); if ($('#sc-title')) $('#sc-title').focus(); return; }
          var c = common();
          var rec = { title: t, level: c.level, category: c.category, series: c.series };
          var code = Books.nextCode(rec);
          var id = Store.saveBook({
            title: t, code: code, isbn: cur.isbn,
            author: String(cur.author || '').trim(), publisher: cur.publisher || '', pubDate: cur.pubDate || '',
            cover: cur.cover || '', level: c.level, category: c.category, series: c.series, note: ''
          });
          session.push(id);
          cur = null;
          drawCard('✓ <b>' + U.esc(t) + '</b> 등록 · 청구기호 <span class="code-chip">' + U.esc(code) + '</span> — 다음 책을 찍으세요');
          drawDone();
          $('#sc-isbn').focus();
        }

        function scan(raw) {
          var isbn = Books.normIsbn(raw);
          if (!isbn) {
            cur = null;
            drawCard('<b style="color:#a8453f">"' + U.esc(raw) + '" 는 ISBN 이 아닙니다.</b> 책 뒤표지의 978·979 로 시작하는 바코드를 찍어 주세요.');
            return;
          }
          var my = ++token;
          cur = { isbn: isbn, loading: true };
          drawCard();
          Books.lookup(isbn).then(function (r) {
            if (my !== token || !w.isConnected) return;
            cur = Object.assign({ isbn: isbn }, r || {});
            cur.loading = false;
            if (r && common().auto) { commit(); return; }
            drawCard();
            if (r) $('#sc-save').focus();
          });
        }

        $('#sc-isbn').addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          var v = e.target.value.trim();
          e.target.value = '';
          if (v) scan(v);
        });
        ['#sc-level', '#sc-series'].forEach(function (s) {
          $(s).addEventListener('input', function () { common(); if ($('#sc-code')) $('#sc-code').textContent = Books.nextCode(draft()); });
        });
        $('#sc-cat').addEventListener('change', function () { common(); if ($('#sc-code')) $('#sc-code').textContent = Books.nextCode(draft()); });
        $('#sc-auto').addEventListener('change', function (e) {
          common();
          e.target.parentNode.classList.toggle('on', e.target.checked);
          $('#sc-isbn').focus();
        });
        $('#sc-labels').addEventListener('click', function () {
          var list = session.map(Store.book).filter(Boolean);
          openLabels(list);
        });

        // 창을 닫으면 목록을 새로 그립니다
        var obs = new MutationObserver(function () {
          if (!w.isConnected) { obs.disconnect(); if (session.length) App.rerender(); }
        });
        obs.observe(document.body, { childList: true });

        $('#sc-isbn').focus();
        if (firstIsbn) scan(firstIsbn);
      }
    });
  }

  /* ---------- 라벨 출력 ---------- */
  function openLabels(preset) {
    var today = U.ymd();
    var groups = {
      preset: preset || null,
      visible: visible(),
      today: Store.books().filter(function (b) { return b.addedAt === today; }),
      all: Store.books()
    };
    var def = preset ? 'preset' : 'visible';
    function label(k) {
      var n = groups[k] ? groups[k].length : 0;
      return { preset: '방금 등록한 책', visible: '지금 목록에 보이는 책 (검색·필터 결과)', today: '오늘 등록한 책', all: '모든 책' }[k] + ' · ' + n + '권';
    }

    UI.modal({
      title: '청구기호 라벨 출력',
      wide: true,
      body:
        '<div class="form-grid bk-3col lb-opts">' +
          '<label class="fld">출력할 책<select id="lb-who">' +
            ['preset', 'visible', 'today', 'all'].filter(function (k) { return groups[k]; }).map(function (k) {
              return '<option value="' + k + '"' + (k === def ? ' selected' : '') + '>' + U.esc(label(k)) + '</option>';
            }).join('') + '</select></label>' +
          '<label class="fld">라벨지<select id="lb-sheet">' +
            Object.keys(Books.SHEETS).map(function (k) {
              return '<option value="' + k + '"' + (k === '4x10' ? ' selected' : '') + '>' + Books.SHEETS[k].name + '</option>';
            }).join('') + '</select></label>' +
          '<label class="fld">이미 쓴 칸<input type="number" id="lb-skip" min="0" value="0"></label>' +
        '</div>' +
        '<div class="row" style="margin-top:10px">' +
          '<label class="check on" style="display:inline-flex"><input type="checkbox" id="lb-bc" checked>바코드 넣기</label>' +
          '<label class="check on" style="display:inline-flex"><input type="checkbox" id="lb-title" checked>책 제목 넣기</label>' +
          '<span class="hint" id="lb-info"></span>' +
        '</div>' +
        '<div class="ws-frame" style="margin-top:12px"><iframe id="lb-if" title="라벨 미리보기"></iframe></div>' +
        '<p class="hint" style="margin-top:10px">인쇄 창에서 <b>A4 · 배율 100%(실제 크기) · 여백 없음</b>으로 뽑으세요. ' +
          '라벨지마다 칸 위치가 조금씩 달라서, 처음에는 <b>일반 종이에 한 장 뽑아 라벨지에 겹쳐 비춰 보고</b> 맞는 규격을 고르시길 권합니다. ' +
          '바코드는 청구기호를 담고 있어서, 목록 위의 입력칸에 스캐너로 찍으면 바로 대여·반납이 됩니다.</p>',
      footer: '<button class="btn" data-close>닫기</button><button class="btn primary" id="lb-print">인쇄</button>',
      onMount: function (w) {
        var $ = function (s) { return w.querySelector(s); };
        function list() {
          return (groups[$('#lb-who').value] || []).filter(function (b) { return b.code; });
        }
        function draw() {
          var l = list();
          var all = groups[$('#lb-who').value] || [];
          var sh = Books.SHEETS[$('#lb-sheet').value];
          var skip = Math.max(0, parseInt($('#lb-skip').value, 10) || 0);
          var pages = Math.max(1, Math.ceil((l.length + skip) / (sh.cols * sh.rows)));
          $('#lb-info').textContent = l.length + '장 · A4 ' + pages + '쪽' +
            (all.length > l.length ? ' · 청구기호 없는 ' + (all.length - l.length) + '권은 빠집니다' : '');
          $('#lb-if').srcdoc = Books.labelsHtml(l, {
            sheet: $('#lb-sheet').value, skip: skip,
            barcode: $('#lb-bc').checked, title: $('#lb-title').checked
          });
          $('#lb-print').disabled = !l.length;
        }
        ['#lb-who', '#lb-sheet', '#lb-skip', '#lb-bc', '#lb-title'].forEach(function (s) {
          $(s).addEventListener('change', function (e) {
            if (e.target.type === 'checkbox') e.target.parentNode.classList.toggle('on', e.target.checked);
            draw();
          });
        });
        $('#lb-skip').addEventListener('input', draw);
        $('#lb-print').addEventListener('click', function () {
          var f = $('#lb-if');
          f.contentWindow.focus();
          f.contentWindow.print();
        });
        draw();
      }
    });
  }

  /* ---------- CSV · 엑셀 붙여넣기 일괄 등록 ---------- */
  var CAT_FROM_CODE = {};
  Object.keys(Books.CAT_CODE).forEach(function (k) { CAT_FROM_CODE[Books.CAT_CODE[k].toLowerCase()] = k; });
  function normCategory(c) {
    c = String(c || '').trim();
    return CAT_FROM_CODE[c.toLowerCase()] || c;
  }

  function openBulk() {
    UI.modal({
      title: '도서 일괄 등록 (CSV · 엑셀)',
      wide: true,
      body:
        '<p class="hint" style="margin-top:0">' +
          '① <b>양식 내려받기</b>로 엑셀 양식을 받아 채우고 ② 저장한 CSV 파일을 고르거나, ' +
          '엑셀에서 <b>표를 통째로 복사해 아래 칸에 붙여넣으세요</b>(첫 줄은 열 이름).<br>' +
          '쓸 수 있는 열: <code>' + Books.TEMPLATE_HEAD.join(', ') + '</code> — 순서는 상관없고, 없는 열은 비워 둡니다.<br>' +
          '<b>ISBN만 적어도 됩니다.</b> 제목·지은이·출판사·출판일·표지는 자동으로 찾아 채웁니다.</p>' +
        '<div class="row" style="margin:12px 0">' +
          '<button class="btn" id="bk-file">CSV 파일 선택</button>' +
          '<input type="file" id="bk-fileinput" accept=".csv,.txt,.tsv,text/csv" style="display:none">' +
          '<button class="btn ghost" id="bk-sample">양식 내려받기</button>' +
          '<div class="sp"></div>' +
          '<label class="check on" style="display:inline-flex"><input type="checkbox" id="bk-look" checked>ISBN으로 빈 칸 채우기</label>' +
          '<label class="check on" style="display:inline-flex"><input type="checkbox" id="bk-code" checked>청구기호 자동 생성</label>' +
        '</div>' +
        '<label class="fld">붙여넣기<textarea id="bk-text" style="min-height:130px;font-size:12px;font-family:ui-monospace,Menlo,monospace" ' +
          'placeholder="청구기호,ISBN,제목,지은이,레벨,분류&#10;,9780064440202,Frog and Toad Are Friends,Arnold Lobel,AR 2.9,리더스&#10;,9780679824114,,,AR 2.6,챕터북"></textarea></label>' +
        '<div id="bk-preview" style="margin-top:14px"></div>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="bk-apply" disabled>등록</button>',
      onMount: function (w) {
        var $ = function (s) { return w.querySelector(s); };
        var parsed = [];
        var busy = false;

        /** 등록 전에 각 줄의 상태를 정합니다 */
        function plan() {
          var seen = {};
          parsed.forEach(function (r) {
            r.category = normCategory(r.category);
            r.state = 'ok';
            if (r.isbnBad) r.state = r.title ? 'isbnbad' : 'bad';
            else if (!r.title) r.state = $('#bk-look').checked ? 'lookup' : 'bad';
            if (r.code) {
              var k = r.code.toLowerCase();
              if (Store.bookByCode(r.code) || seen[k]) r.state = 'dup';
              seen[k] = true;
            }
          });
        }

        var STATE = {
          ok: ['ok', '등록'], lookup: ['blue', '조회 후 등록'], dup: ['gray', '청구기호 중복 · 건너뜀'],
          bad: ['bad', '제목 없음 · 건너뜀'], isbnbad: ['warn', 'ISBN 오류 · 제목으로 등록']
        };
        function stateLabel(r) {
          var s = STATE[r.state];
          // 엑셀이 13자리 숫자를 9.78E+12 로 바꿔 버린 경우
          if (r.isbnSci && (r.state === 'bad' || r.state === 'isbnbad')) return [s[0], '엑셀이 ISBN을 9.78E+12 로 바꿈'];
          return s;
        }

        function preview() {
          var text = $('#bk-text').value.trim();
          var box = $('#bk-preview'), btn = $('#bk-apply');
          parsed = [];
          if (!text) { box.innerHTML = ''; btn.disabled = true; btn.textContent = '등록'; return; }
          var res = Books.parseBooks(text);
          if (res.error) {
            box.innerHTML = '<div class="gate-err" style="margin:0">' + U.esc(res.error) + '</div>';
            btn.disabled = true; return;
          }
          parsed = res.rows;
          plan();
          var go = parsed.filter(function (r) { return r.state !== 'dup' && r.state !== 'bad'; }).length;
          var nLook = parsed.filter(function (r) { return r.state === 'lookup'; }).length;
          box.innerHTML =
            (res.unknown.length ? '<div class="hint" style="margin-bottom:6px">모르는 열은 무시합니다: ' + U.esc(res.unknown.join(', ')) + '</div>' : '') +
            '<div class="table-wrap" style="max-height:280px;overflow:auto"><table class="tbl" style="min-width:auto">' +
            '<thead><tr><th>청구기호</th><th>ISBN</th><th>제목</th><th>지은이</th><th>레벨</th><th>분류</th><th>처리</th></tr></thead><tbody>' +
            parsed.slice(0, 200).map(function (r) {
              var s = stateLabel(r);
              return '<tr><td>' + (r.code ? U.esc(r.code) : '<span class="hint">' + ($('#bk-code').checked ? '자동' : '-') + '</span>') + '</td>' +
                '<td>' + U.esc(r.isbn || '-') + '</td>' +
                '<td class="nm">' + (r.title ? U.esc(r.title) : '<span class="hint">(ISBN으로 찾기)</span>') + '</td>' +
                '<td>' + U.esc(r.author || '-') + '</td>' +
                '<td>' + U.esc(r.level || '-') + '</td><td>' + U.esc(r.category || '-') + '</td>' +
                '<td><span class="tag ' + s[0] + '">' + s[1] + '</span></td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="hint" style="margin-top:6px">모두 ' + parsed.length + '줄 · 등록 ' + go + '권' +
              (nLook ? ' (이 중 ' + nLook + '권은 ISBN으로 제목을 찾아서 등록)' : '') +
              (parsed.length > 200 ? ' · 미리보기는 앞 200줄만 보여 줍니다' : '') + '</div>' +
            (parsed.some(function (r) { return r.isbnSci; })
              ? '<div class="gate-err" style="margin:8px 0 0">엑셀이 ISBN 을 <b>9.78E+12</b> 같은 숫자로 바꿔 저장한 줄이 있습니다. ' +
                '엑셀에서 ISBN 열을 선택 → <b>셀 서식 → 텍스트</b>로 바꾼 뒤 번호를 다시 넣어 주세요. (양식 파일은 처음부터 텍스트로 들어 있습니다)</div>'
              : '');
          btn.disabled = !go;
          btn.textContent = go + '권 등록';
        }

        /** ISBN 조회 — 한 번에 3권씩 */
        function fillByIsbn(list, onStep) {
          var i = 0, done = 0;
          return new Promise(function (resolve) {
            if (!list.length) { resolve(); return; }
            function worker() {
              if (i >= list.length) return Promise.resolve();
              var r = list[i++];
              return Books.lookup(r.isbn).then(function (info) {
                if (info) {
                  ['title', 'author', 'publisher', 'pubDate', 'cover'].forEach(function (k) {
                    if (!r[k] && info[k]) r[k] = info[k];
                  });
                }
                onStep(++done, list.length);
                return worker();
              });
            }
            Promise.all([worker(), worker(), worker()]).then(resolve);
          });
        }

        function apply() {
          if (busy) return;
          busy = true;
          var btn = $('#bk-apply');
          btn.disabled = true;
          plan();
          var targets = parsed.filter(function (r) { return r.state !== 'dup' && r.state !== 'bad'; });
          var need = $('#bk-look').checked ? targets.filter(function (r) {
            return r.isbn && !r.isbnBad && (!r.title || !r.author || !r.publisher || !r.cover);
          }) : [];
          fillByIsbn(need, function (n, total) {
            btn.textContent = '도서 정보 찾는 중 ' + n + ' / ' + total;
          }).then(function () {
            var added = 0, failed = [], taken = [];
            var autoCode = $('#bk-code').checked;
            targets.forEach(function (r) {
              if (!r.title) { failed.push(r); return; }
              var code = r.code || (autoCode ? Books.nextCode(r, taken) : '');
              if (code) taken.push(code);
              Store.saveBook({
                title: r.title, code: code, isbn: r.isbnBad ? '' : (r.isbn || ''),
                author: r.author || '', publisher: r.publisher || '', pubDate: r.pubDate || '', cover: r.cover || '',
                level: r.level || '', category: r.category || '', series: r.series || '', note: r.note || ''
              });
              added++;
            });
            var skipped = parsed.length - targets.length;
            busy = false;
            App.rerender();
            if (!failed.length) {
              UI.close();
              UI.toast(added + '권 등록' + (skipped ? ' · ' + skipped + '줄 건너뜀' : ''));
              return;
            }
            // 제목을 끝내 못 찾은 줄은 창에 남겨서 고쳐 넣을 수 있게 합니다
            $('#bk-text').value = U.toCsv([Books.TEMPLATE_HEAD].concat(failed.map(function (r) {
              return [r.code, r.isbn, '', r.author, r.publisher, r.pubDate, r.level, r.category, r.series, r.note];
            })));
            preview();
            $('#bk-preview').insertAdjacentHTML('afterbegin',
              '<div class="gate-err" style="margin:0 0 10px">' + added + '권은 등록했습니다. ' +
              '아래 <b>' + failed.length + '권</b>은 ISBN으로 제목을 찾지 못했습니다. 제목 칸을 채워 다시 등록해 주세요.</div>');
          });
        }

        $('#bk-text').addEventListener('input', preview);
        ['#bk-look', '#bk-code'].forEach(function (s) {
          $(s).addEventListener('change', function (e) { e.target.parentNode.classList.toggle('on', e.target.checked); preview(); });
        });
        $('#bk-file').addEventListener('click', function () { $('#bk-fileinput').click(); });
        $('#bk-fileinput').addEventListener('change', function (e) {
          var f = e.target.files[0];
          e.target.value = '';
          if (!f) return;
          if (/\.xlsx?$/i.test(f.name)) {
            UI.toast('엑셀 파일은 [다른 이름으로 저장 → CSV]로 저장한 뒤 골라 주세요. 표를 복사해 붙여넣어도 됩니다.', true);
            return;
          }
          Books.readText(f).then(function (t) { $('#bk-text').value = t; preview(); })
            .catch(function (err) { UI.toast(err.message, true); });
        });
        $('#bk-sample').addEventListener('click', function () {
          U.download('도서등록_양식.csv', U.toCsv(Books.templateRows()), 'text/csv');
        });
        $('#bk-apply').addEventListener('click', apply);
      }
    });
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    var all = Store.books();
    var open = Store.loans({ open: true });
    var over = Store.overdueLoans();

    el.innerHTML =
      '<div class="grid g-4" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">보유 도서</div><div class="val">' + U.num(all.length) + '<small>권</small></div>' +
          '<div class="sub">대출 가능 ' + (all.length - open.length) + '권</div></div>' +
        '<div class="stat"><div class="lbl">대출 중</div><div class="val">' + open.length + '<small>권</small></div></div>' +
        '<div class="stat"><div class="lbl">연체</div><div class="val" style="color:' + (over.length ? '#a8453f' : 'inherit') + '">' +
          over.length + '<small>권</small></div>' +
          '<div class="sub">' + (over.length ? '반납 안내가 필요합니다' : '연체 없음') + '</div></div>' +
        '<div class="stat"><div class="lbl">이달 대출</div><div class="val">' +
          Store.loans().filter(function (l) { return (l.outDate || '').slice(0, 7) === U.ym(new Date()); }).length +
          '<small>건</small></div></div>' +
      '</div>' +

      (over.length ?
        '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>연체 도서</h2><div class="sp"></div>' +
          '<span class="tag bad">' + over.length + '권</span></div><div class="card-b tight">' +
          over.map(function (l) {
            var b = Store.book(l.bookId), s = Store.student(l.studentId);
            return '<div class="memo-item"><div class="txt"><b>' + U.esc(s ? s.name : '') + '</b> · ' +
              U.esc(b ? b.title : '(삭제된 책)') +
              '<br><span style="font-size:12px;color:#6b7b8a">반납 예정 ' + U.esc(l.dueDate) +
              ' · ' + U.dayDiff(l.dueDate, U.ymd()) + '일 지남</span></div>' +
              '<button class="btn sm" data-return="' + l.id + '">반납</button></div>';
          }).join('') +
        '</div></div>' : '') +

      '<div class="card">' +
        '<div class="card-h bk-head"><h2>도서 목록</h2><div class="sp"></div>' +
          '<button class="btn" id="csv">목록 CSV</button>' +
          '<button class="btn" id="labels">라벨 출력</button>' +
          '<button class="btn" id="bulk">CSV 일괄 등록</button>' +
          '<button class="btn" id="add">+ 직접 등록</button>' +
          '<button class="btn primary" id="scanadd">바코드로 등록</button></div>' +
        '<div class="card-b" style="padding-bottom:8px">' +
          '<div class="row">' +
            '<input type="search" id="q" placeholder="제목 · 지은이 · 청구기호 · ISBN · 출판사 검색" value="' + U.esc(filter.q) + '" style="flex:1;min-width:180px">' +
            '<select id="f-cat" style="width:130px">' + UI.options(Store.BOOK_CATEGORIES, filter.category, '전체 분류') + '</select>' +
            '<div class="seg">' +
              '<button data-state="all" class="' + (filter.state === 'all' ? 'on' : '') + '">전체</button>' +
              '<button data-state="in" class="' + (filter.state === 'in' ? 'on' : '') + '">대출 가능</button>' +
              '<button data-state="out" class="' + (filter.state === 'out' ? 'on' : '') + '">대출 중</button>' +
              '<button data-state="overdue" class="' + (filter.state === 'overdue' ? 'on' : '') + '">연체</button>' +
            '</div>' +
          '</div>' +
          '<div class="row" style="margin-top:10px">' +
            '<input type="text" id="scan" autocomplete="off" placeholder="대여·반납: 책등 라벨(청구기호)이나 ISBN 바코드를 찍으세요 — 빌려주기 · 반납이 바로 됩니다" style="flex:1;min-width:220px">' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>청구기호</th><th>제목</th><th>레벨</th><th>분류</th><th>상태</th><th>대출자</th><th></th></tr></thead>' +
          '<tbody id="rows">' + rows() + '</tbody>' +
        '</table></div>' +
      '</div>';

    function refresh() { render(el); }

    el.querySelector('#add').addEventListener('click', function () { openBookForm(null); });
    el.querySelector('#scanadd').addEventListener('click', function () { openScanRegister(); });
    el.querySelector('#labels').addEventListener('click', function () { openLabels(); });
    el.querySelector('#bulk').addEventListener('click', openBulk);
    el.querySelector('#q').addEventListener('input', function (e) {
      filter.q = e.target.value;
      el.querySelector('#rows').innerHTML = rows();
    });
    el.querySelector('#f-cat').addEventListener('change', function (e) { filter.category = e.target.value; refresh(); });
    UI.on(el, '[data-state]', 'click', function (e, b) { filter.state = b.getAttribute('data-state'); refresh(); });

    el.querySelector('#scan').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = e.target.value.trim();
      if (!code) return;
      e.target.value = '';
      quickScan(code);
    });

    UI.on(el, '[data-lend]', 'click', function (e, b) { openLend(b.getAttribute('data-lend')); });
    UI.on(el, '[data-ws]', 'click', function (e, b) {
      var id = b.getAttribute('data-ws');
      var st = Store.bookStatus(Store.book(id));
      issueWorksheet(id, st.loan ? st.loan.studentId : '', st.loan ? st.loan.id : '');
    });
    UI.on(el, '[data-edit]', 'click', function (e, b) { openBookForm(b.getAttribute('data-edit')); });
    UI.on(el, '[data-return]', 'click', function (e, b) {
      Store.returnBook(b.getAttribute('data-return'));
      UI.toast('반납했습니다.');
      refresh();
    });

    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['청구기호', 'ISBN', '제목', '지은이', '출판사', '출판일', '레벨', '분류', '시리즈', '메모', '상태', '대출자', '반납예정일'];
      var body = visible().map(function (b) {
        var st = Store.bookStatus(b);
        var s = st.loan ? Store.student(st.loan.studentId) : null;
        // ISBN 은 엑셀에서 9.78E+12 로 바뀌지 않도록 글자로 적습니다 (다시 일괄 등록에 넣어도 그대로 읽힙니다)
        return [b.code, b.isbn ? '="' + b.isbn + '"' : '', b.title, b.author, b.publisher, b.pubDate, b.level, b.category, b.series, b.note,
                st.label, s ? s.name : '', st.loan ? st.loan.dueDate : ''];
      });
      U.download('고래영어_도서목록_' + U.ymd() + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  return { title: title, sub: sub, render: render };
})();
