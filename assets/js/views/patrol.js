/* ===== 순회 점검 기록 ===== */
window.Views = window.Views || {};
Views.patrol = (function () {

  var date = U.ymd();

  function title() { return '순회 점검'; }
  function sub() { return U.human(date) + ' · 수업 중 학생 상태를 순회하며 기록합니다'; }

  /* ---------- 빠른 순회 ---------- */
  function quickCards() {
    var list = Store.studentsOnDay(U.dayOf(date));
    if (!list.length) list = Store.students({ active: true });
    if (!list.length) return UI.emptyBox('등록생이 없습니다.', '🧒');

    return '<div class="grid g-3">' + list.map(function (s) {
      var last = Store.patrols({ studentId: s.id, date: date })[0];
      return '<div class="card" style="box-shadow:none" data-sid="' + s.id + '">' +
        '<div class="card-b" style="padding:13px 14px">' +
          '<div class="row" style="margin-bottom:9px">' +
            '<span class="seat" style="width:26px;height:26px;border-radius:8px;background:var(--blue-soft);color:#14588f;display:grid;place-items:center;font-size:11.5px;font-weight:700">' +
              (s.seat ? U.esc(s.seat) : '–') + '</span>' +
            '<b style="font-size:14px">' + U.esc(s.name) + '</b>' +
            '<div class="sp"></div>' +
            (last ? '<span class="tag gray">' + U.hhmm(last.at) + ' 기록</span>' : '') +
          '</div>' +
          '<div class="chips" data-states>' +
            Store.PATROL_STATES.map(function (st) {
              var cls = Store.isIssue(st) ? 'warn' : 'mint';
              return '<button class="chip" data-state="' + U.esc(st) + '" data-cls="' + cls + '">' + U.esc(st) + '</button>';
            }).join('') +
          '</div>' +
          '<input type="text" class="mini-note" data-action placeholder="조치사항 (예: 자리 정돈 안내)" style="margin-top:8px">' +
          '<button class="btn sm primary block" data-save style="margin-top:8px">이 학생 점검 기록</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------- 기록 로그 ---------- */
  function log() {
    var list = Store.patrols({ date: date });
    if (!list.length) return UI.emptyBox('이 날짜의 순회 점검 기록이 없습니다.', '🔍');
    return '<div class="table-wrap"><table class="tbl">' +
      '<thead><tr><th>시간</th><th>학생</th><th>좌석</th><th>학생 상태</th><th>조치사항</th><th>비고</th><th></th></tr></thead><tbody>' +
      list.map(function (p) {
        var s = Store.student(p.studentId);
        var issue = (p.states || []).some(Store.isIssue);
        return '<tr>' +
          '<td>' + U.hhmm(p.at) + '</td>' +
          '<td class="nm">' + U.esc(s ? s.name : '(삭제됨)') + '</td>' +
          '<td>' + (s && s.seat ? U.esc(s.seat) + '번' : '-') + '</td>' +
          '<td><span class="tag ' + (issue ? 'warn' : 'ok') + '">' + U.esc((p.states || []).join(' ')) + '</span></td>' +
          '<td>' + U.esc(p.action || '') + '</td>' +
          '<td>' + U.esc(p.note || '') + '</td>' +
          '<td><button class="x-btn" data-del="' + p.id + '" title="삭제">&times;</button></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function render(el) {
    var todays = Store.patrols({ date: date });
    var issues = todays.filter(function (p) { return (p.states || []).some(Store.isIssue); }).length;

    el.innerHTML =
      '<div class="grid g-3" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">점검 횟수</div><div class="val">' + todays.length + '<small>건</small></div>' +
          '<div class="sub">' + U.human(date) + '</div></div>' +
        '<div class="stat"><div class="lbl">주의 기록</div><div class="val">' + issues + '<small>건</small></div>' +
          '<div class="sub">졸음 · 이탈 · 휴대폰 · 잡담</div></div>' +
        '<div class="stat"><div class="lbl">학습중</div><div class="val">' + (todays.length - issues) + '<small>건</small></div></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-h"><h2>빠른 순회 기록</h2><div class="sp"></div>' +
          '<input type="date" id="date" value="' + date + '" style="width:150px">' +
          '<button class="btn sm" id="today">오늘</button></div>' +
        '<div class="card-b">' + quickCards() + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-h"><h2>점검 기록</h2><div class="sp"></div>' +
          '<button class="btn sm" id="manual">+ 직접 입력</button></div>' +
        '<div class="card-b tight">' + log() + '</div>' +
      '</div>';

    el.querySelector('#date').addEventListener('change', function (e) {
      date = e.target.value; App.setSub(sub()); render(el);
    });
    el.querySelector('#today').addEventListener('click', function () {
      date = U.ymd(); App.setSub(sub()); render(el);
    });

    /* 상태 칩 토글 */
    UI.on(el, '[data-state]', 'click', function (e, btn) {
      btn.classList.toggle('on');
      btn.classList.toggle(btn.getAttribute('data-cls'));
    });

    /* 카드에서 저장 */
    UI.on(el, '[data-save]', 'click', function (e, btn) {
      var card = btn.closest('[data-sid]');
      var states = Array.prototype.slice.call(card.querySelectorAll('[data-state].on'))
        .map(function (b) { return b.getAttribute('data-state'); });
      if (!states.length) { UI.toast('학생 상태를 하나 이상 선택해 주세요.', true); return; }
      var at = (date === U.ymd()) ? new Date().toISOString() : U.parseYmd(date).toISOString();
      Store.savePatrol({
        studentId: card.getAttribute('data-sid'),
        at: at,
        states: states,
        action: card.querySelector('[data-action]').value.trim(),
        note: ''
      });
      UI.toast('점검 기록을 저장했습니다.');
      render(el);
    });

    UI.on(el, '[data-del]', 'click', function (e, btn) {
      Store.deletePatrol(btn.getAttribute('data-del'));
      UI.toast('삭제했습니다.');
      render(el);
    });

    el.querySelector('#manual').addEventListener('click', openManual);
  }

  function openManual() {
    var list = Store.students({ active: true });
    UI.modal({
      title: '순회 점검 직접 입력',
      body:
        '<div class="form-grid">' +
          '<label class="fld">학생<select id="m-stu">' +
            UI.options(list.map(function (s) { return { value: s.id, label: s.name + (s.seat ? ' (' + s.seat + '번)' : '') }; }), '', '학생 선택') +
          '</select></label>' +
          '<label class="fld">점검 시간<input type="datetime-local" id="m-at" value="' + U.nowLocalInput() + '"></label>' +
          '<label class="fld full">학생 상태<div class="chips" id="m-states">' +
            Store.PATROL_STATES.map(function (st) {
              var cls = Store.isIssue(st) ? 'warn' : 'mint';
              return '<button type="button" class="chip" data-state="' + U.esc(st) + '" data-cls="' + cls + '">' + U.esc(st) + '</button>';
            }).join('') + '</div></label>' +
          '<label class="fld full">조치사항<input type="text" id="m-action" placeholder="예: 휴대폰 보관함에 보관 안내"></label>' +
          '<label class="fld full">비고<textarea id="m-note"></textarea></label>' +
        '</div>',
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="m-save">저장</button>',
      onMount: function (w) {
        UI.on(w, '[data-state]', 'click', function (e, btn) {
          btn.classList.toggle('on');
          btn.classList.toggle(btn.getAttribute('data-cls'));
        });
        w.querySelector('#m-save').addEventListener('click', function () {
          var sid = w.querySelector('#m-stu').value;
          if (!sid) { UI.toast('학생을 선택해 주세요.', true); return; }
          var states = Array.prototype.slice.call(w.querySelectorAll('[data-state].on'))
            .map(function (b) { return b.getAttribute('data-state'); });
          if (!states.length) { UI.toast('학생 상태를 선택해 주세요.', true); return; }
          Store.savePatrol({
            studentId: sid,
            at: new Date(w.querySelector('#m-at').value).toISOString(),
            states: states,
            action: w.querySelector('#m-action').value.trim(),
            note: w.querySelector('#m-note').value.trim()
          });
          UI.close();
          UI.toast('저장했습니다.');
          App.rerender();
        });
      }
    });
  }

  return { title: title, sub: sub, render: render };
})();
