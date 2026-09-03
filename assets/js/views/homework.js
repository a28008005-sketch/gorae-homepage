/* ===== 숙제 관리 ===== */
window.Views = window.Views || {};
Views.homework = (function () {

  var scope = 'open';   // open = 진행중, all = 전체

  function title() { return '숙제 관리'; }
  function sub() {
    var open = Store.homeworks({ open: true }).length;
    return '진행 중인 숙제 ' + open + '건';
  }

  function list() {
    return scope === 'open' ? Store.homeworks({ open: true }) : Store.homeworks();
  }

  /* ---------- 숙제 카드 ---------- */
  function card(h) {
    var pr = Store.homeworkProgress(h.id);
    var c = h.classId ? Store.klass(h.classId) : null;
    var overdue = h.dueDate && h.dueDate < U.ymd();
    var pending = pr.list.filter(function (x) { return x.status === '미제출'; })
      .map(function (x) { return Store.student(x.studentId); })
      .filter(Boolean);

    return '<div class="hw-card" style="--klass:' + U.esc(c && c.color ? c.color : '#1a7fd4') + '">' +
      '<div class="hw-top">' +
        '<div>' +
          '<div class="hw-title">' + U.esc(h.title) + '</div>' +
          '<div class="hw-meta">' +
            '<span class="tag gray">' + U.esc(h.type || '기타') + '</span> ' +
            (c ? U.esc(c.name) : '개별 지정') +
            ' · 낸 날 ' + U.esc(h.assignedDate || '-') +
            (h.dueDate ? ' · 마감 ' + U.esc(h.dueDate) : '') +
            (overdue ? ' <span class="tag bad">마감 지남</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="hw-rate"><b>' + pr.rate + '%</b><span>' + pr.done + '/' + pr.total + '</span></div>' +
      '</div>' +
      '<div class="bar-track"><div class="bar-fill' + (pr.rate < 60 ? ' low' : '') + '" style="width:' + pr.rate + '%"></div></div>' +
      (h.note ? '<div class="class-note">' + U.esc(h.note) + '</div>' : '') +
      (pending.length
        ? '<div class="hw-pending"><span class="att-label">미제출</span>' +
            pending.slice(0, 8).map(function (s) {
              return '<span class="pill" data-open="' + s.id + '">' + U.esc(s.name) + '</span>';
            }).join('') +
            (pending.length > 8 ? '<span class="hint">외 ' + (pending.length - 8) + '명</span>' : '') +
          '</div>'
        : '<div class="hw-pending"><span class="tag ok">모두 제출했습니다</span></div>') +
      '<div class="class-actions">' +
        '<button class="btn sm primary" data-check="' + h.id + '">제출 체크</button>' +
        '<button class="btn sm ghost" data-edit="' + h.id + '">수정</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 숙제 내기 ---------- */
  function openForm(id) {
    var h = id ? Store.homework(id) : null;
    var cs = Store.classes();

    UI.modal({
      title: h ? '숙제 수정' : '숙제 내기',
      body:
        '<div class="form-grid">' +
          '<label class="fld full">숙제 내용 *<input type="text" id="h-title" value="' + U.esc(h ? h.title : '') +
            '" placeholder="예: Unit 3 단어 20개 외우기"></label>' +
          '<label class="fld">종류<select id="h-type">' + UI.options(Store.HOMEWORK_TYPES, h ? h.type : '단어') + '</select></label>' +
          '<label class="fld">대상 반<select id="h-class">' +
            '<option value="">전체 등록생</option>' +
            cs.map(function (c) {
              return '<option value="' + c.id + '"' + (h && h.classId === c.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>';
            }).join('') + '</select></label>' +
          '<label class="fld">낸 날<input type="date" id="h-assigned" value="' + U.esc(h && h.assignedDate ? h.assignedDate : U.ymd()) + '"></label>' +
          '<label class="fld">마감일<input type="date" id="h-due" value="' + U.esc(h && h.dueDate ? h.dueDate : U.daysAgo(-7)) + '"></label>' +
          '<label class="fld full">메모<input type="text" id="h-note" value="' + U.esc(h && h.note ? h.note : '') + '" placeholder="교재 쪽수, 제출 방법 등"></label>' +
        '</div>' +
        (h ? '' : '<p class="hint" style="margin-top:12px">저장하면 대상 학생 전원에게 제출 칸이 만들어집니다.</p>'),
      footer: (h ? '<button class="btn danger" id="h-del">삭제</button><div class="sp"></div>' : '') +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="h-save">저장</button>',
      onMount: function (w) {
        w.querySelector('#h-save').addEventListener('click', function () {
          var t = w.querySelector('#h-title').value.trim();
          if (!t) { UI.toast('숙제 내용을 입력해 주세요.', true); return; }
          var classId = w.querySelector('#h-class').value;
          var targets = classId ? null : Store.students({ active: true }).map(function (s) { return s.id; });
          Store.saveHomework({
            id: h ? h.id : null,
            title: t,
            type: w.querySelector('#h-type').value,
            classId: classId,
            assignedDate: w.querySelector('#h-assigned').value,
            dueDate: w.querySelector('#h-due').value,
            note: w.querySelector('#h-note').value.trim()
          }, targets);
          UI.close();
          UI.toast(h ? '수정했습니다.' : '숙제를 냈습니다.');
          App.rerender();
        });
        if (h) {
          w.querySelector('#h-del').addEventListener('click', function () {
            UI.close();
            UI.confirm('이 숙제와 제출 기록을 삭제할까요?', function () {
              Store.deleteHomework(h.id);
              UI.toast('삭제했습니다.');
              App.rerender();
            }, { danger: true, yes: '삭제' });
          });
        }
      }
    });
  }

  /* ---------- 제출 체크 ---------- */
  function openCheck(id) {
    var h = Store.homework(id);
    if (!h) return;

    function rows() {
      return Store.submissions({ homeworkId: id }).map(function (x) {
        var s = Store.student(x.studentId);
        if (!s) return '';
        return '<div class="sub-row" data-sid="' + s.id + '">' +
          '<span class="member-name">' + U.esc(s.name) + '</span>' +
          '<div class="seg">' +
            Store.SUBMIT_STATUS.map(function (st) {
              return '<button data-status="' + st + '" class="' + (x.status === st ? 'on' : '') + '">' + st + '</button>';
            }).join('') +
          '</div>' +
          '<input type="text" class="mini-note" data-note placeholder="점수 · 메모" value="' + U.esc(x.note || '') + '" style="max-width:220px">' +
        '</div>';
      }).join('');
    }

    UI.modal({
      title: h.title, wide: true,
      body: '<div id="sub-rows">' + (Store.submissions({ homeworkId: id }).length
        ? rows() : UI.emptyBox('대상 학생이 없습니다.', '🧒')) + '</div>',
      footer: '<button class="btn" id="sc-all">전원 제출 처리</button><div class="sp"></div>' +
              '<button class="btn primary" data-close>닫기</button>',
      onMount: function (w) {
        function refresh() { w.querySelector('#sub-rows').innerHTML = rows(); }
        UI.on(w, '[data-status]', 'click', function (e, btn) {
          var sid = btn.closest('[data-sid]').getAttribute('data-sid');
          var st = btn.getAttribute('data-status');
          Store.setSubmission(id, sid, {
            status: st,
            submittedAt: st === '미제출' ? '' : U.ymd()
          });
          refresh();
          App.rerender();
        });
        UI.on(w, '[data-note]', 'change', function (e, input) {
          var sid = input.closest('[data-sid]').getAttribute('data-sid');
          Store.setSubmission(id, sid, { note: input.value });
          UI.toast('메모를 저장했습니다.');
        });
        w.querySelector('#sc-all').addEventListener('click', function () {
          Store.submissions({ homeworkId: id }).forEach(function (x) {
            if (x.status === '미제출') Store.setSubmission(id, x.studentId, { status: '제출', submittedAt: U.ymd() });
          });
          refresh();
          App.rerender();
          UI.toast('전원 제출 처리했습니다.');
        });
      }
    });
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    var all = Store.homeworks();
    var open = Store.homeworks({ open: true });
    var totalPending = 0, totalTargets = 0;
    open.forEach(function (h) {
      var pr = Store.homeworkProgress(h.id);
      totalPending += (pr.total - pr.done);
      totalTargets += pr.total;
    });

    el.innerHTML =
      '<div class="grid g-3" style="margin-bottom:16px">' +
        '<div class="stat accent"><div class="lbl">진행 중 숙제</div><div class="val">' + open.length + '<small>건</small></div>' +
          '<div class="sub">전체 ' + all.length + '건</div></div>' +
        '<div class="stat"><div class="lbl">제출률</div><div class="val">' + U.pct(totalTargets - totalPending, totalTargets) + '<small>%</small></div>' +
          '<div class="sub">진행 중 숙제 기준</div></div>' +
        '<div class="stat"><div class="lbl">미제출</div><div class="val" style="color:' + (totalPending ? '#d5453f' : 'inherit') + '">' +
          totalPending + '<small>건</small></div><div class="sub">학생 × 숙제</div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-h"><h2>숙제 목록</h2><div class="sp"></div>' +
          '<div class="seg">' +
            '<button id="sc-open" class="' + (scope === 'open' ? 'on' : '') + '">진행 중</button>' +
            '<button id="sc-allhw" class="' + (scope === 'all' ? 'on' : '') + '">전체</button>' +
          '</div>' +
          '<button class="btn primary" id="add">+ 숙제 내기</button></div>' +
        '<div class="card-b">' +
          (list().length
            ? '<div class="class-grid">' + list().map(card).join('') + '</div>'
            : UI.emptyBox(scope === 'open'
                ? '진행 중인 숙제가 없습니다. [+ 숙제 내기]로 시작하세요.'
                : '아직 낸 숙제가 없습니다.', '📚')) +
        '</div>' +
      '</div>';

    el.querySelector('#add').addEventListener('click', function () { openForm(null); });
    el.querySelector('#sc-open').addEventListener('click', function () { scope = 'open'; render(el); });
    el.querySelector('#sc-allhw').addEventListener('click', function () { scope = 'all'; render(el); });
    UI.on(el, '[data-edit]', 'click', function (e, b) { openForm(b.getAttribute('data-edit')); });
    UI.on(el, '[data-check]', 'click', function (e, b) { openCheck(b.getAttribute('data-check')); });
    UI.on(el, '[data-open]', 'click', function (e, b) { Views.students.openDetail(b.getAttribute('data-open')); });
  }

  return { title: title, sub: sub, render: render };
})();
