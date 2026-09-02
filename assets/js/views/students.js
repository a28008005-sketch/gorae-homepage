/* ===== 학생 명부 ===== */
window.Views = window.Views || {};
Views.students = (function () {

  var filter = { q: '', status: '', grade: '', day: '' };

  function title() { return '학생 명부'; }
  function sub() {
    var all = Store.students();
    return '등록생 ' + all.filter(function (s) { return s.status === '등록생'; }).length +
      '명 · 전체 ' + all.length + '명';
  }

  /* ---------- 목록 ---------- */
  function matches(s) {
    if (filter.status && s.status !== filter.status) return false;
    if (filter.grade && s.grade !== filter.grade) return false;
    if (filter.day && (s.days || []).indexOf(filter.day) < 0) return false;
    if (filter.q) {
      var hay = [s.name, s.grade, s.phone, s.parentPhone, s.parentEmail, s.note].join(' ').toLowerCase();
      if (hay.indexOf(filter.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function rows() {
    var list = Store.students().filter(matches);
    if (!list.length) return '<tr><td colspan="8">' + UI.emptyBox('조건에 맞는 학생이 없습니다.', '🔎') + '</td></tr>';
    var today = U.ymd();
    return list.map(function (s) {
      var rec = Store.attendanceFor(s.id, today);
      var sum = Store.summarize(s.id, U.ym(new Date()) + '-01', today);
      return '<tr class="clickable" data-open="' + s.id + '">' +
        '<td class="nm">' + U.esc(s.name) + '</td>' +
        '<td>' + U.esc(s.grade || '-') + '</td>' +
        '<td>' + (s.seat ? U.esc(s.seat) + '번' : '<span style="color:#b3c1cd">미배정</span>') + '</td>' +
        '<td>' + U.esc((s.days || []).join('·') || '-') + (s.time ? ' <span class="tag gray">' + U.esc(s.time) + '</span>' : '') + '</td>' +
        '<td>' + UI.statusTag(s.status) + '</td>' +
        '<td>' + UI.attTag(rec) + '</td>' +
        '<td class="num">' + (sum.total ? sum.rate + '%' : '-') + '</td>' +
        '<td>' + U.esc(U.phone(s.parentPhone) || '-') + '</td>' +
      '</tr>';
    }).join('');
  }

  /* ---------- 등록 / 수정 폼 ---------- */
  function form(s) {
    s = s || {};
    var ac = Store.get().academy;
    var seatOpts = [];
    for (var i = 1; i <= ac.seatCount; i++) seatOpts.push(String(i));
    var taken = Store.seatMap();

    return '<div class="form-grid">' +
      '<label class="fld">학생 이름 *<input type="text" id="f-name" value="' + U.esc(s.name || '') + '" placeholder="홍길동"></label>' +
      '<label class="fld">학년<select id="f-grade">' + UI.options(Store.GRADES, s.grade, '선택 안 함') + '</select></label>' +
      '<label class="fld">등록 여부<select id="f-status">' + UI.options(Store.STATUS, s.status || '등록생') + '</select></label>' +
      '<label class="fld">좌석<select id="f-seat"><option value="">미배정</option>' +
        seatOpts.map(function (n) {
          var owner = taken[n];
          var busy = owner && owner.id !== s.id;
          return '<option value="' + n + '"' + (String(s.seat) === n ? ' selected' : '') + (busy ? ' disabled' : '') + '>' +
            n + '번' + (busy ? ' (' + U.esc(owner.name) + ')' : '') + '</option>';
        }).join('') + '</select></label>' +
      '<label class="fld full">수업 요일' +
        '<div class="chips" id="f-days">' + Store.WEEKDAYS.map(function (d) {
          var on = (s.days || []).indexOf(d) >= 0;
          return '<button type="button" class="chip' + (on ? ' on blue' : '') + '" data-day="' + d + '">' + d + '</button>';
        }).join('') + '</div></label>' +
      '<label class="fld">수업 시간<select id="f-time">' + UI.options(ac.times, s.time, '선택 안 함') + '</select></label>' +
      '<label class="fld">학생 연락처<input type="tel" id="f-phone" value="' + U.esc(s.phone || '') + '" placeholder="010-0000-0000"></label>' +
      '<label class="fld">학부모 연락처<input type="tel" id="f-pphone" value="' + U.esc(s.parentPhone || '') + '" placeholder="010-0000-0000"></label>' +
      '<label class="fld">학부모 이메일<input type="email" id="f-pmail" value="' + U.esc(s.parentEmail || '') + '" placeholder="parent@email.com"></label>' +
      '<label class="fld">월 수강료 <span style="font-weight:400">(비우면 기본값 ' + U.num(ac.defaultFee) + '원)</span>' +
        '<input type="number" id="f-fee" step="1000" value="' + (s.fee === undefined || s.fee === '' ? '' : U.esc(s.fee)) + '" placeholder="' + U.num(ac.defaultFee) + '"></label>' +
      '<label class="fld">납부일 <span style="font-weight:400">(매월)</span>' +
        '<input type="number" id="f-bday" min="1" max="31" value="' + (s.billingDay || '') + '" placeholder="' + U.esc(ac.billingDay) + '"></label>' +
      '<label class="fld full">특이사항<textarea id="f-note" placeholder="알레르기, 등하원 방법, 성향 등">' + U.esc(s.note || '') + '</textarea></label>' +
    '</div>';
  }

  function openForm(id) {
    var s = id ? Store.student(id) : null;
    UI.modal({
      title: s ? U.esc(s.name) + ' 정보 수정' : '학생 등록',
      body: form(s),
      footer: (s ? '<button class="btn danger" id="f-del">삭제</button><div class="sp"></div>' : '') +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="f-save">저장</button>',
      onMount: function (w) {
        var days = (s && s.days ? s.days.slice() : []);
        UI.on(w, '[data-day]', 'click', function (e, btn) {
          var d = btn.getAttribute('data-day');
          var i = days.indexOf(d);
          if (i >= 0) { days.splice(i, 1); btn.classList.remove('on', 'blue'); }
          else { days.push(d); btn.classList.add('on', 'blue'); }
        });

        w.querySelector('#f-save').addEventListener('click', function () {
          var name = w.querySelector('#f-name').value.trim();
          if (!name) { UI.toast('학생 이름을 입력해 주세요.', true); return; }
          Store.saveStudent({
            id: s ? s.id : null,
            name: name,
            grade: w.querySelector('#f-grade').value,
            status: w.querySelector('#f-status').value,
            seat: w.querySelector('#f-seat').value,
            days: days,
            time: w.querySelector('#f-time').value,
            phone: w.querySelector('#f-phone').value.trim(),
            parentPhone: w.querySelector('#f-pphone').value.trim(),
            parentEmail: w.querySelector('#f-pmail').value.trim(),
            fee: w.querySelector('#f-fee').value === '' ? '' : Number(w.querySelector('#f-fee').value),
            billingDay: w.querySelector('#f-bday').value === '' ? '' : Number(w.querySelector('#f-bday').value),
            note: w.querySelector('#f-note').value.trim()
          });
          UI.close();
          UI.toast(s ? '수정했습니다.' : name + ' 학생을 등록했습니다.');
          App.rerender();
        });

        if (s) {
          w.querySelector('#f-del').addEventListener('click', function () {
            UI.close();
            UI.confirm(
              '<b>' + U.esc(s.name) + '</b> 학생을 삭제할까요?<br>' +
              '<span style="color:#63778a;font-size:13px">출결 · 순회점검 · 메모 기록이 모두 함께 삭제되며 되돌릴 수 없습니다.<br>' +
              '기록을 남기려면 대신 등록 여부를 <b>퇴원생</b>으로 바꿔 주세요.</span>',
              function () {
                Store.deleteStudent(s.id);
                UI.toast('삭제했습니다.');
                App.rerender();
              }, { danger: true, yes: '완전 삭제', title: '학생 삭제' }
            );
          });
        }
      }
    });
  }

  /* ---------- 상세 ---------- */
  function openDetail(id) {
    var s = Store.student(id);
    if (!s) return;
    var monthStart = U.ym(new Date()) + '-01';
    var sum = Store.summarize(s.id, monthStart, U.ymd());
    var recent = Store.attendanceRange(s.id, U.daysAgo(30), U.ymd()).slice(-10).reverse();
    var memos = Store.memos(s.id).slice(0, 5);
    var pay = Store.paymentHistory(s.id);

    var body =
      '<div class="grid g-2" style="gap:18px">' +
        '<div><dl class="kv">' +
          '<dt>학년</dt><dd>' + U.esc(s.grade || '-') + '</dd>' +
          '<dt>좌석</dt><dd>' + (s.seat ? U.esc(s.seat) + '번' : '미배정') + '</dd>' +
          '<dt>수업</dt><dd>' + U.esc((s.days || []).join('·') || '-') + (s.time ? ' / ' + U.esc(s.time) : '') + '</dd>' +
          '<dt>등록 여부</dt><dd>' + UI.statusTag(s.status) + '</dd>' +
          '<dt>학생 연락처</dt><dd>' + U.esc(U.phone(s.phone) || '-') + '</dd>' +
          '<dt>학부모</dt><dd>' + U.esc(U.phone(s.parentPhone) || '-') + '</dd>' +
          '<dt>이메일</dt><dd>' + U.esc(s.parentEmail || '-') + '</dd>' +
          '<dt>월 수강료</dt><dd>' + U.won(Store.feeOf(s)) + ' · 매월 ' +
            (s.billingDay || Store.get().academy.billingDay) + '일</dd>' +
          '<dt>특이사항</dt><dd>' + (s.note ? U.esc(s.note) : '-') + '</dd>' +
        '</dl></div>' +
        '<div>' +
          '<div class="section-title" style="margin-top:0">이번 달 요약</div>' +
          '<div class="report-stats" style="grid-template-columns:repeat(2,1fr)">' +
            '<div class="report-stat"><div class="v">' + sum.rate + '%</div><div class="l">출석률</div></div>' +
            '<div class="report-stat"><div class="v">' + sum.present + '/' + sum.total + '</div><div class="l">출석 / 수업</div></div>' +
            '<div class="report-stat"><div class="v">' + sum.homework + '</div><div class="l">숙제 완료</div></div>' +
            '<div class="report-stat"><div class="v">' + sum.patrolIssues + '</div><div class="l">순회 체크</div></div>' +
          '</div>' +
          '<div class="hint" style="margin-top:8px">지각 ' + sum.flags['지각'] + ' · 외출 ' + sum.flags['외출'] + ' · 조퇴 ' + sum.flags['조퇴'] + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-title">최근 출결 (30일)</div>' +
      (recent.length ? '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
        '<thead><tr><th>날짜</th><th>출결</th><th>플래너</th><th>계획실천</th><th>숙제</th><th>비고</th></tr></thead><tbody>' +
        recent.map(function (r) {
          return '<tr><td>' + U.shortDate(r.date) + '</td><td>' + UI.attTag(r) + '</td>' +
            '<td>' + (r.planner ? '✅' : '–') + '</td><td>' + (r.planDone ? '✅' : '–') + '</td>' +
            '<td>' + (r.homework ? '✅' : '–') + '</td><td>' + U.esc(r.note || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="hint">기록이 없습니다.</div>') +

      '<div class="section-title">수강료 납부 이력</div>' +
      (pay.list.length
        ? '<div class="row" style="gap:6px;margin-bottom:8px">' +
            '<span class="tag blue">누적 청구 ' + U.won(pay.billed) + '</span>' +
            '<span class="tag ok">수납 ' + U.won(pay.collected) + '</span>' +
            (pay.outstanding > 0 ? '<span class="tag bad">미수납 ' + U.won(pay.outstanding) + '</span>' : '') +
          '</div>' +
          '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
          '<thead><tr><th>청구월</th><th class="num">청구액</th><th class="num">납부액</th><th>상태</th><th>납부일</th></tr></thead><tbody>' +
          pay.list.slice(0, 8).map(function (p) {
            var st = Store.paymentStatus(p);
            return '<tr><td>' + U.humanMonth(p.month) + '</td>' +
              '<td class="num">' + U.num(p.amount) + '</td>' +
              '<td class="num">' + U.num(p.paidAmount || 0) + '</td>' +
              '<td><span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span></td>' +
              '<td>' + U.esc(p.paidDate || '-') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="hint">청구 기록이 없습니다. 수강료 납부 화면에서 청구서를 생성해 주세요.</div>') +

      '<div class="section-title">메모</div>' +
      '<div class="row" style="margin-bottom:8px">' +
        '<input type="text" id="d-memo" placeholder="상담 내용, 학습 특이사항 등" style="flex:1">' +
        '<button class="btn" id="d-memo-add">추가</button></div>' +
      '<div id="d-memo-list">' +
        (memos.length ? memos.map(function (m) {
          return '<div class="memo-item"><span class="dt">' + U.shortDate(m.date) + '</span>' +
            '<div class="txt">' + U.esc(m.text) + '</div>' +
            '<button class="x-btn" data-memo-del="' + m.id + '">&times;</button></div>';
        }).join('') : '<div class="hint">메모가 없습니다.</div>') +
      '</div>';

    UI.modal({
      title: s.name, wide: true, body: body,
      footer: '<button class="btn" id="d-share">학부모 공유 →</button>' +
              '<div class="sp"></div>' +
              '<button class="btn" data-close>닫기</button>' +
              '<button class="btn primary" id="d-edit">정보 수정</button>',
      onMount: function (w) {
        w.querySelector('#d-edit').addEventListener('click', function () { UI.close(); openForm(s.id); });
        w.querySelector('#d-share').addEventListener('click', function () {
          UI.close();
          location.hash = '#/share?student=' + encodeURIComponent(s.id);
        });
        function addMemo() {
          var input = w.querySelector('#d-memo');
          var t = input.value.trim();
          if (!t) return;
          Store.addMemo({ studentId: s.id, text: t });
          UI.close(); openDetail(s.id);
        }
        w.querySelector('#d-memo-add').addEventListener('click', addMemo);
        w.querySelector('#d-memo').addEventListener('keydown', function (e) { if (e.key === 'Enter') addMemo(); });
        UI.on(w, '[data-memo-del]', 'click', function (e, btn) {
          Store.deleteMemo(btn.getAttribute('data-memo-del'));
          UI.close(); openDetail(s.id);
        });
      }
    });
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    el.innerHTML =
      '<div class="card">' +
        '<div class="card-h">' +
          '<h2>학생 목록</h2><div class="sp"></div>' +
          '<button class="btn" id="csv">CSV 내보내기</button>' +
          '<button class="btn primary" id="add">+ 학생 등록</button>' +
        '</div>' +
        '<div class="card-b" style="padding-bottom:8px">' +
          '<div class="row">' +
            '<input type="search" id="q" placeholder="이름 · 연락처 · 특이사항 검색" value="' + U.esc(filter.q) + '" style="flex:1;min-width:180px">' +
            '<select id="f-st" style="width:120px">' + UI.options(Store.STATUS, filter.status, '전체 상태') + '</select>' +
            '<select id="f-gr" style="width:120px">' + UI.options(Store.GRADES, filter.grade, '전체 학년') + '</select>' +
            '<select id="f-dy" style="width:110px">' + UI.options(Store.WEEKDAYS, filter.day, '전체 요일') + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>이름</th><th>학년</th><th>좌석</th><th>수업</th><th>등록</th><th>오늘 출결</th><th>이달 출석률</th><th>학부모 연락처</th></tr></thead>' +
          '<tbody id="rows">' + rows() + '</tbody>' +
        '</table></div>' +
      '</div>';

    el.querySelector('#add').addEventListener('click', function () { openForm(null); });
    UI.on(el, '[data-open]', 'click', function (e, tr) { openDetail(tr.getAttribute('data-open')); });

    function refresh() { el.querySelector('#rows').innerHTML = rows(); }
    el.querySelector('#q').addEventListener('input', function (e) { filter.q = e.target.value; refresh(); });
    el.querySelector('#f-st').addEventListener('change', function (e) { filter.status = e.target.value; refresh(); });
    el.querySelector('#f-gr').addEventListener('change', function (e) { filter.grade = e.target.value; refresh(); });
    el.querySelector('#f-dy').addEventListener('change', function (e) { filter.day = e.target.value; refresh(); });

    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['이름', '학년', '좌석', '요일', '시간', '등록여부', '학생연락처', '학부모연락처',
                  '학부모이메일', '월수강료', '납부일', '특이사항'];
      var body = Store.students().filter(matches).map(function (s) {
        return [s.name, s.grade, s.seat, (s.days || []).join('·'), s.time, s.status,
                s.phone, s.parentPhone, s.parentEmail,
                Store.feeOf(s), s.billingDay || Store.get().academy.billingDay, s.note];
      });
      U.download('고래영어_학생명부_' + U.ymd() + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  return { title: title, sub: sub, render: render, openDetail: openDetail };
})();
