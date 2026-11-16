/* ===== 반(클래스) 관리 · 수업 시간표 ===== */
window.Views = window.Views || {};
Views.classes = (function () {

  // 담당 선생님 보기 필터 ('' = 전체, '__none__' = 미지정)
  var tFilter = '';

  function visible(c) {
    if (!tFilter) return true;
    if (tFilter === '__none__') return !c.teacher;
    return c.teacher === tFilter;
  }

  /** 담당 선생님 표시 (반 카드·시간표) */
  function teacherTag(t) {
    if (!t) return '<span class="tag gray">담당 미지정</span>';
    return '<span class="tag teacher-tag t-' + U.esc(String(t).toLowerCase()) + '">' + U.esc(t) + '</span>';
  }

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
    return '<div class="class-card" style="--klass:' + U.esc(c.color || '#215a86') + '">' +
      '<div class="class-top">' +
        '<div>' +
          '<div class="class-name">' + U.esc(c.name) + '</div>' +
          '<div class="class-meta">' +
            (c.days && c.days.length ? U.esc(c.days.join('·')) : '요일 미정') +
            (c.time ? ' · ' + U.esc(c.time) : '') +
          '</div>' +
          '<div style="margin-top:6px">' + teacherTag(c.teacher) + '</div>' +
        '</div>' +
        '<span class="tag ' + (full ? 'warn' : 'gray') + '">' + members.length +
          (c.capacity ? '/' + c.capacity : '') + '명</span>' +
      '</div>' +
      (c.note ? '<div class="class-note">' + U.esc(c.note) + '</div>' : '') +
      '<div class="class-members" data-drop="' + c.id + '">' +
        (members.length
          ? members.map(dragPill).join('')
          : '<span class="hint">배정된 학생이 없습니다.</span>') +
      '</div>' +
      '<div class="teacher-pick">' +
        '<span class="hint">담당</span>' +
        Store.teachers().map(function (t) {
          var on = c.teacher === t;
          return '<button class="chip' + (on ? ' on blue' : '') + '" data-teach="' + c.id + '" data-t="' + U.esc(t) + '">' +
            U.esc(t) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="class-actions">' +
        '<button class="btn sm" data-members="' + c.id + '">학생 배정</button>' +
        '<button class="btn sm ghost" data-edit="' + c.id + '">반 수정</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 끌어서 옮길 수 있는 학생 이름표 ---------- */
  function dragPill(s) {
    var sc = Store.scheduleOf(s);
    return '<span class="pill" data-drag="' + s.id + '"' +
      (sc.arrive ? ' title="오는 시간 ' + U.esc(sc.arrive) + ' · ' + U.esc(sc.days.join('')) + '"' : '') + '>' +
      U.esc(s.name) +
      (sc.arrive ? ' <span class="pill-sub">' + U.esc(sc.arrive) + '</span>' : '') + '</span>';
  }

  /**
   * 같은 시간대 반끼리 묶는 이름.
   * "2:40~3:00반 Jinny" 와 "2:40~3:00반 Binny" 는 둘 다 "2:40~3:00반" 으로 묶입니다.
   */
  function baseName(c) {
    var n = String(c.name || '').trim();
    Store.teachers().forEach(function (t) {
      n = n.replace(new RegExp('[\\s·\\-]*' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '');
    });
    return n.trim() || c.name;
  }

  /* ---------- 시간대별 반 나누기 (끌어서 옮기기) ---------- */
  function splitBoard(unassigned) {
    var teachers = Store.teachers();
    var groups = [], byKey = {};
    Store.classes().forEach(function (c) {
      var key = (c.time || '') + '|' + baseName(c);
      if (!byKey[key]) { byKey[key] = { name: baseName(c), c0: c, list: [] }; groups.push(byKey[key]); }
      byKey[key].list.push(c);
    });
    function tOrder(c) { var i = teachers.indexOf(c.teacher); return i < 0 ? 99 : i; }

    var tray =
      '<div class="split-tray" data-drop="">' +
        '<div class="split-tray-h"><b>반 미배정</b><span class="tag ' + (unassigned.length ? 'warn' : 'gray') + '">' +
          unassigned.length + '명</span>' +
          '<span class="hint">반에서 빼려면 여기로 끌어 놓으세요</span></div>' +
        '<div class="split-body">' +
          (unassigned.length ? unassigned.map(dragPill).join('') : '<span class="hint">모든 학생이 반에 들어가 있습니다.</span>') +
        '</div>' +
      '</div>';

    var rows = groups.map(function (g) {
      var c0 = g.c0;
      var cols = g.list.slice().sort(function (a, b) { return tOrder(a) - tOrder(b); }).map(function (c) {
        var members = Store.studentsInClass(c.id);
        var full = c.capacity && members.length >= c.capacity;
        var tcls = c.teacher ? ' t-' + U.esc(String(c.teacher).toLowerCase()) : '';
        return '<div class="split-col' + tcls + '" data-drop="' + c.id + '" style="--klass:' + U.esc(c.color || '#215a86') + '">' +
          '<div class="split-h">' + teacherTag(c.teacher) +
            '<span class="split-n' + (full ? ' warn' : '') + '">' + members.length + (c.capacity ? '/' + c.capacity : '') + '명</span>' +
          '</div>' +
          '<div class="split-body">' +
            (members.length ? members.map(dragPill).join('') : '<span class="hint">여기로 끌어 놓으세요</span>') +
          '</div>' +
        '</div>';
      }).join('');
      return '<div class="split-row">' +
        '<div class="split-label"><b>' + U.esc(g.name) + '</b>' +
          '<span>' + (c0.days && c0.days.length ? U.esc(c0.days.join('·')) : '요일 미정') + (c0.time ? ' · ' + U.esc(c0.time) : '') + '</span>' +
        '</div>' +
        '<div class="split-cols">' + cols + '</div>' +
      '</div>';
    }).join('');

    return tray + '<div class="split">' + rows + '</div>';
  }

  /** 학생을 다른 반으로 (to 가 '' 이면 반에서 뺍니다) */
  function moveStudent(id, to) {
    var s = Store.student(id);
    if (!s || (s.classId || '') === to) return;
    var c = to ? Store.klass(to) : null;
    if (to && !c) return;
    Store.saveStudent({ id: id, classId: to });
    var over = c && c.capacity && Store.studentsInClass(c.id).length > c.capacity;
    UI.toast(s.name + ' → ' + (c ? c.name : '반 미배정') + (over ? ' (정원 초과)' : ''), !!over);
    App.rerender();
  }

  /**
   * 이름표 끌어 놓기 — 마우스와 태블릿 손가락 모두 됩니다 (Pointer Events).
   * 조금만 움직였다 놓으면 끌기가 아니라 '누르기'로 보고 학생 정보를 엽니다.
   */
  function bindDrag(root) {
    if (root.__dragBound) return;
    root.__dragBound = true;
    root.addEventListener('pointerdown', function (e) {
      var pill = e.target.closest('[data-drag]');
      if (!pill || !root.contains(pill) || (e.button && e.button !== 0)) return;
      var id = pill.getAttribute('data-drag');
      var fromZone = pill.closest('[data-drop]');
      var from = fromZone ? fromZone.getAttribute('data-drop') : null;
      var sx = e.clientX, sy = e.clientY, lastY = e.clientY;
      var ghost = null, over = null, timer = null;

      function zoneAt(x, y) {
        var el = document.elementFromPoint(x, y);
        var z = el && el.closest('[data-drop]');
        return z && root.contains(z) ? z : null;
      }
      function move(ev) {
        if (!ghost) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
          ghost = pill.cloneNode(true);
          ghost.classList.add('drag-ghost');
          document.body.appendChild(ghost);
          pill.classList.add('dragging');
          document.body.classList.add('is-dragging');
          // 손가락을 화면 위·아래 끝에 대고 있으면 천천히 스크롤됩니다
          timer = setInterval(function () {
            if (lastY < 70) window.scrollBy(0, -14);
            else if (lastY > window.innerHeight - 70) window.scrollBy(0, 14);
          }, 16);
        }
        ev.preventDefault();
        lastY = ev.clientY;
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        var z = zoneAt(ev.clientX, ev.clientY);
        if (z !== over) {
          if (over) over.classList.remove('drop-on');
          over = z;
          if (over && over.getAttribute('data-drop') !== from) over.classList.add('drop-on');
        }
      }
      function end(ev, cancel) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancelFn);
        if (timer) clearInterval(timer);
        if (over) over.classList.remove('drop-on');
        if (ghost) ghost.remove();
        pill.classList.remove('dragging');
        document.body.classList.remove('is-dragging');
        if (cancel) return;
        if (!ghost) { Views.students.openDetail(id); return; }   // 끌지 않고 누르기만 함
        if (over) moveStudent(id, over.getAttribute('data-drop'));
      }
      function up(ev) { end(ev, false); }
      function cancelFn(ev) { end(ev, true); }
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancelFn);
    });
  }

  /* ---------- 주간 시간표 ---------- */
  function board() {
    var ac = Store.get().academy;
    var cs = Store.classes().filter(visible);
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
            'style="--klass:' + U.esc(c.color || '#215a86') + '">' +
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
          '<label class="fld">담당 선생님' +
            '<div class="chips" id="k-teacher">' +
              Store.teachers().map(function (t) {
                var on = c && c.teacher === t;
                return '<button type="button" class="chip' + (on ? ' on blue' : '') + '" data-tc="' + U.esc(t) + '">' + U.esc(t) + '</button>';
              }).join('') +
            '</div></label>' +
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
        var teacher = c && c.teacher ? c.teacher : '';
        UI.on(w, '[data-tc]', 'click', function (e, btn) {
          var t = btn.getAttribute('data-tc');
          teacher = teacher === t ? '' : t;   // 한 번 더 누르면 해제
          w.querySelectorAll('[data-tc]').forEach(function (b) {
            var on = b.getAttribute('data-tc') === teacher;
            b.classList.toggle('on', on); b.classList.toggle('blue', on);
          });
        });
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
            teacher: teacher,
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
              '<span style="font-size:13px;color:#6b7b8a">' +
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
          }).join('') : UI.emptyBox('등록생이 없습니다.', 'students')) +
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
      '<span style="font-size:13px;color:#6b7b8a">' +
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
    var all = Store.classes();
    var cs = all.filter(visible);
    var unassigned = Store.students({ active: true }).filter(function (s) { return !s.classId; });

    el.innerHTML =
      '<div class="stack">' +

        (all.length ?
        '<div class="card"><div class="card-h"><h2>시간대별 반 나누기</h2><div class="sp"></div>' +
          '<span class="hint">학생 이름을 끌어서 옆 반에 놓으면 바로 옮겨집니다</span></div>' +
          '<div class="card-b">' + splitBoard(unassigned) + '</div></div>' : '') +

        '<div class="card">' +
          '<div class="card-h"><h2>반 목록</h2><div class="sp"></div>' +
            (all.length ? '' : '<button class="btn" id="auto">기존 시간표로 반 만들기</button>') +
            '<button class="btn primary" id="add">+ 반 만들기</button></div>' +
          '<div class="card-b">' +
            (all.length ? '<div class="chips" id="t-filter" style="margin-bottom:14px">' +
              [['', '전체']].concat(Store.teachers().map(function (t) { return [t, t]; }))
                .concat([['__none__', '담당 미지정']]).map(function (o) {
                  var n = all.filter(function (c) {
                    return !o[0] ? true : o[0] === '__none__' ? !c.teacher : c.teacher === o[0];
                  }).length;
                  return '<button class="chip' + (tFilter === o[0] ? ' on' : '') + '" data-tf="' + U.esc(o[0]) + '">' +
                    U.esc(o[1]) + ' ' + n + '</button>';
                }).join('') + '</div>' : '') +
            (cs.length
              ? '<div class="class-grid">' + cs.map(classCard).join('') + '</div>'
              : UI.emptyBox(all.length ? '이 선생님이 맡은 반이 없습니다.' : '아직 만든 반이 없습니다. [+ 반 만들기]로 시작하세요.', 'calendar')) +
          '</div>' +
        '</div>' +

        (all.length ?
        '<div class="card"><div class="card-h"><h2>주간 시간표' + (tFilter ? ' · ' + U.esc(tFilter === '__none__' ? '담당 미지정' : tFilter) : '') + '</h2><div class="sp"></div>' +
          '<span class="hint">반을 누르면 수정할 수 있습니다</span></div>' +
          '<div class="card-b" style="overflow-x:auto">' + board() + '</div></div>' : '') +

        (unassigned.length && !all.length ?
        '<div class="card"><div class="card-h"><h2>반 미배정 학생</h2><div class="sp"></div>' +
          '<span class="tag warn">' + unassigned.length + '명</span></div>' +
          '<div class="card-b">' +
            '<p class="hint" style="margin-top:0">반에 넣지 않아도 학생 개인의 요일·시간으로 출결이 잡힙니다. ' +
            '반에 넣어도 학생에게 요일이 따로 있으면 학생 요일을 따릅니다.</p>' +
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

    UI.on(el, '[data-tf]', 'click', function (e, b) {
      tFilter = b.getAttribute('data-tf');
      App.rerender();
    });
    // 반 카드에서 바로 담당 선생님 지정 (같은 이름을 한 번 더 누르면 해제)
    UI.on(el, '[data-teach]', 'click', function (e, b) { toggleTeacher(b); });
    UI.on(el, '[data-edit]', 'click', function (e, b) { openClassForm(b.getAttribute('data-edit')); });
    UI.on(el, '[data-members]', 'click', function (e, b) { openMembers(b.getAttribute('data-members')); });
    UI.on(el, '[data-open]', 'click', function (e, b) {
      Views.students.openDetail(b.getAttribute('data-open'));
    });
    bindDrag(el);
  }

  /* ---------- 대시보드용: 오늘 반 · 담당 선생님 ---------- */
  function teacherPick(c) {
    return '<div class="teacher-pick">' +
      '<span class="hint">담당</span>' +
      Store.teachers().map(function (t) {
        var on = c.teacher === t;
        return '<button class="chip' + (on ? ' on blue' : '') + '" data-teach="' + c.id + '" data-t="' + U.esc(t) + '">' +
          U.esc(t) + '</button>';
      }).join('') +
    '</div>';
  }

  /* ---------- 시간표 위에 그린 오늘 출석 현황 ---------- */
  var TL_FROM = 12 * 60 + 30, TL_TO = 18 * 60;   // 12:30 ~ 18:00

  /** "1:40" 같은 오후 시각을 분으로 (8시 전은 오후로 봅니다) */
  function pmMin(h, m) {
    h = Number(h); m = Number(m);
    if (h < 8) h += 12;
    return h * 60 + m;
  }
  function hmText(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h > 12 ? h - 12 : h) + ':' + (m < 10 ? '0' : '') + m;
  }

  /**
   * 오늘 이 학생이 오기로 한 시각(분).
   * arrive 예: "1:40", "1:40 (화 2:30)", "4:25 (수 2:20)" — 오늘 요일이 괄호 안에 있으면 그 시각.
   * 없으면 반 이름의 첫 시각(예: "2:40~3:00반" → 2:40).
   */
  function expectedMin(s, day) {
    var sc = Store.scheduleOf(s);
    var txt = sc.arrive || '';
    var re = /([월화수목금토])\s*(\d{1,2}):(\d{2})/g, m;
    while ((m = re.exec(txt))) { if (m[1] === day) return pmMin(m[2], m[3]); }
    m = /(\d{1,2}):(\d{2})/.exec(txt) || /(\d{1,2}):(\d{2})/.exec(sc.className || '');
    if (m) return pmMin(m[1], m[2]);
    m = /(\d{1,2})시/.exec(sc.time || '');           // 반 시간 칸 (예: 3시)
    return m ? pmMin(m[1], 0) : null;
  }
  function hmToMin(hm) {
    var m = /(\d{1,2}):(\d{2})/.exec(hm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** 학생 1명의 오늘 상태 — 그림에 쓸 위치·색 */
  function tlState(s, date, day, nowMin) {
    var r = Store.attendanceFor(s.id, date) || {};
    var exp = expectedMin(s, day);
    var inMin = hmToMin(r.checkIn);
    var st;
    if (r.status === '결석') st = 'bad';
    else if (inMin !== null) st = r.checkOut ? 'out' : (exp !== null && inMin > exp + 10 ? 'late' : 'in');
    else if (r.status === '출석') st = 'in';
    else if (exp !== null && nowMin > exp + 10) st = 'miss';
    else st = 'wait';
    return { s: s, exp: exp, at: inMin !== null ? inMin : exp, st: st, rec: r };
  }

  var TL_LABEL = { in: '등원', late: '늦게 옴', out: '하원', bad: '결석', miss: '아직 안 옴', wait: '올 예정' };

  function pct(min) {
    return Math.max(0, Math.min(100, (min - TL_FROM) / (TL_TO - TL_FROM) * 100));
  }

  function timeline() {
    var date = U.ymd(), day = U.dayOf(date);
    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    var cs = Store.classes().filter(visible);
    var total = { all: 0, came: 0, late: 0, miss: 0, bad: 0 };

    var rows = cs.map(function (c) {
      var list = Store.studentsInClass(c.id).filter(function (s) {
        return s.status === '등록생' && Store.scheduleOf(s).days.indexOf(day) >= 0;
      }).map(function (s) { return tlState(s, date, day, nowMin); })
        .filter(function (x) { return x.at !== null; })
        .sort(function (a, b) { return a.at - b.at; });
      if (!list.length) {
        return '<div class="tl-row tl-empty" style="--klass:' + U.esc(c.color || '#215a86') + '">' +
          '<div class="tl-label"><b>' + U.esc(c.name) + '</b>' + teacherPick(c) + '</div>' +
          '<div class="tl-main"><span class="hint">오늘(' + day + ')은 이 반 수업이 없습니다.</span></div></div>';
      }

      var came = list.filter(function (x) { return x.st === 'in' || x.st === 'late' || x.st === 'out'; }).length;
      total.all += list.length; total.came += came;
      list.forEach(function (x) { if (x.st === 'late') total.late++; if (x.st === 'miss') total.miss++; if (x.st === 'bad') total.bad++; });

      var start = expectedMin({ arrive: '', classId: c.id }, day);
      var rate = Math.round(came / list.length * 100);
      var grid = '';
      for (var h = 13; h <= 17; h++) grid += '<span class="tl-grid" style="left:' + pct(h * 60) + '%"></span>';

      return '<div class="tl-row" style="--klass:' + U.esc(c.color || '#215a86') + '">' +
        '<div class="tl-label">' +
          '<b>' + U.esc(c.name) + '</b>' +
          teacherPick(c) +
        '</div>' +
        '<div class="tl-main">' +
          // 시간 띠: 학생마다 점 하나 (실제 등원 시각, 안 온 학생은 오기로 한 시각)
          '<div class="tl-track tl-strip">' + grid +
            (start !== null ? '<span class="tl-start" style="left:' + pct(start) + '%"></span>' : '') +
            (nowMin >= TL_FROM && nowMin <= TL_TO ? '<span class="tl-now" style="left:' + pct(nowMin) + '%"></span>' : '') +
            list.map(function (x) {
              return '<span class="tl-pt st-' + x.st + '" data-open="' + x.s.id + '" title="' +
                U.esc(x.s.name + ' · ' + TL_LABEL[x.st] + (x.rec.checkIn ? ' ' + x.rec.checkIn : '')) + '" ' +
                'style="left:' + pct(x.at) + '%"></span>';
            }).join('') +
          '</div>' +
          // 이름표: 온 순서대로
          '<div class="tl-names">' +
            '<span class="tl-count"><b>' + came + '</b>/' + list.length + '<i><em style="width:' + rate + '%"></em></i></span>' +
            list.map(function (x) {
              var t = x.st === 'bad' ? '결석'
                : x.rec.checkIn ? x.rec.checkIn.replace(/^1([3-9]):/, function (a, d) { return (Number('1' + d) - 12) + ':'; })
                : x.exp !== null ? hmText(x.exp) : '';
              return '<span class="tl-dot st-' + x.st + '" data-open="' + x.s.id + '" title="' +
                U.esc(x.s.name + ' · ' + TL_LABEL[x.st] + (x.exp !== null ? ' (오는 시간 ' + hmText(x.exp) + ')' : '')) + '">' +
                U.esc(x.s.name) + (t ? '<small>' + U.esc(t) + '</small>' : '') + '</span>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    if (!total.all && !rows) return '<p class="hint">오늘(' + day + ') 수업이 있는 반이 없습니다.</p>';

    var hours = '';
    for (var h = 13; h <= 17; h++) {
      hours += '<span class="tl-hour" style="left:' + pct(h * 60) + '%">' + (h - 12) + '시</span>';
    }
    var nowIn = nowMin >= TL_FROM && nowMin <= TL_TO;
    var nowLine = nowIn ? '<span class="tl-now" style="left:' + pct(nowMin) + '%"></span>' : '';
    if (nowIn) hours += '<span class="tl-now-lbl" style="left:' + pct(nowMin) + '%">지금 ' + hmText(nowMin) + '</span>';

    return '<div class="tl-sum">' +
        '<span class="tl-big">' + total.came + '<small>/' + total.all + '명 등원</small></span>' +
        '<span class="tl-key st-in">등원</span><span class="tl-key st-late">늦게 옴 ' + total.late + '</span>' +
        '<span class="tl-key st-miss">아직 안 옴 ' + total.miss + '</span>' +
        '<span class="tl-key st-wait">올 예정</span><span class="tl-key st-out">하원</span>' +
        '<span class="tl-key st-bad">결석 ' + total.bad + '</span>' +
      '</div>' +
      '<div class="tl-scroll"><div class="tl">' +
        '<div class="tl-row tl-axis"><div class="tl-label"></div><div class="tl-main"><div class="tl-track">' + hours + '</div></div></div>' +
        rows +
      '</div></div>' +
      '<p class="hint" style="margin:10px 0 0">담당 Jinny·Binny 버튼을 누르면 바로 지정되고, 다시 누르면 풀립니다. 띠의 점은 학생이 실제로 온 시각(안 온 학생은 오기로 한 시각), 옅은 세로선은 반 시작, 빨간 선은 지금입니다. 오기로 한 시각보다 10분 넘게 늦으면 주황, 아직 안 오면 빨간 테두리로 바뀝니다.</p>';
  }

  function dashboardCard() {
    var all = Store.classes();
    if (!all.length) return '';
    var date = U.ymd();
    var day = U.dayOf(date);
    var cs = all.filter(visible);

    return '<div class="card"><div class="card-h"><h2>오늘 출석 현황 · 시간표별</h2><div class="sp"></div>' +
        '<a class="btn sm" href="#/classes">반 · 시간표 →</a></div>' +
      '<div class="card-b">' +
        '<div class="chips" style="margin-bottom:14px">' +
          [['', '전체']].concat(Store.teachers().map(function (t) { return [t, t]; }))
            .concat([['__none__', '담당 미지정']]).map(function (o) {
              var n = all.filter(function (c) {
                return !o[0] ? true : o[0] === '__none__' ? !c.teacher : c.teacher === o[0];
              }).length;
              return '<button class="chip' + (tFilter === o[0] ? ' on' : '') + '" data-tf="' + U.esc(o[0]) + '">' +
                U.esc(o[1]) + ' ' + n + '</button>';
            }).join('') +
        '</div>' +
        (cs.length
          ? timeline()
          : UI.emptyBox('이 선생님이 맡은 반이 없습니다.', 'calendar')) +
      '</div></div>';
  }

  /** 대시보드 카드의 버튼 연결 (담당 지정·필터·학생 열기) */
  function bindDashboard(el) {
    UI.on(el, '.dash-cls [data-tf]', 'click', function (e, b) {
      tFilter = b.getAttribute('data-tf');
      App.rerender();
    });
    UI.on(el, '.dash-cls [data-teach]', 'click', function (e, b) { toggleTeacher(b); });
    UI.on(el, '.dash-cls [data-open]', 'click', function (e, b) {
      Views.students.openDetail(b.getAttribute('data-open'));
    });
  }

  /** 담당 선생님 켜고 끄기 (같은 이름을 한 번 더 누르면 해제) */
  function toggleTeacher(b) {
    var c = Store.klass(b.getAttribute('data-teach'));
    if (!c) return;
    var t = b.getAttribute('data-t');
    var next = c.teacher === t ? '' : t;
    Store.saveClass({ id: c.id, teacher: next });
    UI.toast(c.name + (next ? ' 담당: ' + next : ' 담당을 비웠습니다.'));
    App.rerender();
  }

  return {
    title: title, sub: sub, render: render, openClassForm: openClassForm,
    dashboardCard: dashboardCard, bindDashboard: bindDashboard
  };
})();
