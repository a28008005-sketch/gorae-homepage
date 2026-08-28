/* ===== 좌석 배치도 ===== */
window.Views = window.Views || {};
Views.seats = (function () {

  function title() { return '좌석 배치'; }
  function sub() { return '오늘 출결 상태가 좌석 색상으로 표시됩니다'; }

  function cellClass(s) {
    if (!s) return 'empty-seat';
    var r = Store.attendanceFor(s.id, U.ymd());
    if (!r || !r.status) return '';
    if (r.status === '결석') return 'att-absent';
    if ((r.flags || []).length) return 'att-late';
    return 'att-present';
  }

  function grid() {
    var ac = Store.get().academy;
    var map = Store.seatMap();
    var out = '';
    for (var i = 1; i <= ac.seatCount; i++) {
      var s = map[String(i)];
      out += '<div class="seat-cell ' + cellClass(s) + '" data-seat="' + i + '">' +
        '<span class="no">' + i + '</span>' +
        '<div class="who">' + (s ? U.esc(s.name) : '빈 좌석') + '</div>' +
        '<div class="meta">' + (s ? U.esc(s.grade || '') + (s.time ? ' · ' + U.esc(s.time) : '') : '클릭해서 배정') + '</div>' +
      '</div>';
    }
    return out;
  }

  function assign(seatNo) {
    var map = Store.seatMap();
    var cur = map[String(seatNo)];
    var free = Store.students({ active: true }).filter(function (s) { return !s.seat; });

    UI.modal({
      title: seatNo + '번 좌석',
      body:
        (cur ? '<p style="margin:0 0 14px">현재 <b>' + U.esc(cur.name) + '</b> 학생이 사용 중입니다.</p>' : '') +
        '<label class="fld">배정할 학생' +
          '<select id="s-stu">' +
            '<option value="">— 비우기 —</option>' +
            (cur ? '<option value="' + cur.id + '" selected>' + U.esc(cur.name) + ' (현재)</option>' : '') +
            free.map(function (s) {
              return '<option value="' + s.id + '">' + U.esc(s.name) + ' · ' + U.esc(s.grade || '') + '</option>';
            }).join('') +
          '</select></label>' +
        (free.length ? '' : '<p class="hint" style="margin-top:10px">좌석이 없는 등록생이 없습니다. 다른 학생을 옮기려면 그 학생의 좌석을 먼저 비워 주세요.</p>'),
      footer: '<button class="btn" data-close>취소</button><button class="btn primary" id="s-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#s-save').addEventListener('click', function () {
          var pick = w.querySelector('#s-stu').value;
          if (cur && cur.id !== pick) Store.saveStudent({ id: cur.id, seat: '' });
          if (pick) Store.saveStudent({ id: pick, seat: String(seatNo) });
          UI.close();
          UI.toast('좌석을 저장했습니다.');
          App.rerender();
        });
      }
    });
  }

  function render(el) {
    var ac = Store.get().academy;
    var active = Store.students({ active: true });
    var noSeat = active.filter(function (s) { return !s.seat; });

    el.innerHTML =
      '<div class="grid g-21">' +
        '<div class="card"><div class="card-h"><h2>좌석 배치도</h2><div class="sp"></div>' +
          '<span class="hint">🟩 출석 · 🟨 지각/외출 · 🟥 결석</span></div>' +
          '<div class="card-b"><div class="seat-grid">' + grid() + '</div></div></div>' +

        '<div class="stack">' +
          '<div class="card"><div class="card-h"><h2>좌석 미배정</h2></div>' +
            '<div class="card-b">' +
              (noSeat.length ? noSeat.map(function (s) {
                return '<div class="memo-item"><div class="txt"><b>' + U.esc(s.name) + '</b> ' +
                  '<span class="gr" style="font-size:12px;color:#63778a">' + U.esc(s.grade || '') + '</span></div></div>';
              }).join('') : '<div class="hint">모든 등록생에게 좌석이 배정되어 있습니다.</div>') +
            '</div></div>' +

          '<div class="card"><div class="card-h"><h2>좌석 수 설정</h2></div>' +
            '<div class="card-b">' +
              '<div class="row"><input type="number" id="seat-n" min="1" max="60" value="' + ac.seatCount + '" style="width:100px">' +
              '<button class="btn" id="seat-save">적용</button></div>' +
              '<p class="hint" style="margin:10px 0 0">좌석 수를 줄이면 범위를 벗어난 학생의 좌석 배정이 해제됩니다.</p>' +
            '</div></div>' +
        '</div>' +
      '</div>';

    UI.on(el, '[data-seat]', 'click', function (e, cell) {
      assign(+cell.getAttribute('data-seat'));
    });

    el.querySelector('#seat-save').addEventListener('click', function () {
      var n = parseInt(el.querySelector('#seat-n').value, 10);
      if (!n || n < 1 || n > 60) { UI.toast('1~60 사이로 입력해 주세요.', true); return; }
      Store.students({ includeArchived: true }).forEach(function (s) {
        if (s.seat && +s.seat > n) Store.saveStudent({ id: s.id, seat: '' });
      });
      Store.saveAcademy({ seatCount: n });
      UI.toast('좌석 수를 ' + n + '석으로 변경했습니다.');
      render(el);
    });
  }

  return { title: title, sub: sub, render: render };
})();
