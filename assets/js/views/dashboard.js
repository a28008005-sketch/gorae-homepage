/* ===== 대시보드 ===== */
window.Views = window.Views || {};
Views.dashboard = (function () {

  function title() { return '대시보드'; }
  function sub() {
    var o = Store.dayOverview(U.ymd());
    return U.human(o.date) + ' · 오늘 수업 예정 ' + o.expected.length + '명';
  }

  function quickCheck(o) {
    var pending = o.expected.filter(function (s) {
      var r = Store.attendanceFor(s.id, o.date);
      return !r || !r.status;
    });
    if (!o.expected.length) {
      return UI.emptyBox('오늘(' + o.day + '요일)은 예정된 수업이 없습니다.', '🗓️');
    }
    if (!pending.length) {
      return '<div class="empty"><span class="big">✅</span>오늘 출결 체크를 모두 마쳤습니다.<br>' +
        '<span style="font-size:12.5px">출석 ' + o.present + '명 · 결석 ' + o.absent + '명</span></div>';
    }
    return pending.map(function (s) {
      return '<div class="att-row" data-sid="' + s.id + '">' +
        '<div class="att-who">' +
          '<span class="klass-dot" style="background:' + U.esc(Store.scheduleOf(s).color || '#cbd5e0') + '"></span>' +
          '<span><span class="nm">' + U.esc(s.name) + '</span><br>' +
          '<span class="gr">' + U.esc(Store.scheduleOf(s).className || s.grade || '') + '</span></span>' +
        '</div>' +
        '<div class="att-checks">' +
          '<button class="btn sm" data-mark="출석">출석</button>' +
          '<button class="btn sm" data-mark="결석">결석</button>' +
        '</div>' +
        '<div class="att-checks">' +
          '<button class="btn sm ghost" data-mark="출석" data-flag="지각">지각 출석</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /** 오늘 기록된 수업 태도 */
  function attitudeToday() {
    var list = Store.attendanceOn(U.ymd()).filter(function (r) { return (r.attitude || []).length; });
    if (!list.length) return UI.emptyBox('오늘 기록된 수업 태도가 없습니다.', '🙂');
    // 주의가 필요한 학생을 위로 올립니다.
    list.sort(function (a, b) {
      return ((b.attitude || []).some(Store.isIssue) ? 1 : 0) - ((a.attitude || []).some(Store.isIssue) ? 1 : 0);
    });
    return list.slice(0, 7).map(function (r) {
      var s = Store.student(r.studentId);
      var issue = (r.attitude || []).some(Store.isIssue);
      return '<div class="memo-item">' +
        '<div class="txt"><b>' + U.esc(s ? s.name : '(삭제된 학생)') + '</b> ' +
          '<span class="tag ' + (issue ? 'warn' : 'ok') + '">' + U.esc((r.attitude || []).join(' ')) + '</span>' +
          (r.attitudeNote ? '<br><span style="font-size:12.5px;color:#63778a">' + U.esc(r.attitudeNote) + '</span>' : '') +
        '</div></div>';
    }).join('');
  }

  function taskList(bucket) {
    var list = Store.tasks(bucket);
    if (!list.length) return '<div style="padding:10px 0;color:#93a4b4;font-size:12.5px">할 일이 없습니다.</div>';
    return list.map(function (t) {
      return '<div class="memo-item' + (t.done ? ' done' : '') + '">' +
        '<input type="checkbox" class="cbx" data-task="' + t.id + '"' + (t.done ? ' checked' : '') + '>' +
        '<div class="txt">' + U.esc(t.text) + '</div>' +
        '<button class="x-btn" data-task-del="' + t.id + '" title="삭제">&times;</button>' +
      '</div>';
    }).join('');
  }

  function unpaidList(pay) {
    var list = pay.list.filter(function (p) {
      var k = Store.paymentStatus(p).key;
      return k === 'overdue' || k === 'partial' || k === 'due';
    }).sort(function (a, b) {
      return Store.paymentStatus(b).overdue - Store.paymentStatus(a).overdue;
    });
    if (!pay.list.length) {
      return '<div class="hint">이번 달 청구서가 아직 없습니다. <a href="#/tuition" style="color:#1a7fd4;font-weight:600">청구서를 생성</a>해 주세요.</div>';
    }
    if (!list.length) {
      return '<div class="empty" style="padding:26px 12px"><span class="big">💰</span>이번 달 수강료를 모두 받았습니다.</div>';
    }
    return list.slice(0, 6).map(function (p) {
      var s = Store.student(p.studentId);
      var st = Store.paymentStatus(p);
      var remain = (Number(p.amount) || 0) - (Number(p.paidAmount) || 0);
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(s ? s.name : '') + '</b> ' +
        '<span class="tag ' + st.tag + '">' + U.esc(st.label) + '</span>' +
        '<br><span style="font-size:12px;color:#63778a">' + U.won(remain) + ' · 기한 ' + U.esc(p.dueDate || '-') + '</span></div></div>';
    }).join('') + (list.length > 6 ? '<div class="hint" style="margin-top:8px">외 ' + (list.length - 6) + '명</div>' : '');
  }

  /** 진행 중 숙제의 제출 현황 */
  function homeworkBox() {
    var open = Store.homeworks({ open: true });
    if (!open.length) return '<div class="hint">진행 중인 숙제가 없습니다. <a href="#/homework" style="color:#1a7fd4;font-weight:600">숙제 내기</a></div>';
    return open.slice(0, 5).map(function (h) {
      var pr = Store.homeworkProgress(h.id);
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(h.title) + '</b> ' +
        '<span class="tag ' + (pr.rate === 100 ? 'ok' : pr.rate >= 60 ? 'warn' : 'bad') + '">' + pr.rate + '%</span>' +
        '<br><span style="font-size:12px;color:#63778a">제출 ' + pr.done + '/' + pr.total + '명' +
        (h.dueDate ? ' · 마감 ' + U.esc(h.dueDate) : '') + '</span></div></div>';
    }).join('') + (open.length > 5 ? '<div class="hint" style="margin-top:8px">외 ' + (open.length - 5) + '건</div>' : '');
  }

  /** 오늘 이후 반납 예정과 연체 */
  function libraryBox() {
    var over = Store.overdueLoans();
    var open = Store.loans({ open: true });
    if (!Store.books().length) {
      return '<div class="hint">등록된 도서가 없습니다. <a href="#/library" style="color:#1a7fd4;font-weight:600">도서 등록</a></div>';
    }
    if (!open.length) return '<div class="empty" style="padding:26px 12px"><span class="big">📖</span>대출 중인 책이 없습니다.</div>';
    var soon = open.slice().sort(function (a, b) {
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
    });
    return soon.slice(0, 5).map(function (l) {
      var b = Store.book(l.bookId), st = Store.student(l.studentId);
      var late = l.dueDate && l.dueDate < U.ymd();
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(st ? st.name : '') + '</b> ' +
        '<span class="tag ' + (late ? 'bad' : 'blue') + '">' +
          (late ? U.dayDiff(l.dueDate, U.ymd()) + '일 연체' : '~' + U.esc(l.dueDate || '')) + '</span>' +
        '<br><span style="font-size:12px;color:#63778a">' + U.esc(b ? b.title : '(삭제된 책)') + '</span></div></div>';
    }).join('') + (over.length ? '<div class="hint" style="margin-top:8px">연체 ' + over.length + '권</div>' : '');
  }

  function render(el) {
    var o = Store.dayOverview(U.ymd());
    var all = Store.students();
    var active = all.filter(function (s) { return s.status === '등록생'; });
    var waiting = all.filter(function (s) { return s.status === '대기생'; });
    var resting = all.filter(function (s) { return s.status === '휴원생'; });
    var classCount = Store.classes().length;
    var pay = Store.paymentSummary(U.ym(new Date()));

    el.innerHTML =
      '<div class="stack">' +

      '<div class="grid g-4">' +
        '<div class="stat accent"><div class="lbl">오늘 출석률</div>' +
          '<div class="val">' + o.rate + '<small>%</small></div>' +
          '<div class="sub">출석 ' + o.present + ' · 결석 ' + o.absent + ' · 미체크 ' + o.unmarked + '</div></div>' +
        '<div class="stat"><div class="lbl">등록생</div><div class="val">' + active.length + '<small>명</small></div>' +
          '<div class="sub">대기 ' + waiting.length + ' · 휴원 ' + resting.length + ' · 반 ' + classCount + '개</div></div>' +
        '<div class="stat"><div class="lbl">오늘 수업</div><div class="val">' + o.expected.length + '<small>명</small></div>' +
          '<div class="sub">' + o.day + '요일 수업 예정</div></div>' +
        '<div class="stat"><div class="lbl">이달 수강료 수납률</div><div class="val">' + pay.rate + '<small>%</small></div>' +
          '<div class="sub">' + (pay.outstanding ? '미수납 ' + U.num(pay.outstanding) + '원 · ' + pay.unpaidCount + '명' : '미수납 없음') + '</div></div>' +
      '</div>' +

      '<div class="grid g-21">' +
        '<div class="card"><div class="card-h"><h2>오늘 출결 빠른 체크</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/attendance">전체 출결표 →</a></div>' +
          '<div class="card-b tight" id="quick">' + quickCheck(o) + '</div></div>' +

        '<div class="card"><div class="card-h"><h2>오늘 수업 태도</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/attendance">기록하기</a></div>' +
          '<div class="card-b">' + attitudeToday() + '</div></div>' +
      '</div>' +

      '<div class="grid g-21">' +
      '<div class="card"><div class="card-h"><h2>업무 메모</h2><div class="sp"></div>' +
        '<span class="hint">오늘 / 이번주 / 미뤄두기로 나눠 기록하세요</span></div>' +
        '<div class="card-b">' +
          '<div class="row" style="margin-bottom:14px">' +
            '<input type="text" id="task-text" placeholder="할 일을 입력하고 Enter" style="flex:1;min-width:200px">' +
            '<select id="task-bucket" style="width:120px">' +
              '<option value="today">오늘</option><option value="week">이번주</option><option value="later">미뤄두기</option>' +
            '</select>' +
            '<button class="btn primary" id="task-add">추가</button>' +
          '</div>' +
          '<div class="grid g-3">' +
            '<div><div class="section-title">🔥 오늘</div>' + taskList('today') + '</div>' +
            '<div><div class="section-title">📅 이번주</div>' + taskList('week') + '</div>' +
            '<div><div class="section-title">💤 미뤄두기</div>' + taskList('later') + '</div>' +
          '</div>' +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>수강료 미납</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/tuition">납부 관리 →</a></div>' +
          '<div class="card-b">' + unpaidList(pay) + '</div></div>' +
      '</div>' +

      '<div class="grid g-2">' +
        '<div class="card"><div class="card-h"><h2>숙제 현황</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/homework">숙제 관리 →</a></div>' +
          '<div class="card-b">' + homeworkBox() + '</div></div>' +
        '<div class="card"><div class="card-h"><h2>도서 반납</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/library">도서 대여 →</a></div>' +
          '<div class="card-b">' + libraryBox() + '</div></div>' +
      '</div>' +

      '</div>';

    /* --- 이벤트 --- */
    UI.on(el, '[data-mark]', 'click', function (e, btn) {
      var row = btn.closest('[data-sid]');
      var sid = row.getAttribute('data-sid');
      var patch = { status: btn.getAttribute('data-mark') };
      if (btn.getAttribute('data-flag')) patch.flags = [btn.getAttribute('data-flag')];
      Store.setAttendance(sid, U.ymd(), patch);
      UI.toast(patch.status + ' 체크 완료');
      render(el);
    });

    function addTask() {
      var input = el.querySelector('#task-text');
      var text = input.value.trim();
      if (!text) return;
      Store.addTask(text, el.querySelector('#task-bucket').value);
      input.value = '';
      render(el);
    }
    el.querySelector('#task-add').addEventListener('click', addTask);
    el.querySelector('#task-text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addTask();
    });

    UI.on(el, '[data-task]', 'change', function (e, cb) {
      Store.updateTask(cb.getAttribute('data-task'), { done: cb.checked });
      render(el);
    });
    UI.on(el, '[data-task-del]', 'click', function (e, btn) {
      Store.deleteTask(btn.getAttribute('data-task-del'));
      render(el);
    });
  }

  return { title: title, sub: sub, render: render };
})();
