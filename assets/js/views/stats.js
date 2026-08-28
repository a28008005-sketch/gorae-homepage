/* ===== 통계 ===== */
window.Views = window.Views || {};
Views.stats = (function () {

  var month = U.ym(new Date());

  function title() { return '통계'; }
  function sub() { return month.replace('-', '년 ') + '월 기준 출석률 · 체크사항 집계'; }

  function range() {
    var days = U.daysInMonth(month);
    return { from: days[0], to: days[days.length - 1] };
  }

  function rowsData() {
    var r = range();
    return Store.students({ active: true }).map(function (s) {
      var sum = Store.summarize(s.id, r.from, r.to);
      return { s: s, sum: sum };
    });
  }

  function monthTotals(data) {
    var t = { present: 0, absent: 0, planner: 0, homework: 0, late: 0, out: 0, early: 0, issues: 0, marked: 0 };
    data.forEach(function (d) {
      t.present += d.sum.present; t.absent += d.sum.absent; t.marked += d.sum.total;
      t.planner += d.sum.planner; t.homework += d.sum.homework;
      t.late += d.sum.flags['지각']; t.out += d.sum.flags['외출']; t.early += d.sum.flags['조퇴'];
      t.issues += d.sum.patrolIssues;
    });
    return t;
  }

  /** 날짜별 출석률 추이 */
  function trend() {
    var days = U.daysInMonth(month).filter(function (d) { return d <= U.ymd(); });
    var rows = days.map(function (d) {
      var o = Store.dayOverview(d);
      return { date: d, rate: o.rate, marked: o.present + o.absent };
    }).filter(function (r) { return r.marked > 0; });

    if (!rows.length) return UI.emptyBox('이 달에 기록된 출결이 없습니다.', '📈');
    return rows.map(function (r) {
      return UI.bar(U.shortDate(r.date), r.rate, 100, '%');
    }).join('');
  }

  function render(el) {
    var data = rowsData();
    var t = monthTotals(data);
    var lowest = data.filter(function (d) { return d.sum.total > 0; })
      .sort(function (a, b) { return a.sum.rate - b.sum.rate; }).slice(0, 5);

    el.innerHTML =
      '<div class="card" style="margin-bottom:16px"><div class="card-b" style="padding:12px 16px">' +
        '<div class="row"><b style="font-size:13.5px">조회 기간</b>' +
          '<input type="month" id="month" value="' + month + '" style="width:170px">' +
          '<div class="sp"></div>' +
          '<button class="btn sm" id="csv">월간 통계 CSV</button>' +
        '</div></div></div>' +

      '<div class="grid g-4" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">전체 출석률</div><div class="val">' + U.pct(t.present, t.marked) + '<small>%</small></div>' +
          '<div class="sub">출석 ' + t.present + ' / 수업 ' + t.marked + '</div></div>' +
        '<div class="stat"><div class="lbl">결석</div><div class="val">' + t.absent + '<small>회</small></div>' +
          '<div class="sub">지각 ' + t.late + ' · 외출 ' + t.out + ' · 조퇴 ' + t.early + '</div></div>' +
        '<div class="stat"><div class="lbl">숙제 이행</div><div class="val">' + U.pct(t.homework, t.marked) + '<small>%</small></div>' +
          '<div class="sub">' + t.homework + '회 완료</div></div>' +
        '<div class="stat"><div class="lbl">순회 주의</div><div class="val">' + t.issues + '<small>건</small></div>' +
          '<div class="sub">졸음 · 이탈 · 휴대폰 등</div></div>' +
      '</div>' +

      '<div class="grid g-21" style="margin-bottom:16px">' +
        '<div class="card"><div class="card-h"><h2>학생별 출석률</h2></div><div class="card-b">' +
          (data.length ? data.slice().sort(function (a, b) { return b.sum.rate - a.sum.rate; })
            .map(function (d) { return UI.bar(d.s.name, d.sum.total ? d.sum.rate : 0, 100, '%'); }).join('')
            : UI.emptyBox('등록생이 없습니다.', '🧒')) +
        '</div></div>' +

        '<div class="card"><div class="card-h"><h2>관심이 필요한 학생</h2></div><div class="card-b">' +
          (lowest.length ? lowest.map(function (d) {
            return '<div class="memo-item"><div class="txt"><b>' + U.esc(d.s.name) + '</b>' +
              '<br><span style="font-size:12px;color:#63778a">출석률 ' + d.sum.rate + '% · 결석 ' + d.sum.absent +
              '회 · 지각 ' + d.sum.flags['지각'] + '회 · 순회 주의 ' + d.sum.patrolIssues + '건</span></div></div>';
          }).join('') : '<div class="hint">집계할 출결 기록이 없습니다.</div>') +
        '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>날짜별 출석률 추이</h2></div>' +
        '<div class="card-b">' + trend() + '</div></div>' +

      '<div class="card"><div class="card-h"><h2>학생별 상세 집계</h2></div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr><th>학생</th><th>학년</th><th class="num">수업</th><th class="num">출석</th><th class="num">결석</th>' +
          '<th class="num">출석률</th><th class="num">지각</th><th class="num">외출</th><th class="num">조퇴</th>' +
          '<th class="num">플래너</th><th class="num">숙제</th><th class="num">순회주의</th></tr></thead><tbody>' +
          (data.length ? data.map(function (d) {
            return '<tr class="clickable" data-open="' + d.s.id + '">' +
              '<td class="nm">' + U.esc(d.s.name) + '</td><td>' + U.esc(d.s.grade || '-') + '</td>' +
              '<td class="num">' + d.sum.total + '</td><td class="num">' + d.sum.present + '</td>' +
              '<td class="num">' + d.sum.absent + '</td><td class="num">' + (d.sum.total ? d.sum.rate + '%' : '-') + '</td>' +
              '<td class="num">' + d.sum.flags['지각'] + '</td><td class="num">' + d.sum.flags['외출'] + '</td>' +
              '<td class="num">' + d.sum.flags['조퇴'] + '</td><td class="num">' + d.sum.planner + '</td>' +
              '<td class="num">' + d.sum.homework + '</td><td class="num">' + d.sum.patrolIssues + '</td></tr>';
          }).join('') : '<tr><td colspan="12">' + UI.emptyBox('등록생이 없습니다.', '🧒') + '</td></tr>') +
        '</tbody></table></div></div>';

    el.querySelector('#month').addEventListener('change', function (e) {
      month = e.target.value || U.ym(new Date());
      App.setSub(sub());
      render(el);
    });

    UI.on(el, '[data-open]', 'click', function (e, tr) {
      Views.students.openDetail(tr.getAttribute('data-open'));
    });

    el.querySelector('#csv').addEventListener('click', function () {
      var head = ['학생', '학년', '수업일수', '출석', '결석', '출석률(%)', '지각', '외출', '조퇴', '플래너작성', '숙제완료', '순회주의'];
      var body = rowsData().map(function (d) {
        return [d.s.name, d.s.grade, d.sum.total, d.sum.present, d.sum.absent, d.sum.rate,
                d.sum.flags['지각'], d.sum.flags['외출'], d.sum.flags['조퇴'],
                d.sum.planner, d.sum.homework, d.sum.patrolIssues];
      });
      U.download('고래영어_월간통계_' + month + '.csv', U.toCsv([head].concat(body)), 'text/csv');
      UI.toast('CSV 파일을 내려받았습니다.');
    });
  }

  return { title: title, sub: sub, render: render };
})();
