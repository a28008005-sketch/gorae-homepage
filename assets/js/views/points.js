/* ===== 고래 포인트 =====
 *
 * 웨일리 보카 앱에서 하루 학습을 끝내면 워커가 포인트를 넣습니다(학생 기기는 포인트를 못 만듭니다).
 *  · 하루 학습 완료 8P, 그날 정답률 90% 이상이면 +2P, 7일 연속이면 +10P
 *  · 하루 한 번, 한 달 300P(3,000원)까지. 1P = 10원
 * 원장님은 마켓데이·고래카드로 바꿔 준 만큼 [사용 · 빼기]로 뺍니다. 빼면 앱 화면의 포인트도 줄어듭니다.
 * 규칙 숫자는 Store.POINT_RULES 와 워커의 POINT_RULES 가 같아야 합니다.
 */
window.Views = window.Views || {};
Views.points = (function () {

  var USES = ['고래카드 적립', '마켓데이', '기타'];
  var q = '';

  function R() { return Store.POINT_RULES; }
  function won(p) { return U.num((Number(p) || 0) * R().won) + '원'; }

  function title() { return '고래 포인트'; }
  function sub() { return '보카 앱 하루 학습으로 쌓이는 포인트 · 1P = ' + R().won + '원 · 한 달 최대 ' + R().monthCap + 'P'; }

  function rowsData() {
    var month = U.ymd().slice(0, 7);
    return Store.students({ active: true }).map(function (s) {
      return { s: s, sum: Store.pointSummary(s.id, month) };
    }).filter(function (d) {
      return !q || String(d.s.name || '').indexOf(q) >= 0;
    });
  }

  /* ---------- 빼기 · 적립 ---------- */
  function openChange(studentId, mode) {
    var s = Store.student(studentId);
    if (!s) return;
    var bal = Store.pointSummary(studentId).balance;
    var use = mode === 'use';
    UI.modal({
      title: s.name + ' · ' + (use ? '포인트 사용 (빼기)' : '포인트 직접 적립'),
      body:
        '<p class="hint" style="margin-top:0">지금 잔액 <b>' + U.num(bal) + 'P</b> (' + won(bal) + ')</p>' +
        '<div class="row" style="gap:8px;align-items:flex-end">' +
          '<label class="fld" style="flex:1">' + (use ? '뺄 포인트' : '더할 포인트') +
            '<input type="number" id="pt-amt" min="1" step="1" inputmode="numeric" placeholder="예: 100"></label>' +
          (use ? '<button class="btn" id="pt-all"' + (bal > 0 ? '' : ' disabled') + '>잔액 전부</button>' : '') +
        '</div>' +
        '<div class="hint" id="pt-won" style="margin:4px 0 10px">&nbsp;</div>' +
        (use
          ? '<label class="fld">어디에 썼나요<select id="pt-why">' + UI.options(USES, USES[0]) + '</select></label>'
          : '') +
        '<label class="fld">메모<input type="text" id="pt-memo" placeholder="' + (use ? '예: 10월 마켓데이' : '예: 수업 태도 칭찬') + '"></label>' +
        (use ? '' : '<p class="hint">직접 적립한 포인트는 한 달 최대 ' + R().monthCap + 'P 계산에 들어가지 않습니다.</p>'),
      footer: '<button class="btn" data-close>취소</button>' +
              '<button class="btn primary" id="pt-save">' + (use ? '빼기' : '적립') + '</button>',
      onMount: function (w) {
        var amt = w.querySelector('#pt-amt');
        function showWon() {
          var n = Math.round(Number(amt.value) || 0);
          w.querySelector('#pt-won').innerHTML = n > 0 ? '= ' + won(n) + (use ? ' · 빼고 나면 ' + U.num(bal - n) + 'P' : '') : '&nbsp;';
        }
        amt.addEventListener('input', showWon);
        if (use && w.querySelector('#pt-all')) {
          w.querySelector('#pt-all').addEventListener('click', function () { amt.value = bal; showWon(); });
        }
        setTimeout(function () { amt.focus(); }, 30);
        w.querySelector('#pt-save').addEventListener('click', function () {
          var n = Math.round(Number(amt.value) || 0);
          if (n <= 0) { UI.toast('포인트를 1 이상으로 적어 주세요.'); return; }
          if (use && n > bal) { UI.toast('잔액(' + U.num(bal) + 'P)보다 많이 뺄 수 없습니다.'); return; }
          var memo = w.querySelector('#pt-memo').value.trim();
          var why = use ? w.querySelector('#pt-why').value : '직접 적립';
          Store.savePoint({
            studentId: studentId,
            amount: use ? -n : n,
            reason: why + (memo ? ' · ' + memo : ''),
            source: 'staff'
          });
          UI.close();
          UI.toast(s.name + ' ' + (use ? n + 'P를 뺐습니다.' : n + 'P를 적립했습니다.'));
          App.rerender();
        });
      }
    });
  }

  /** 잔액이 있는 학생 모두를 한 번에 고래카드로 옮깁니다 (월말 정리용) */
  function openBulk() {
    var list = rowsData().filter(function (d) { return d.sum.balance > 0; });
    if (!list.length) { UI.toast('잔액이 남은 학생이 없습니다.'); return; }
    var total = list.reduce(function (a, d) { return a + d.sum.balance; }, 0);
    UI.confirm(
      '<b>' + list.length + '명</b>의 잔액 <b>' + U.num(total) + 'P</b>(' + won(total) + ')를 모두 고래카드로 옮긴 것으로 처리합니다.<br>' +
      '학생별로 <b>고래카드 적립</b> 기록이 남고, 앱의 포인트는 0이 됩니다.',
      function () {
        list.forEach(function (d) {
          Store.savePoint({ studentId: d.s.id, amount: -d.sum.balance, reason: '고래카드 적립 · 한 번에 옮김', source: 'staff' });
        });
        UI.toast(list.length + '명 · ' + U.num(total) + 'P를 고래카드로 옮겼습니다.');
        App.rerender();
      },
      { title: '잔액 전부 고래카드로', yes: '옮기기' });
  }

  function openHistory(studentId) {
    var s = Store.student(studentId);
    if (!s) return;
    function body() {
      var list = Store.points({ studentId: studentId });
      var sum = Store.pointSummary(studentId);
      return '<p class="hint" style="margin-top:0">잔액 <b>' + U.num(sum.balance) + 'P</b> (' + won(sum.balance) + ')</p>' +
        (list.length
          ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>내용</th><th style="text-align:right">포인트</th><th></th></tr></thead><tbody>' +
            list.map(function (p) {
              var n = Number(p.amount) || 0;
              return '<tr><td>' + U.esc(p.date || '') + '</td>' +
                '<td>' + U.esc(p.reason || (p.source === 'whaley-voca' ? '보카 하루 학습' : '')) + '</td>' +
                '<td style="text-align:right;font-weight:700;color:' + (n < 0 ? 'var(--danger,#d14343)' : 'var(--ok,#1a8a4a)') + '">' +
                  (n > 0 ? '+' : '') + U.num(n) + 'P</td>' +
                '<td>' + (p.source === 'staff' ? '<button class="btn sm ghost" data-undo="' + U.esc(p.id) + '">지우기</button>' : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : UI.emptyBox('아직 포인트 기록이 없습니다.', 'coin'));
    }
    UI.modal({
      title: s.name + ' · 포인트 내역',
      wide: true,
      body: '<div id="pt-hist">' + body() + '</div>',
      onMount: function (w) {
        UI.on(w, '[data-undo]', 'click', function (e, btn) {
          // 잘못 누른 사용·적립만 지울 수 있습니다. 앱이 넣은 적립은 지우지 않습니다.
          Store.deletePoint(btn.getAttribute('data-undo'));
          w.querySelector('#pt-hist').innerHTML = body();
          UI.toast('그 기록을 지웠습니다.');
          App.rerender();
        });
      }
    });
  }

  function render(el) {
    var month = U.ymd().slice(0, 7);
    var data = rowsData();
    var t = data.reduce(function (a, d) {
      a.balance += d.sum.balance; a.earned += d.sum.earned; a.used += d.sum.used;
      if (d.sum.earned > 0) a.kids++;
      return a;
    }, { balance: 0, earned: 0, used: 0, kids: 0 });
    var avg = t.kids ? Math.round(t.earned / t.kids) : 0;
    var r = R();

    el.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 16px">' +
        '<div class="row">' +
          '<input type="search" id="pt-q" placeholder="학생 이름 찾기" value="' + U.esc(q) + '" style="max-width:220px">' +
          '<div class="sp"></div>' +
          '<button class="btn primary" id="pt-bulk">잔액 전부 고래카드로</button>' +
        '</div>' +
        '<p class="hint" style="margin:10px 0 0">보카 앱 <b>하루 학습 완료 ' + r.day + 'P</b> · 정답률 ' + r.highPct + '% 이상 <b>+' + r.high + 'P</b> · ' +
          r.streak + '일 연속 <b>+' + r.streakBonus + 'P</b> · 하루 한 번 · 한 달 최대 <b>' + r.monthCap + 'P(' + won(r.monthCap) + ')</b>. ' +
          '마켓데이·고래카드로 바꿔 주면 <b>[사용 · 빼기]</b>로 빼 주세요. 앱 화면의 포인트도 함께 줄어듭니다.</p>' +
      '</div></div>' +

      '<div class="grid g-4" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">남은 포인트 합계</div><div class="val">' + U.num(t.balance) + '<small>P</small></div>' +
          '<div class="sub">' + won(t.balance) + '</div></div>' +
        '<div class="stat"><div class="lbl">이번 달 적립</div><div class="val">' + U.num(t.earned) + '<small>P</small></div>' +
          '<div class="sub">' + month.replace('-', '년 ') + '월 · ' + won(t.earned) + '</div></div>' +
        '<div class="stat"><div class="lbl">학생 1명 평균</div><div class="val">' + U.num(avg) + '<small>P</small></div>' +
          '<div class="sub">이번 달 적립한 ' + t.kids + '명 기준 · ' + won(avg) + '</div></div>' +
        '<div class="stat"><div class="lbl">이번 달 사용</div><div class="val">' + U.num(t.used) + '<small>P</small></div>' +
          '<div class="sub">' + won(t.used) + '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-h"><h2>학생별 포인트</h2></div><div class="card-b">' +
        (data.length
          ? '<div class="table-wrap"><table class="tbl"><thead><tr>' +
              '<th>학생</th><th>학년</th><th style="text-align:right">잔액</th><th>이번 달 적립</th><th>마지막 적립</th><th></th>' +
            '</tr></thead><tbody>' +
            data.map(function (d) {
              var s = d.s, m = d.sum;
              return '<tr>' +
                '<td><b>' + U.esc(s.name) + '</b></td>' +
                '<td>' + U.esc(s.grade || '') + '</td>' +
                '<td style="text-align:right"><b>' + U.num(m.balance) + 'P</b><div class="hint" style="margin:0">' + won(m.balance) + '</div></td>' +
                '<td>' + U.num(m.earned) + ' / ' + r.monthCap + 'P' + (m.earned >= r.monthCap ? ' <span class="tag">이번 달 다 받음</span>' : '') + '</td>' +
                '<td>' + U.esc(m.lastEarned || '-') + '</td>' +
                '<td style="white-space:nowrap;text-align:right">' +
                  '<button class="btn sm primary" data-use="' + U.esc(s.id) + '"' + (m.balance > 0 ? '' : ' disabled') + '>사용 · 빼기</button> ' +
                  '<button class="btn sm" data-add="' + U.esc(s.id) + '">적립</button> ' +
                  '<button class="btn sm ghost" data-hist="' + U.esc(s.id) + '">내역</button>' +
                '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : UI.emptyBox(q ? '찾는 학생이 없습니다.' : '등록생이 없습니다.', 'students')) +
      '</div></div>';

    el.querySelector('#pt-q').addEventListener('input', function (e) {
      q = e.target.value.trim();
      var pos = e.target.selectionStart;
      render(el);
      var box = el.querySelector('#pt-q');
      box.focus(); try { box.setSelectionRange(pos, pos); } catch (x) { /* 무시 */ }
    });
    el.querySelector('#pt-bulk').addEventListener('click', openBulk);
    UI.on(el, '[data-use]', 'click', function (e, b) { openChange(b.getAttribute('data-use'), 'use'); });
    UI.on(el, '[data-add]', 'click', function (e, b) { openChange(b.getAttribute('data-add'), 'add'); });
    UI.on(el, '[data-hist]', 'click', function (e, b) { openHistory(b.getAttribute('data-hist')); });
  }

  return { title: title, sub: sub, render: render };
})();
