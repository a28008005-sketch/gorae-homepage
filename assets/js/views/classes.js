/* ===== 반(클래스) 관리 · 수업 시간표 ===== */
window.Views = window.Views || {};
Views.classes = (function () {

  function title() { return '반 · 시간표'; }
  function sub() {
    var cs = Store.classes();
    var assigned = Store.students({ active: true }).filter(function (s) { return s.classId; }).length;
    return '반 ' + cs.length + '개 · 배정된 학생 ' + assigned + '명';
  }

  /* ---------- 반 카드 ---------- */
  function classCard(c) {
    var members = Store.studentsInClass(c.id);
    var full = c.capacity && members.length >= c.capacity;
    return '<div class="class-card" style="--klass:' + U.esc(c.color || '#1a7fd4') + '">' +
      '<div class="class-top">' +
        '<div>' +
          '<div class="class-name">' + U.esc(c.name) + '</div>' +
          '<div class="class-meta">' +
            (c.days && c.days.length ? U.esc(c.days.join('·')) : '요일 미정') +
            (c.time ? ' · ' + U.esc(c.time) : '') +
            (c.teacher ? ' · ' + U.esc(c.teacher) : '') +
          '</div>' +
        '</div>' +
        '<span class="tag ' + (full ? 'warn' : 'gray') + '">' + members.length +
          (c.capacity ? '/' + c.capacity : '') + '명</span>' +
      '</div>' +
      (c.note ? '<div class="class-note">' + U.esc(c.note) + '</div>' : '') +
      '<div class="class-members">' +
        (members.length
          ? members.map(function (s) {
              return '<span class="pill" data-open="' + s.id + '">' + U.esc(s.name) +
                (s.grade ? ' · ' + U.esc(s.grade.replace('학년', '')) : '') + '</span>';
            }).join('')
          : '<span class="hint">배정된 학생이 없습니다.</span>') +
      '</div>' +
      '<div class="class-actions">' +
        '<button class="btn sm" data-members="' + c.id + '">학생 배정</button>' +
        '<button class="btn sm ghost" data-edit="' + c.id + '">반 수정</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 주간 시간표 ---------- */
  function board() {
    var ac = Store.get().academy;
    var cs = Store.classes();
    var days = Store.WEEKDAYS.slice(0, 6);

    var out = '<div class="tt" style="grid-template-columns:74px repeat(' + days.length + ',1fr)">' +
      '<div class="hd"></div>' +
      days.map(function (d) { return '<div class="hd">' + d + '</div>'; }).join('');

    ac.times.forEach(function (t) {
      out += '<div class="tm">' + U.esc(t) + '</div>';
      days.forEach(function (d) {
        var here = cs.filter(function (c) {
          return c.time === t && (c.days || []).indexOf(d) >= 0;
        });
        out += '<div class="cell">' + here.map(function (c) {
          var n = Store.studentsInClass(c.id).length;
          return '<button class="tt-block" data-edit="' + c.id + '" ' +
            'style="--klass:' + U.esc(c.color || '#1a7fd4') + '">' +
            '<b>' + U.esc(c.name) + '</b><span>' + n + '명' +
            (c.teacher ? ' · ' + U.esc(c.teacher) : '') + '</span></button>';
        }).join('') + '</div>';
      });
    });
    return out + '</div>';
  }

  /* ---------- 반 만들기 / 수정 ---------- */
  function openClassForm(id) {
    var c = id ? Store.klass(id) : null;
    var ac = Store.get().academy;
    var colors = Store.CLASS_COLORS;
    var cur = (c && c.color) || colors[Store.classes().length % colors.length];

    UI.modal({
      title: c ? U.esc(c.name) + ' 반 수정' : '반 만들기',
      body:
        '<div class="form-grid">' +
          '<label class="fld">반 이름 *<input type="text" id="k-name" value="' + U.esc(c ? c.name : '') + '" placeholder="예: 파닉스 A반"></label>' +
          '<label class="fld">수업 시간<select id="k-time">' + UI.options(ac.times, c ? c.time : '', '선택 안 함') + '</select></label>' +
          '<label class="fld full">수업 요일' +
            '<div class="chips" id="k-days">' + Store.WEEKDAYS.map(function (d) {
              var on = c && (c.days || []).indexOf(d) >= 0;
              return '<button type="button" class="chip' + (on ? ' on blue' : '') + '" data-day="' + d + '">' + d + '</button>';
            }).join('') + '</div></label>' +
          '<label class="fld">담당 선생님<input type="text" id="k-teacher" value="' + U.esc(c && c.teacher ? c.teacher : '') + '" placeholder="예: 김선생"></label>' +
          '<label class="fld">정원 <span style="font-weight:400">(비우면 제한 없음)</span>' +
            '<input type="number" id="k-cap" min="1" max="40" value="' + (c && c.capacity ? c.capacity : '') + '" placeholder="예: 6"></label>' +
          '<label class="fld full">반 색상' +
            '<div class="chips" id="k-colors">' + colors.map(function (col) {
              return '<button type="button" class="swatch' + (col === cur ? ' on' : '') + '" data-color="' + col + '" ' +
                'style="background:' + col + '" aria-label="' + col + '"></button>';
            }).join('') + '</div></label>' +
          '<label class="fld full">메모<input type="text" id="k-note" value="' + U.esc(c && c.note ? c.note : '') + '" placeholder="교재, 진도 등"></label>' +
        '</div>',
      footer: (c ? '<button class="btn danger" id="k-del">반 삭제</button><div class="sp"></div>' : '') +
        '<button class="btn" data-close>취소</button><button class="btn primary" id="k-save">저장</button>',
      onMount: function (w) {
        var days = (c && c.days ? c.days.slice() : []);
        var color = cur;
        UI.on(w, '[data-day]', 'click', function (e, btn) {
          var d = btn.getAttribute('data-day');
          var i = days.indexOf(d);
          if (i >= 0) { days.splice(i, 1); btn.classList.remove('on', 'blue'); }
          else { days.push(d); btn.classList.add('on', 'blue'); }
        });
        UI.on(w, '[data-color]', 'click', function (e, btn) {
          color = btn.getAttribute('data-color');
          w.querySelectorAll('.swatch').forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
        });
        w.querySelector('#k-save').addEventListener('click', function () {
          var name = w.querySelector('#k-name').value.trim();
          if (!name) { UI.toast('반 이름을 입력해 주세요.', true); return; }
          var cap = w.querySelector('#k-cap').value;
          Store.saveClass({
            id: c ? c.id : null,
            name: name,
            days: days,
            time: w.querySelector('#k-time').value,
            teacher: w.querySelector('#k-teacher').value.trim(),
            capacity: cap === '' ? '' : Number(cap),
            color: color,
            note: w.querySelector('#k-note').value.trim()
          });
          UI.close();
          UI.toast(c ? '반 정보를 수정했습니다.' : name + ' 반을 만들었습니다.');
          App.rerender();
        });
        if (c) {
          w.querySelector('#k-del').addEventListener('click', function () {
            var n = Store.studentsInClass(c.id).length;
            UI.close();
            UI.confirm('<b>' + U.esc(c.name) + '</b> 반을 삭제할까요?<br>' +
              '<span style="font-size:13px;color:#63778a">' +
              (n ? '소속 학생 ' + n + '명은 반 미배정 상태가 되고, 출결·수강료 기록은 그대로 남습니다.'
                 : '소속 학생이 없어 다른 기록에는 영향이 없습니다.') + '</span>',
              function () {
                Store.deleteClass(c.id);
                UI.toast('반을 삭제했습니다.');
                App.rerender();
              }, { danger: true, yes: '삭제' });
          });
        }
      }
    });
  }

  /* ---------- 학생 배정 ---------- */
  function openMembers(id) {
    var c = Store.klass(id);
    if (!c) return;
    var all = Store.students({ active: true });

    UI.modal({
      title: U.esc(c.name) + ' 학생 배정',
      wide: true,
      body:
        '<p class="hint" style="margin-top:0">이 반에 넣을 학생을 고르세요. 다른 반에 있던 학생을 고르면 이 반으로 옮겨집니다.</p>' +
        '<div class="member-list">' +
          (all.length ? all.map(function (s) {
            var other = s.classId && s.classId !== c.id ? Store.klass(s.classId) : null;
            return '<label class="member-row">' +
              '<input type="checkbox" class="cbx" data-stu="' + s.id + '"' + (s.classId === c.id ? ' checked' : '') + '>' +
              '<span class="member-name">' + U.esc(s.name) + '</span>' +
              '<span class="hint">' + U.esc(s.grade || '') + '</span>' +
              (other ? '<span class="tag gray">' + U.esc(other.name) + '</span>' : '') +
            '</label>';
          }).join('') : UI.emptyBox('등록생이 없습니다.', '🧒')) +
        '</div>',
      footer: '<span class="hint" id="m-count"></span><div class="sp"></div>' +
              '<button class="btn" data-close>취소</button><button class="btn primary" id="m-save">저장</button>',
      onMount: function (w) {
        function refreshCount() {
          var n = w.querySelectorAll('[data-stu]:checked').length;
          w.querySelector('#m-count').textContent = n + '명 선택' +
            (c.capacity ? ' · 정원 ' + c.capacity + '명' : '');
        }
        refreshCount();
        UI.on(w, '[data-stu]', 'change', refreshCount);
        w.querySelector('#m-save').addEventListener('click', function () {
          all.forEach(function (s) {
            var box = w.querySelector('[data-stu="' + s.id + '"]');
            if (!box) return;
            if (box.checked && s.classId !== c.id) Store.saveStudent({ id: s.id, classId: c.id });
            else if (!box.checked && s.classId === c.id) Store.saveStudent({ id: s.id, classId: '' });
          });
          UI.close();
          UI.toast('학생 배정을 저장했습니다.');
          App.rerender();
        });
      }
    });
  }

  /* ---------- 기존 시간표로 반 자동 만들기 ---------- */
  function autoCreate() {
    var groups = {};
    Store.students({ active: true }).forEach(function (s) {
      if (s.classId) return;
      var days = (s.days || []).slice().sort(function (a, b) {
        return Store.WEEKDAYS.indexOf(a) - Store.WEEKDAYS.indexOf(b);
      });
      if (!days.length && !s.time) return;
      var key = days.join('·') + '|' + (s.time || '');
      (groups[key] = groups[key] || { days: days, time: s.time || '', members: [] }).members.push(s);
    });
    var keys = Object.keys(groups);
    if (!keys.length) {
      UI.toast('반으로 묶을 학생이 없습니다. 학생에게 요일·시간이 있어야 합니다.', true);
      return;
    }
    UI.confirm(
      '지금 학생들의 요일·시간을 묶어 반 ' + keys.length + '개를 만들까요?<br>' +
      '<span style="font-size:13px;color:#63778a">' +
      keys.map(function (k) {
        var g = groups[k];
        return '· ' + (g.days.join('·') || '요일없음') + ' ' + (g.time || '') + ' — ' + g.members.length + '명';
      }).join('<br>') +
      '<br><br>만든 뒤 반 이름은 자유롭게 바꾸실 수 있습니다.</span>',
      function () {
        keys.forEach(function (k) {
          var g = groups[k];
          var name = (g.days.join('') || '요일미정') + ' ' + (g.time || '');
          var cid = Store.saveClass({ name: name.trim(), days: g.days, time: g.time });
          g.members.forEach(function (s) { Store.saveStudent({ id: s.id, classId: cid }); });
        });
        UI.toast(keys.length + '개 반을 만들었습니다.');
        App.rerender();
      }, { yes: '만들기' });
  }

  /* ---------- 렌더 ---------- */
  function render(el) {
    var cs = Store.classes();
    var unassigned = Store.students({ active: true }).filter(function (s) { return !s.classId; });

    el.innerHTML =
      '<div class="stack">' +

        '<div class="card">' +
          '<div class="card-h"><h2>반 목록</h2><div class="sp"></div>' +
            (cs.length ? '' : '<button class="btn" id="auto">기존 시간표로 반 만들기</button>') +
            '<button class="btn primary" id="add">+ 반 만들기</button></div>' +
          '<div class="card-b">' +
            (cs.length
              ? '<div class="class-grid">' + cs.map(classCard).join('') + '</div>'
              : UI.emptyBox('아직 만든 반이 없습니다. [+ 반 만들기]로 시작하세요.', '🗓️')) +
          '</div>' +
        '</div>' +

        (cs.length ?
        '<div class="card"><div class="card-h"><h2>주간 시간표</h2><div class="sp"></div>' +
          '<span class="hint">반을 누르면 수정할 수 있습니다</span></div>' +
          '<div class="card-b" style="overflow-x:auto">' + board() + '</div></div>' : '') +

        (unassigned.length ?
        '<div class="card"><div class="card-h"><h2>반 미배정 학생</h2><div class="sp"></div>' +
          '<span class="tag warn">' + unassigned.length + '명</span></div>' +
          '<div class="card-b">' +
            '<p class="hint" style="margin-top:0">반에 넣지 않아도 학생 개인의 요일·시간으로 출결이 잡힙니다. ' +
            '반에 넣으면 반 시간표를 따릅니다.</p>' +
            '<div class="chips" style="margin-top:12px">' +
              unassigned.map(function (s) {
                var sc = Store.scheduleOf(s);
                return '<span class="pill" data-open="' + s.id + '">' + U.esc(s.name) +
                  (sc.days.length ? ' · ' + U.esc(sc.days.join('')) : '') +
                  (sc.time ? ' ' + U.esc(sc.time) : '') + '</span>';
              }).join('') +
            '</div>' +
          '</div></div>' : '') +

      '</div>';

    var add = el.querySelector('#add');
    if (add) add.addEventListener('click', function () { openClassForm(null); });
    var auto = el.querySelector('#auto');
    if (auto) auto.addEventListener('click', autoCreate);

    UI.on(el, '[data-edit]', 'click', function (e, b) { openClassForm(b.getAttribute('data-edit')); });
    UI.on(el, '[data-members]', 'click', function (e, b) { openMembers(b.getAttribute('data-members')); });
    UI.on(el, '[data-open]', 'click', function (e, b) {
      Views.students.openDetail(b.getAttribute('data-open'));
    });
  }

  return { title: title, sub: sub, render: render, openClassForm: openClassForm };
})();
