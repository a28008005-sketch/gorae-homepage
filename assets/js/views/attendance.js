/* ===== 출결 체크 · 일일 학습 관리 ===== */
window.Views = window.Views || {};
Views.attendance = (function () {

  var date = U.ymd();
  var scope = 'day';   // day = 해당 요일 수업생만, all = 전체 등록생

  function title() { return '출결 · 일일학습 관리'; }
  function sub() { return U.human(date) + ' · 출결과 수업 태도를 한 줄에서 기록합니다'; }

  function targets() {
    return scope === 'day' ? Store.studentsOnDay(U.dayOf(date)) : Store.students({ active: true });
  }

  function row(s) {
    var r = Store.attendanceFor(s.id, date) || {};
    var flags = r.flags || [];
    var attitude = r.attitude || [];
    var sc = Store.scheduleOf(s);
    return '<div class="att-row" data-sid="' + s.id + '">' +
      '<div class="att-who">' +
        '<span class="klass-dot" style="background:' + U.esc(sc.color || '#cbd5e0') + '"></span>' +
        '<span><span class="nm">' + U.esc(s.name) + '</span><br>' +
        '<span class="gr">' + U.esc(sc.className || s.grade || '') +
          (sc.time ? ' · ' + U.esc(sc.time) : '') + '</span></span>' +
      '</div>' +

      '<div class="att-checks">' +
        '<div class="seg">' +
          '<button data-status="출석" class="' + (r.status === '출석' ? 'on' : '') + '">출석</button>' +
          '<button data-status="결석" class="' + (r.status === '결석' ? 'on' : '') + '">결석</button>' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div class="att-checks" style="margin-bottom:6px">' +
          Store.FLAGS.map(function (f) {
            return '<button class="chip' + (flags.indexOf(f) >= 0 ? ' on warn' : '') + '" data-flag="' + f + '">' + f + '</button>';
          }).join('') +
          '<span style="width:10px"></span>' +
          '<label class="check' + (r.planner ? ' on' : '') + '"><input type="checkbox" data-chk="planner"' + (r.planner ? ' checked' : '') + '>플래너 작성</label>' +
          '<label class="check' + (r.planDone ? ' on' : '') + '"><input type="checkbox" data-chk="planDone"' + (r.planDone ? ' checked' : '') + '>계획 실천</label>' +
          '<label class="check' + (r.homework ? ' on' : '') + '"><input type="checkbox" data-chk="homework"' + (r.homework ? ' checked' : '') + '>숙제</label>' +
        '</div>' +
        '<div class="att-checks att-attitude">' +
          '<span class="att-label">수업 태도</span>' +
          Store.ATTITUDES.map(function (a) {
            var on = attitude.indexOf(a) >= 0;
            var cls = Store.isIssue(a) ? 'warn' : 'mint';
            return '<button class="chip' + (on ? ' on ' + cls : '') + '" data-attitude="' + U.esc(a) + '">' + U.esc(a) + '</button>';
          }).join('') +
        '</div>' +
        '<input type="text" class="mini-note" data-note placeholder="비고 (오늘 학습 내용, 전달 사항)" value="' + U.esc(r.note || '') + '">' +
      '</div>' +
    '</div>';
  }

  function list() {
    var list = targets();
    if (!list.length) {
      return UI.emptyBox(scope === 'day'
        ? U.dayOf(date) + '요일에 수업이 있는 학생이 없습니다. 오른쪽 위에서 [전체 등록생]으로 바꿔보세요.'
        : '등록생이 없습니다. 학생 명부에서 먼저 등록해 주세요.', '🗓️');
    }
    return list.map(row).join('');
  }

  /** 오늘 주의 태도가 찍힌 학생 수 */
  function attitudeIssues() {
    return Store.attendanceOn(date).filter(function (r) {
      return (r.attitude || []).some(Store.isIssue);
    }).length;
  }

  function statBar() {
    var o = Store.dayOverview(date);
    var n = scope === 'day' ? o.expected.length : Store.students({ active: true }).length;
    return '<div class="grid g-4" style="margin-bottom:16px">' +
      '<div class="stat accent"><div class="lbl">출석률</div><div class="val">' + o.rate + '<small>%</small></div>' +
        '<div class="sub">' + U.human(date) + '</div></div>' +
      '<div class="stat"><div class="lbl">출석</div><div class="val">' + o.present + '<small>명</small></div></div>' +
      '<div class="stat"><div class="lbl">결석</div><div class="val">' + o.absent + '<small>명</small></div></div>' +
      '<div class="stat"><div class="lbl">태도 주의</div><div class="val">' + attitudeIssues() + '<small>명</small></div>' +
        '<div class="sub">미체크 ' + o.unmarked + '/' + n + '</div></div>' +
    '</div>';
  }

  function render(el) {
    el.innerHTML =
      '<div id="stats">' + statBar() + '</div>' +
      '<div class="card">' +
        '<div class="card-h">' +
          '<h2>일일 학습 관리표</h2><div class="sp"></div>' +
          '<button class="btn sm" id="prev">‹ 어제</button>' +
          '<input type="date" id="date" value="' + date + '" style="width:150px">' +
          '<button class="btn sm" id="next">내일 ›</button>' +
          '<button class="btn sm" id="today">오늘</button>' +
          '<span style="width:8px"></span>' +
          '<div class="seg">' +
            '<button id="sc-day" class="' + (scope === 'day' ? 'on' : '') + '">요일 수업생</button>' +
            '<button id="sc-all" class="' + (scope === 'all' ? 'on' : '') + '">전체 등록생</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-b" style="padding:10px 14px;border-bottom:1px solid var(--line)">' +
          '<div class="row">' +
            '<button class="btn sm" id="all-present">전원 출석 처리</button>' +
            '<button class="btn sm" id="clear">이 날짜 출결 초기화</button>' +
            '<div class="sp"></div>' +
            '<span class="hint">체크는 입력 즉시 저장됩니다.</span>' +
          '</div>' +
        '</div>' +
        '<div class="card-b tight" id="rows">' + list() + '</div>' +
      '</div>';

    function refresh() {
      el.querySelector('#rows').innerHTML = list();
      el.querySelector('#stats').innerHTML = statBar();
    }
    function go(d) { date = d; App.setSub(sub()); el.querySelector('#date').value = d; refresh(); }

    el.querySelector('#date').addEventListener('change', function (e) { go(e.target.value); });
    el.querySelector('#prev').addEventListener('click', function () { go(U.daysAgo(1, date)); });
    el.querySelector('#next').addEventListener('click', function () { go(U.daysAgo(-1, date)); });
    el.querySelector('#today').addEventListener('click', function () { go(U.ymd()); });
    el.querySelector('#sc-day').addEventListener('click', function () { scope = 'day'; render(el); });
    el.querySelector('#sc-all').addEventListener('click', function () { scope = 'all'; render(el); });

    el.querySelector('#all-present').addEventListener('click', function () {
      var list = targets();
      if (!list.length) return;
      list.forEach(function (s) {
        var r = Store.attendanceFor(s.id, date);
        if (!r || !r.status) Store.setAttendance(s.id, date, { status: '출석' });
      });
      UI.toast('미체크 학생을 모두 출석 처리했습니다.');
      refresh();
    });

    el.querySelector('#clear').addEventListener('click', function () {
      UI.confirm(U.human(date) + '의 출결 기록을 모두 지울까요?', function () {
        var d = Store.get();
        d.attendance = d.attendance.filter(function (a) { return a.date !== date; });
        Store.save();
        UI.toast('초기화했습니다.');
        refresh();
      }, { danger: true, yes: '초기화' });
    });

    /* 행 단위 입력 */
    UI.on(el, '[data-status]', 'click', function (e, btn) {
      var sid = btn.closest('[data-sid]').getAttribute('data-sid');
      var cur = Store.attendanceFor(sid, date);
      var val = btn.getAttribute('data-status');
      Store.setAttendance(sid, date, { status: (cur && cur.status === val) ? '' : val });
      refresh();
    });
    UI.on(el, '[data-flag]', 'click', function (e, btn) {
      var sid = btn.closest('[data-sid]').getAttribute('data-sid');
      Store.toggleFlag(sid, date, btn.getAttribute('data-flag'));
      refresh();
    });
    UI.on(el, '[data-attitude]', 'click', function (e, btn) {
      var sid = btn.closest('[data-sid]').getAttribute('data-sid');
      Store.toggleAttitude(sid, date, btn.getAttribute('data-attitude'));
      refresh();
    });
    UI.on(el, '[data-chk]', 'change', function (e, cb) {
      var sid = cb.closest('[data-sid]').getAttribute('data-sid');
      var patch = {};
      patch[cb.getAttribute('data-chk')] = cb.checked;
      Store.setAttendance(sid, date, patch);
      cb.parentNode.classList.toggle('on', cb.checked);
    });
    UI.on(el, '[data-note]', 'change', function (e, input) {
      var sid = input.closest('[data-sid]').getAttribute('data-sid');
      Store.setAttendance(sid, date, { note: input.value });
      UI.toast('비고를 저장했습니다.');
    });
  }

  return { title: title, sub: sub, render: render };
})();
