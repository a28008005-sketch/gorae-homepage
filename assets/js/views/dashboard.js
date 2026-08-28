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
          '<span class="seat">' + (s.seat ? U.esc(s.seat) : '–') + '</span>' +
          '<span><span class="nm">' + U.esc(s.name) + '</span><br>' +
          '<span class="gr">' + U.esc(s.grade || '') + (s.time ? ' · ' + U.esc(s.time) : '') + '</span></span>' +
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

  function patrolToday() {
    var list = Store.patrols({ date: U.ymd() });
    if (!list.length) return UI.emptyBox('오늘 기록된 순회 점검이 없습니다.', '🔍');
    return list.slice(0, 6).map(function (p) {
      var s = Store.student(p.studentId);
      var issue = (p.states || []).some(Store.isIssue);
      return '<div class="memo-item">' +
        '<span class="dt">' + U.hhmm(p.at) + '</span>' +
        '<div class="txt"><b>' + U.esc(s ? s.name : '(삭제된 학생)') + '</b> ' +
          '<span class="tag ' + (issue ? 'warn' : 'ok') + '">' + U.esc((p.states || []).join(' ')) + '</span>' +
          (p.action ? '<br><span style="font-size:12.5px;color:#63778a">조치: ' + U.esc(p.action) + '</span>' : '') +
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

  function render(el) {
    var o = Store.dayOverview(U.ymd());
    var all = Store.students();
    var active = all.filter(function (s) { return s.status === '등록생'; });
    var waiting = all.filter(function (s) { return s.status === '대기생'; });
    var resting = all.filter(function (s) { return s.status === '휴원생'; });
    var seated = active.filter(function (s) { return s.seat; }).length;

    el.innerHTML =
      '<div class="stack">' +

      '<div class="grid g-4">' +
        '<div class="stat accent"><div class="lbl">오늘 출석률</div>' +
          '<div class="val">' + o.rate + '<small>%</small></div>' +
          '<div class="sub">출석 ' + o.present + ' · 결석 ' + o.absent + ' · 미체크 ' + o.unmarked + '</div></div>' +
        '<div class="stat"><div class="lbl">등록생</div><div class="val">' + active.length + '<small>명</small></div>' +
          '<div class="sub">대기 ' + waiting.length + ' · 휴원 ' + resting.length + '</div></div>' +
        '<div class="stat"><div class="lbl">오늘 수업</div><div class="val">' + o.expected.length + '<small>명</small></div>' +
          '<div class="sub">' + o.day + '요일 수업 예정</div></div>' +
        '<div class="stat"><div class="lbl">좌석 배정</div><div class="val">' + seated + '<small>/' + Store.get().academy.seatCount + '</small></div>' +
          '<div class="sub">미배정 ' + (active.length - seated) + '명</div></div>' +
      '</div>' +

      '<div class="grid g-21">' +
        '<div class="card"><div class="card-h"><h2>오늘 출결 빠른 체크</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/attendance">전체 출결표 →</a></div>' +
          '<div class="card-b tight" id="quick">' + quickCheck(o) + '</div></div>' +

        '<div class="card"><div class="card-h"><h2>오늘 순회 점검</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/patrol">기록하기</a></div>' +
          '<div class="card-b">' + patrolToday() + '</div></div>' +
      '</div>' +

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
