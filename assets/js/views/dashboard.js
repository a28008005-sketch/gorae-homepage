/* ===== 대시보드 ===== */
window.Views = window.Views || {};
Views.dashboard = (function () {

  function title() { return '대시보드'; }
  function sub() {
    var o = Store.dayOverview(U.ymd());
    return U.human(o.date) + ' · 오늘 수업 예정 ' + o.expected.length + '명';
  }

  /** 종합 현황 요약 카드 */
  function summaryCards() {
    var all = Store.students();
    var today = Store.dayOverview(U.ymd());
    var openHw = Store.homeworks({ open: true });
    var openLib = Store.loans({ open: true });
    var unpaid = Store.paymentSummary(U.ym(new Date()));
    var unpaidCount = unpaid.list.filter(function(p) {
      var st = Store.paymentStatus(p);
      return st.key === 'overdue' || st.key === 'partial' || st.key === 'due';
    }).length;

    return '<div class="grid g-3" style="margin-bottom:28px">' +
      '<div class="stat">' +
        '<div class="lbl">📚 총 등록생</div>' +
        '<div class="val">' + all.length + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="lbl">✅ 오늘 출석</div>' +
        '<div class="val">' + today.present + '<small>/ ' + today.expected.length + '</small></div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="lbl">❌ 오늘 결석</div>' +
        '<div class="val">' + today.absent + '<small>/ ' + today.expected.length + '</small></div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="lbl">📝 진행 중 숙제</div>' +
        '<div class="val">' + openHw.length + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="lbl">📖 대출 중 도서</div>' +
        '<div class="val">' + openLib.length + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="lbl">💳 미납자</div>' +
        '<div class="val' + (unpaidCount > 0 ? ' bad' : '') + '">' + unpaidCount + '</div>' +
      '</div>' +
    '</div>';
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
          '<span class="klass-dot" style="background:' + U.esc(Store.scheduleOf(s).color || '#cbd5e0') + '"></span>' +
          '<span><span class="nm">' + U.esc(s.name) + '</span><br>' +
          '<span class="gr">' + U.esc(Store.scheduleOf(s).className || s.grade || '') + '</span></span>' +
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

  /** 오늘 기록된 수업 태도 */
  function attitudeToday() {
    var list = Store.attendanceOn(U.ymd()).filter(function (r) { return (r.attitude || []).length; });
    if (!list.length) return UI.emptyBox('오늘 기록된 수업 태도가 없습니다.', '🙂');
    list.sort(function (a, b) {
      return ((b.attitude || []).some(Store.isIssue) ? 1 : 0) - ((a.attitude || []).some(Store.isIssue) ? 1 : 0);
    });
    return list.slice(0, 7).map(function (r) {
      var s = Store.student(r.studentId);
      var issue = (r.attitude || []).some(Store.isIssue);
      return '<div class="memo-item">' +
        '<div class="txt"><b>' + U.esc(s ? s.name : '(삭제된 학생)') + '</b> ' +
          '<span class="tag ' + (issue ? 'bad' : 'mint') + '">' + U.esc((r.attitude || []).join(' ')) + '</span>' +
          (r.attitudeNote ? '<br><span style="font-size:12.5px;color:#63778a">' + U.esc(r.attitudeNote) + '</span>' : '') +
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

  function unpaidList(pay) {
    var list = pay.list.filter(function (p) {
      var k = Store.paymentStatus(p).key;
      return k === 'overdue' || k === 'partial' || k === 'due';
    }).sort(function (a, b) {
      return Store.paymentStatus(b).overdue - Store.paymentStatus(a).overdue;
    });
    if (!pay.list.length) {
      return '<div class="hint">이번 달 청구서가 아직 없습니다. <a href="#/tuition" style="color:#1a7fd4;font-weight:600">청구서를 생성</a>해 주세요.</div>';
    }
    if (!list.length) {
      return '<div class="empty" style="padding:26px 12px"><span class="big">💰</span>이번 달 수강료를 모두 받았습니다.</div>';
    }
    return list.slice(0, 6).map(function (p) {
      var s = Store.student(p.studentId);
      var st = Store.paymentStatus(p);
      var remain = (Number(p.amount) || 0) - (Number(p.paidAmount) || 0);
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(s ? s.name : '') + '</b> ' +
        '<span class="tag ' + (st.tag === 'ok' ? 'mint' : st.tag === 'bad' ? 'bad' : 'warn') + '">' + U.esc(st.label) + '</span>' +
        '<br><span style="font-size:12px;color:#63778a">' + U.won(remain) + ' · 기한 ' + U.esc(p.dueDate || '-') + '</span></div></div>';
    }).join('') + (list.length > 6 ? '<div class="hint" style="margin-top:8px">외 ' + (list.length - 6) + '명</div>' : '');
  }

  function homeworkBox() {
    var open = Store.homeworks({ open: true });
    if (!open.length) return '<div class="hint">진행 중인 숙제가 없습니다. <a href="#/homework" style="color:#1a7fd4;font-weight:600">숙제 내기</a></div>';
    return open.slice(0, 5).map(function (h) {
      var pr = Store.homeworkProgress(h.id);
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(h.title) + '</b> ' +
        '<span class="tag ' + (pr.rate === 100 ? 'mint' : pr.rate >= 60 ? 'warn' : 'bad') + '">' + pr.rate + '%</span>' +
        '<br><span style="font-size:12px;color:#63778a">제출 ' + pr.done + '/' + pr.total + '명' +
        (h.dueDate ? ' · 마감 ' + U.esc(h.dueDate) : '') + '</span></div></div>';
    }).join('') + (open.length > 5 ? '<div class="hint" style="margin-top:8px">외 ' + (open.length - 5) + '건</div>' : '');
  }

  function libraryBox() {
    var over = Store.overdueLoans();
    var open = Store.loans({ open: true });
    if (!Store.books().length) {
      return '<div class="hint">등록된 도서가 없습니다. <a href="#/library" style="color:#1a7fd4;font-weight:600">도서 등록</a></div>';
    }
    if (!open.length) return '<div class="empty" style="padding:26px 12px"><span class="big">📖</span>대출 중인 책이 없습니다.</div>';
    var soon = open.slice().sort(function (a, b) {
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
    });
    return soon.slice(0, 5).map(function (l) {
      var b = Store.book(l.bookId), st = Store.student(l.studentId);
      var late = l.dueDate && l.dueDate < U.ymd();
      return '<div class="memo-item"><div class="txt"><b>' + U.esc(st ? st.name : '') + '</b> ' +
        '<span class="tag ' + (late ? 'bad' : 'mint') + '">' +
          (late ? U.dayDiff(l.dueDate, U.ymd()) + '일 연체' : '~' + U.esc(l.dueDate || '')) + '</span>' +
        '<br><span style="font-size:12px;color:#63778a">' + U.esc(b ? b.title : '(삭제된 책)') + '</span></div></div>';
    }).join('') + (over.length ? '<div class="hint" style="margin-top:8px">연체 ' + over.length + '권</div>' : '');
  }

  function buildCalendar(year, month, selectedDate) {
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    var html = '<div class="calendar-grid" id="calendar-grid">';
    var days = ['일', '월', '화', '수', '목', '금', '토'];

    days.forEach(function(d) {
      html += '<div class="calendar-day-label">' + d + '</div>';
    });

    var date = new Date(startDate);
    var today = U.ymd();

    for (var i = 0; i < 42; i++) {
      var dateStr = String(date.getFullYear()) + '-' +
                    String(date.getMonth() + 1).padStart(2, '0') + '-' +
                    String(date.getDate()).padStart(2, '0');
      var isOtherMonth = date.getMonth() !== month;
      var isToday = dateStr === today;
      var isSelected = dateStr === selectedDate;

      var classes = 'calendar-day';
      if (isOtherMonth) classes += ' other-month';
      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';

      html += '<div class="' + classes + '" data-date="' + dateStr + '">' + date.getDate() + '</div>';
      date.setDate(date.getDate() + 1);
    }

    html += '</div>';
    return html;
  }

  function render(el) {
    var o = Store.dayOverview(U.ymd());
    var today = U.ymd();
    var todayDate = new Date();
    var year = todayDate.getFullYear();
    var month = todayDate.getMonth();

    el.innerHTML =
      '<div class="stack">' +

      // 종합 현황 요약
      summaryCards() +

      // 상단 미니 캘린더 + 이번주 예정
      '<div style="background:linear-gradient(135deg,#002060 0%,#003d99 100%);border-radius:12px;padding:20px;color:#fff;box-shadow:0 2px 8px rgba(0,32,96,.15);margin-bottom:24px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
          '<h2 style="margin:0;font-size:16px;font-weight:700">' + year + '년 ' + (month + 1) + '월</h2>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn-mini" id="mini-prev" style="border:0;background:rgba(255,255,255,.2);color:#fff;width:24px;height:24px;border-radius:6px;cursor:pointer;font-weight:700">◀</button>' +
            '<button class="btn-mini" id="mini-next" style="border:0;background:rgba(255,255,255,.2);color:#fff;width:24px;height:24px;border-radius:6px;cursor:pointer;font-weight:700">▶</button>' +
          '</div>' +
        '</div>' +
        '<div class="mini-calendar-grid" id="mini-calendar"></div>' +
        '<div style="font-size:12px;margin-top:14px">' +
          '<div style="font-weight:700;margin-bottom:8px;opacity:.95">📅 이번주 예정</div>' +
          '<div id="upcoming-tasks" style="font-size:12px"></div>' +
        '</div>' +
      '</div>' +

      // 출결 및 태도
      '<div class="grid g-21">' +
        '<div class="card"><div class="card-h"><h2>오늘 출결 빠른 체크</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/attendance">전체 출결표 →</a></div>' +
          '<div class="card-b tight" id="quick">' + quickCheck(o) + '</div></div>' +

        '<div class="card"><div class="card-h"><h2>오늘 수업 태도</h2><div class="sp"></div>' +
          '<a class="btn sm" href="#/attendance">기록하기</a></div>' +
          '<div class="card-b">' + attitudeToday() + '</div></div>' +
      '</div>' +

      // 숙제 및 도서
      '<div class="grid g-2">' +
        '<div class="card"><div class="card-h"><h2>숙제 현황</h2><div class="sp"></div>' +
          '<a class="btn primary" href="#/homework">숙제 관리 →</a></div>' +
          '<div class="card-b">' + homeworkBox() + '</div></div>' +
        '<div class="card"><div class="card-h"><h2>도서 반납</h2><div class="sp"></div>' +
          '<a class="btn primary" href="#/library">도서 대여 →</a></div>' +
          '<div class="card-b">' + libraryBox() + '</div></div>' +
      '</div>' +

      // 업무 메모
      '<div class="grid g-21">' +
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

        '<div class="card"><div class="card-h"><h2>수강료 미납</h2><div class="sp"></div>' +
          '<a class="btn primary" href="#/tuition">납부 관리 →</a></div>' +
          '<div class="card-b">' + unpaidList(Store.paymentSummary(U.ym(new Date()))) + '</div></div>' +
      '</div>' +

      // 상세 캘린더
      '<div class="card"><div class="card-h"><h2>업무 상세 계획</h2></div>' +
        '<div class="card-b">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
            '<h3 style="margin:0;font-size:14px;font-weight:700" id="cal-month">' + year + '년 ' + (month + 1) + '월</h3>' +
            '<div style="display:flex;gap:6px">' +
              '<button class="btn sm" id="prev-month" style="cursor:pointer">◀</button>' +
              '<button class="btn sm" id="next-month" style="cursor:pointer">▶</button>' +
            '</div>' +
          '</div>' +
          '<div id="full-calendar">' + buildCalendar(year, month, today) + '</div>' +
          '<div id="selected-tasks" style="margin-top:14px"></div>' +
        '</div></div>' +

      '</div>';

    // 미니 캘린더
    renderUpcomingTasks();
    renderSelectedTasks(today);

    // 이벤트
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

    // 캘린더 네비게이션
    var currentMonth = month;
    var currentYear = year;

    el.querySelector('#prev-month').addEventListener('click', function() {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      el.querySelector('#cal-month').textContent = currentYear + '년 ' + (currentMonth + 1) + '월';
      el.querySelector('#full-calendar').innerHTML = buildCalendar(currentYear, currentMonth, today);
      addCalendarEvents();
    });

    el.querySelector('#next-month').addEventListener('click', function() {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      el.querySelector('#cal-month').textContent = currentYear + '년 ' + (currentMonth + 1) + '월';
      el.querySelector('#full-calendar').innerHTML = buildCalendar(currentYear, currentMonth, today);
      addCalendarEvents();
    });

    function addCalendarEvents() {
      UI.on(el, '[data-date]', 'click', function(e, cell) {
        var date = cell.getAttribute('data-date');
        document.querySelectorAll('[data-date]').forEach(function(c) {
          c.classList.remove('selected');
        });
        cell.classList.add('selected');
        renderSelectedTasks(date);
      });
    }
    addCalendarEvents();

    function renderSelectedTasks(dateStr) {
      var tasks = Store.tasks('today').concat(Store.tasks('week')).concat(Store.tasks('later'));
      var dateObj = new Date(dateStr + 'T00:00:00');
      var dateLabel = dateObj.getFullYear() + '년 ' + (dateObj.getMonth() + 1) + '월 ' + dateObj.getDate() + '일';

      var html = '<div class="task-list-label">' + dateLabel + '의 업무</div>';

      if (!tasks.length) {
        html += '<div style="font-size:13px;color:#93a4b4;text-align:center;padding:16px 0">할 일이 없습니다.</div>';
      } else {
        var todayTasks = Store.tasks('today');
        var weekTasks = Store.tasks('week');
        var laterTasks = Store.tasks('later');

        if (todayTasks.length) {
          html += '<div class="section-title">🔥 오늘</div>';
          todayTasks.forEach(function(t) {
            html += '<div class="memo-item' + (t.done ? ' done' : '') + '"><input type="checkbox" class="cbx"' + (t.done ? ' checked' : '') + '><div class="txt">' + U.esc(t.text) + '</div></div>';
          });
        }

        if (weekTasks.length) {
          html += '<div class="section-title">📅 이번주</div>';
          weekTasks.forEach(function(t) {
            html += '<div class="memo-item' + (t.done ? ' done' : '') + '"><input type="checkbox" class="cbx"' + (t.done ? ' checked' : '') + '><div class="txt">' + U.esc(t.text) + '</div></div>';
          });
        }

        if (laterTasks.length) {
          html += '<div class="section-title">💤 미뤄두기</div>';
          laterTasks.forEach(function(t) {
            html += '<div class="memo-item' + (t.done ? ' done' : '') + '"><input type="checkbox" class="cbx"' + (t.done ? ' checked' : '') + '><div class="txt">' + U.esc(t.text) + '</div></div>';
          });
        }
      }

      el.querySelector('#selected-tasks').innerHTML = html;
    }

    function renderUpcomingTasks() {
      var upcoming = [];
      var date = new Date(year, month, todayDate.getDate());

      for (var i = 0; i < 7; i++) {
        var tasks = Store.tasks('today').filter(function(t) { return !t.done; });
        if (tasks.length && i === 0) {
          upcoming.push(tasks[0].text.substring(0, 20));
        }
        date.setDate(date.getDate() + 1);
      }

      var list = el.querySelector('#upcoming-tasks');
      if (upcoming.length) {
        var html = upcoming.slice(0, 3).map(function(t) {
          return '<div class="task-item" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.15);opacity:.9">• ' + U.esc(t) + '</div>';
        }).join('');
        list.innerHTML = html;
      } else {
        list.innerHTML = '<div style="padding:6px 0;opacity:0.7">예정된 일정이 없습니다</div>';
      }
    }
  }

  return { title: title, sub: sub, render: render };
})();
