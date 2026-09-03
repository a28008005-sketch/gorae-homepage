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

  function rows() {
    var list = visible();
    if (!list.length) {
      return '<tr><td colspan="7">' + UI.emptyBox(
        Store.books().length ? '조건에 맞는 책이 없습니다.' : '등록된 도서가 없습니다. [+ 도서 등록] 또는 [CSV 일괄 등록]으로 시작하세요.',
        '📚') + '</td></tr>';
    }
    return list.slice(0, 300).map(function (b) {
      var st = Store.bookStatus(b);
      var borrower = st.loan ? Store.student(st.loan.studentId) : null;
      return '<tr data-bid="' + b.id + '">' +
        '<td>' + (b.code ? '<span class="code-chip">' + U.esc(b.code) + '</span>' : '-') + '</td>' +
        '<td class="nm">' + U.esc(b.title) +
          (b.series ? '<br><span class="hint">' + U.esc(b.series) + '</span>' : '') + '</td>' +
        '<td>' + U.esc(b.level || '-') + '</td>' +
        '<td>' + U.esc(b.category || '-') + '</td>' +
        '<td><span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span></td>' +
        '<td>' + (borrower
            ? U.esc(borrower.name) + '<br><span class="hint">~' + U.esc(st.loan.dueDate || '') + '</span>'
            : '-') + '</td>' +
        '<td style="white-space:nowrap">' +
          (st.key === 'in'
            ? '<button class="btn sm primary" data-lend="' + b.id + '">대여</button> '
            : '<button class="btn sm" data-return="' + st.loan.id + '">반납</button> ') +
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
        '<div class="form-grid">' +
          '<label class="fld full">제목 *<input type="text" id="b-title" value="' + U.esc(b ? b.title : '') + '" placeholder="Frog and Toad Are Friends"></label>' +
          '<label class="fld">청구기호 · 바코드<input type="text" id="b-code" value="' + U.esc(b && b.code ? b.code : '') + '" placeholder="예: RD-0412"></label>' +
          '<label class="fld">레벨<input type="text" id="b-level" value="' + U.esc(b && b.level ? b.level : '') + '" placeholder="예: AR 2.5 / Lexile 450L"></label>' +
          '<label class="fld">분류<select id="b-cat">' + UI.options(Store.BOOK_CATEGORIES, b ? b.category : '', '선택 안 함') + '</select></label>' +
          '<label class="fld">시리즈<input type="text" id="b-series" value="' + U.esc(b && b.series ? b.series : '') + '" placeholder="예: Frog and Toad"></label>' +
          '<label class="fld full">지은이<input type="text" id="b-author" value="' + U.esc(b && b.author ? b.author : '') + '"></label>' +
          '<label class="fld full">메모<input type="text" id="b-note" value="' + U.esc(b && b.note ? b.note : '') + '" placeholder="보관 위치, 상태 등"></label>' +
        '</div>',
      footer: (b ? '<button class="btn danger" id="b-del">삭제</button><div class="sp"></div>' : '') +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="b-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#b-save').addEventListener('click', function () {
          var t = w.querySelector('#b-title').value.trim();
          if (!t) { UI.toast('제목을 입력해 주세요.', true); return; }
          var code = w.querySelector('#b-code').value.trim();
          var dup = code ? Store.bookByCode(code) : null;
          if (dup && (!b || dup.id !== b.id)) {
            UI.toast('같은 청구기호를 쓰는 책이 이미 있습니다: ' + dup.title, true);
            return;
          }
          Store.saveBook({
            id: b ? b.id : null, title: t, code: code,
            level: w.querySelector('#b-level').value.trim(),
            category: w.querySelector('#b-cat').value,
            series: w.querySelector('#b-series').value.trim(),
            author: w.querySelector('#b-author').value.trim(),
            note: w.querySelector('#b-note').value.trim()
          });
          UI.close();
          UI.toast(b ? '수정했습니다.' : '도서를 등록했습니다.');
          App.rerender();
        });
        if (b) {
          w.querySelector('#b-del').addEventListener('click', function () {
            UI.close();
            UI.confirm('<b>' + U.esc(b.title) + '</b> 를 목록에서 지울까요?<br>' +
              '<span style="font-size:13px;color:#63778a">지난 대여 기록은 남습니다.</span>',
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
        '</div>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="l-save">대여 처리</button>',
      onMount: function (w) {
        w.querySelector('#l-save').addEventListener('click', function () {
          var sid = w.querySelector('#l-stu').value;
          if (!sid) { UI.toast('학생을 선택해 주세요.', true); return; }
          try {
            Store.lendBook(bookId, sid, w.querySelector('#l-due').value);
            UI.close();
            UI.toast('대여 처리했습니다.');
            App.rerender();
          } catch (e) {
            UI.toast(e.message, true);
          }
        });
      }
    });
  }

  /* ---------- 청구기호로 빠른 대여·반납 ---------- */
  function quickScan(code, el) {
    var b = Store.bookByCode(code);
    if (!b) { UI.toast('청구기호 "' + code + '" 인 책을 찾지 못했습니다.', true); return; }
    var st = Store.bookStatus(b);
    if (st.key === 'in') openLend(b.id);
    else {
      var s = Store.student(st.loan.studentId);
      UI.confirm('<b>' + U.esc(b.title) + '</b><br>' +
        U.esc(s ? s.name : '') + ' 학생이 빌려간 책입니다. 반납 처리할까요?',
        function () {
          Store.returnBook(st.loan.id);
          UI.toast('반납했습니다.');
          App.rerender();
        }, { yes: '반납' });
    }
  }

  /* ---------- CSV 일괄 등록 ---------- */
  function openBulk() {
    UI.modal({
      title: '도서 CSV 일괄 등록',
      wide: true,
      body:
        '<p class="hint" style="margin-top:0">첫 줄은 열 이름이어야 합니다. 쓸 수 있는 열 이름은 다음과 같고, 순서는 상관없습니다.</p>' +
        '<p class="hint"><code>청구기호, 제목, 지은이, 레벨, 분류, 시리즈, 메모</code></p>' +
        '<div class="row" style="margin:12px 0">' +
          '<button class="btn" id="bk-file">CSV 파일 선택</button>' +
          '<input type="file" id="bk-fileinput" accept=".csv,.txt,text/csv" style="display:none">' +
          '<button class="btn ghost" id="bk-sample">예시 내려받기</button>' +
        '</div>' +
        '<label class="fld">붙여넣기<textarea id="bk-text" style="min-height:140px;font-size:12px;font-family:ui-monospace,Menlo,monospace" ' +
          'placeholder="청구기호,제목,지은이,레벨,분류,시리즈&#10;RD-0412,Frog and Toad Are Friends,Arnold Lobel,AR 2.5,리더스,Frog and Toad"></textarea></label>' +
        '<div id="bk-preview" style="margin-top:14px"></div>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="bk-apply" disabled>등록</button>',
      onMount: function (w) {
        var parsed = [];
        var MAP = {
          '청구기호': 'code', '바코드': 'code', 'code': 'code',
          '제목': 'title', 'title': 'title',
          '지은이': 'author', '저자': 'author', 'author': 'author',
          '레벨': 'level', 'level': 'level', 'ar': 'level',
          '분류': 'category', 'category': 'category',
          '시리즈': 'series', 'series': 'series',
          '메모': 'note', 'note': 'note'
        };
        function preview() {
          var text = w.querySelector('#bk-text').value.trim();
          var box = w.querySelector('#bk-preview'), btn = w.querySelector('#bk-apply');
          parsed = [];
          if (!text) { box.innerHTML = ''; btn.disabled = true; return; }
          var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
          if (lines.length < 2) {
            box.innerHTML = '<div class="gate-err" style="margin:0">열 이름 줄과 자료 줄이 모두 필요합니다.</div>';
            btn.disabled = true; return;
          }
          var head = lines[0].split(',').map(function (h) {
            var k = h.trim().toLowerCase();
            return MAP[h.trim()] || MAP[k] || k;
          });
          lines.slice(1).forEach(function (line) {
            var cells = line.split(',');
            var row = {};
            head.forEach(function (h, i) { row[h] = (cells[i] || '').trim(); });
            if (row.title) parsed.push(row);
          });
          if (!parsed.length) {
            box.innerHTML = '<div class="gate-err" style="margin:0">제목 열을 찾지 못했습니다.</div>';
            btn.disabled = true; return;
          }
          box.innerHTML = '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
            '<thead><tr><th>청구기호</th><th>제목</th><th>레벨</th><th>분류</th></tr></thead><tbody>' +
            parsed.slice(0, 10).map(function (r) {
              return '<tr><td>' + U.esc(r.code || '-') + '</td><td class="nm">' + U.esc(r.title) + '</td>' +
                '<td>' + U.esc(r.level || '-') + '</td><td>' + U.esc(r.category || '-') + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="hint" style="margin-top:6px">모두 ' + parsed.length + '권</div>';
          btn.disabled = false;
          btn.textContent = parsed.length + '권 등록';
        }
        w.querySelector('#bk-text').addEventListener('input', preview);
        w.querySelector('#bk-file').addEventListener('click', function () { w.querySelector('#bk-fileinput').click(); });
        w.querySelector('#bk-fileinput').addEventListener('change', function (e) {
          var f = e.target.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () { w.querySelector('#bk-text').value = r.result; preview(); };
          r.readAsText(f);
          e.target.value = '';
        });
        w.querySelector('#bk-sample').addEventListener('click', function () {
          U.download('도서목록_양식.csv', U.toCsv([
            ['청구기호', '제목', '지은이', '레벨', '분류', '시리즈'],
            ['RD-0412', 'Frog and Toad Are Friends', 'Arnold Lobel', 'AR 2.5', '리더스', 'Frog and Toad'],
            ['CB-0117', 'Magic Tree House #1', 'Mary Pope Osborne', 'AR 3.4', '챕터북', 'Magic Tree House']
          ]), 'text/csv');
        });
        w.querySelector('#bk-apply').addEventListener('click', function () {
          var added = 0, skipped = 0;
          parsed.forEach(function (r) {
            if (r.code && Store.bookByCode(r.code)) { skipped++; return; }
            Store.saveBook({
              title: r.title, code: r.code || '', author: r.author || '',
              level: r.level || '', category: r.category || '', series: r.series || '', note: r.note || ''
            });
            added++;
          });
          UI.close();
          UI.toast(added + '권 등록' + (skipped ? ' · 청구기호 중복 ' + skipped + '권 건너뜀' : ''));
          App.rerender();
        });
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
        '<div class="stat"><div class="lbl">연체</div><div class="val" style="color:' + (over.length ? '#d5453f' : 'inherit') + '">' +
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
              '<br><span style="font-size:12px;color:#63778a">반납 예정 ' + U.esc(l.dueDate) +
              ' · ' + U.dayDiff(l.dueDate, U.ymd()) + '일 지남</span></div>' +
              '<button class="btn sm" data-return="' + l.id + '">반납</button></div>';
          }).join('') +
        '</div></div>' : '') +

      '<div class="card">' +
        '<div class="card-h"><h2>도서 목록</h2><div class="sp"></div>' +
          '<button class="btn" id="bulk">CSV 일괄 등록</button>' +
          '<button class="btn" id="csv">목록 CSV</button>' +
          '<button class="btn primary" id="add">+ 도서 등록</button></div>' +
        '<div class="card-b" style="padding-bottom:8px">' +
          '<div class="row">' +
            '<input type="search" id="q" placeholder="제목 · 지은이 · 청구기호 · 레벨 검색" value="' + U.esc(filter.q) + '" style="flex:1;min-width:180px">' +
            '<select id="f-cat" style="width:130px">' + UI.options(Store.BOOK_CATEGORIES, filter.category, '전체 분류') + '</select>' +
            '<div class="seg">' +
              '<button data-state="all" class="' + (filter.state === 'all' ? 'on' : '') + '">전체</button>' +
              '<button data-state="in" class="' + (filter.state === 'in' ? 'on' : '') + '">대출 가능</button>' +
              '<button data-state="out" class="' + (filter.state === 'out' ? 'on' : '') + '">대출 중</button>' +
              '<button data-state="overdue" class="' + (filter.state === 'overdue' ? 'on' : '') + '">연체</button>' +
            '</div>' +
          '</div>' +
          '<div class="row" style="margin-top:10px">' +
            '<input type="text" id="scan" placeholder="청구기호를 입력하고 Enter — 빌려주기 · 반납이 바로 됩니다" style="flex:1;min-width:220px">' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>청구기호</th><th>제목</th><th>레벨</th><th>분류</th><th>상태</th><th>대출자</th><th></th></tr></thead>' +
          '<tbody id="rows">' + rows() + '</tbody>' +
        '</table></div>' +
      '</div>';

    function refresh() { render(el); }

    el.querySelector('#add').addEventListener('click', function () { openBookForm(null); });
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
      quickScan(code, el);
    });

    UI.on(el, '[data-lend]', 'click', function (e, b) { openLend(b.getAttribute('data-lend')); });
    UI.on(el, '[data-edit]', 'click', function (e, b) { openBookForm(b.getAttribute('data-edit')); });
    UI.on(el, '[data-return]', 'click', function (e, b) {
      Store.returnBook(b.getAttribute('data-return'));
      UI.toast('반납했습니다.');
      refresh();
    });

    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['청구기호', '제목', '지은이', '레벨', '분류', '시리즈', '상태', '대출자', '반납예정일'];
      var body = visible().map(function (b) {
        var st = Store.bookStatus(b);
        var s = st.loan ? Store.student(st.loan.studentId) : null;
        return [b.code, b.title, b.author, b.level, b.category, b.series,
                st.label, s ? s.name : '', st.loan ? st.loan.dueDate : ''];
      });
      U.download('고래영어_도서목록_' + U.ymd() + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  return { title: title, sub: sub, render: render };
})();
