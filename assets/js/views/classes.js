/* ===== 수업 시간표 (요일 × 시간 반편성 보드) ===== */
window.Views = window.Views || {};
Views.classes = (function () {

  function title() { return '수업 시간표'; }
  function sub() { return '요일 · 시간대별 소수정예 반편성 현황'; }

  function board() {
    var ac = Store.get().academy;
    var active = Store.students({ active: true });
    var out = '<div class="tt"><div class="hd"></div>' +
      Store.WEEKDAYS.slice(0, 5).map(function (d) { return '<div class="hd">' + d + '요일</div>'; }).join('');

    ac.times.forEach(function (t) {
      out += '<div class="tm">' + U.esc(t) + '</div>';
      Store.WEEKDAYS.slice(0, 5).forEach(function (d) {
        var members = active.filter(function (s) {
          return s.time === t && (s.days || []).indexOf(d) >= 0;
        });
        out += '<div class="cell">' + members.map(function (s) {
          return '<span class="pill" data-open="' + s.id + '" style="cursor:pointer">' +
            U.esc(s.name) + (s.grade ? ' · ' + U.esc(s.grade.replace('학년', '')) : '') + '</span>';
        }).join('') + '</div>';
      });
    });
    return out + '</div>';
  }

  function byGrade() {
    var active = Store.students({ active: true });
    var groups = {};
    active.forEach(function (s) {
      var g = s.grade || '미지정';
      (groups[g] = groups[g] || []).push(s);
    });
    var keys = Store.GRADES.concat(['미지정']).filter(function (g) { return groups[g]; });
    if (!keys.length) return UI.emptyBox('등록생이 없습니다.', '🧒');
    return '<div class="grid g-3">' + keys.map(function (g) {
      return '<div><div class="section-title" style="margin-top:0">' + U.esc(g) + ' · ' + groups[g].length + '명</div>' +
        groups[g].map(function (s) {
          return '<div class="memo-item"><div class="txt clickable" data-open="' + s.id + '"><b>' + U.esc(s.name) + '</b> ' +
            '<span style="font-size:12px;color:#63778a">' + U.esc((s.days || []).join('·')) +
            (s.time ? ' / ' + U.esc(s.time) : '') + '</span></div></div>';
        }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function render(el) {
    el.innerHTML =
      '<div class="stack">' +
        '<div class="card"><div class="card-h"><h2>요일 · 시간별 출석부</h2><div class="sp"></div>' +
          '<span class="hint">학생 이름을 누르면 상세 정보가 열립니다</span></div>' +
          '<div class="card-b" style="overflow-x:auto">' + board() + '</div></div>' +
        '<div class="card"><div class="card-h"><h2>학년별 출석부</h2></div>' +
          '<div class="card-b">' + byGrade() + '</div></div>' +
      '</div>';

    UI.on(el, '[data-open]', 'click', function (e, node) {
      Views.students.openDetail(node.getAttribute('data-open'));
    });
  }

  return { title: title, sub: sub, render: render };
})();
