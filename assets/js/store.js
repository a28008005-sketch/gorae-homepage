/* ===== 데이터 저장소 (localStorage) =====
 * 노션 [프리미엄] 고래영어 학생관리의 데이터 구조를 그대로 옮겼습니다.
 *  - 학생 명부      -> students
 *  - 일일 학습 관리  -> attendance (출결 + 플래너/계획실천/숙제)
 *  - 순회 점검 기록  -> patrols
 *  - 메모           -> memos
 *  - 업무 메모       -> tasks
 */
var Store = (function () {
  var KEY = 'gorae-academy-v1';

  var STATUS = ['등록생', '대기생', '휴원생', '퇴원생'];
  var GRADES = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년', '중1', '중2', '중3'];
  var FLAGS = ['지각', '외출', '조퇴'];
  var PATROL_STATES = ['🟢 학습중', '💤 졸음', '🏃 이탈/부재', '📱 휴대폰 사용', '💬 잡담/소란'];
  var WEEKDAYS = ['월', '화', '수', '목', '금', '토'];
  var PAY_METHODS = ['계좌이체', '현금', '카드', '기타'];

  var DEFAULTS = {
    version: 1,
    academy: {
      name: '고래영어',
      campus: '초전동캠퍼스',
      address: '경남 진주시 초전동 1639-2',
      phone: '010-3803-8335',
      site: 'https://englishwhale.com',
      seatCount: 20,
      times: ['1시', '2시', '3시', '4시', '5시', '6시', '7시', '8시'],
      defaultFee: 250000,
      billingDay: 10,
      bankName: '',
      bankAccount: '',
      bankHolder: ''
    },
    students: [],
    attendance: [],
    patrols: [],
    memos: [],
    tasks: [],
    payments: []
  };

  var data = null;
  var listeners = [];
  var changeListeners = [];

  /** 컬렉션 이름 <-> 동기화 종류(kind) 매핑 */
  var KINDS = {
    student: 'students', attendance: 'attendance', patrol: 'patrols',
    memo: 'memos', task: 'tasks', payment: 'payments'
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** 레코드에 수정 시각을 찍습니다. 동기화의 기준값입니다. */
  function stamp(rec) {
    rec.updatedAt = new Date().toISOString();
    return rec;
  }

  /** 변경된 레코드를 구독자(동기화 엔진)에게 알립니다. */
  function emitChange(kind, id) {
    changeListeners.forEach(function (fn) {
      try { fn(kind, id); } catch (e) { /* 구독자 오류가 저장을 막지 않도록 */ }
    });
  }
  function onRecordChange(fn) { changeListeners.push(fn); }

  /** 살아있는 레코드만 (소프트 삭제 제외) */
  function alive(list) {
    return list.filter(function (r) { return !r.deleted; });
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 시크릿 모드 등 */ }
    if (!raw) { data = clone(DEFAULTS); return data; }
    try {
      var parsed = JSON.parse(raw);
      data = clone(DEFAULTS);
      // 얕은 병합 + academy 는 키 단위 병합 (새 필드가 추가돼도 안전)
      Object.keys(DEFAULTS).forEach(function (k) {
        if (k === 'academy') return;
        if (parsed[k] !== undefined) data[k] = parsed[k];
      });
      if (parsed.academy) {
        Object.keys(parsed.academy).forEach(function (k) { data.academy[k] = parsed.academy[k]; });
      }
    } catch (e) {
      data = clone(DEFAULTS);
    }
    return data;
  }

  /**
   * @param {{kind:string,id:string}|Array|undefined} changed
   *        바뀐 레코드. 넘기면 동기화 대기열에 올라갑니다.
   */
  function save(changed) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      if (window.UI) UI.toast('저장 공간이 부족합니다. 설정에서 백업 후 정리해 주세요.', true);
    }
    if (changed) {
      (Array.isArray(changed) ? changed : [changed]).forEach(function (c) {
        emitChange(c.kind, c.id);
      });
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }
  function get() { if (!data) load(); return data; }

  /* ---------- 학생 ---------- */
  function students(opts) {
    opts = opts || {};
    var list = alive(get().students).filter(function (s) {
      return opts.includeArchived ? true : !s.archived;
    });
    if (opts.status) list = list.filter(function (s) { return s.status === opts.status; });
    if (opts.active) list = list.filter(function (s) { return s.status === '등록생'; });
    return list.slice().sort(U.byName);
  }
  function student(id) {
    return alive(get().students).filter(function (s) { return s.id === id; })[0] || null;
  }
  function saveStudent(s) {
    var d = get();
    var rec = null;
    if (s.id) {
      for (var i = 0; i < d.students.length; i++) {
        if (d.students[i].id === s.id) { rec = Object.assign(d.students[i], s); break; }
      }
    }
    if (!rec) {
      s.id = s.id || U.uid('stu');
      s.createdAt = s.createdAt || new Date().toISOString();
      rec = s;
      d.students.push(rec);
    }
    stamp(rec);
    save({ kind: 'student', id: rec.id });
    return rec.id;
  }
  /** 보관(퇴원 처리) — 기록은 남기고 명부에서만 감춥니다 */
  function archiveStudent(id, on) {
    var s = student(id);
    if (!s) return;
    s.archived = !!on;
    if (on && s.status !== '퇴원생') s.status = '퇴원생';
    s.seat = on ? '' : s.seat;
    stamp(s);
    save({ kind: 'student', id: s.id });
  }
  /**
   * 삭제 — 학생과 연결된 모든 기록에 삭제 표시를 합니다.
   * 완전히 지우지 않고 표시만 남기는 이유는, 다른 선생님 기기에도
   * '이 기록은 지워졌다'는 사실이 전달되어야 하기 때문입니다.
   */
  function deleteStudent(id) {
    var d = get();
    var changed = [];
    function kill(list, kind, match) {
      list.forEach(function (r) {
        if (r.deleted || !match(r)) return;
        r.deleted = true;
        stamp(r);
        changed.push({ kind: kind, id: r.id });
      });
    }
    kill(d.students, 'student', function (s) { return s.id === id; });
    kill(d.attendance, 'attendance', function (a) { return a.studentId === id; });
    kill(d.patrols, 'patrol', function (p) { return p.studentId === id; });
    kill(d.memos, 'memo', function (m) { return m.studentId === id; });
    kill(d.payments, 'payment', function (p) { return p.studentId === id; });
    save(changed);
  }
  /** 특정 요일에 수업이 있는 등록생 */
  function studentsOnDay(dayKo) {
    return students({ active: true }).filter(function (s) {
      return (s.days || []).indexOf(dayKo) >= 0;
    });
  }
  function seatMap() {
    var m = {};
    students().forEach(function (s) { if (s.seat) m[String(s.seat)] = s; });
    return m;
  }

  /* ---------- 출결 · 일일학습 ---------- */
  function attendanceOn(date) {
    return alive(get().attendance).filter(function (a) { return a.date === date; });
  }
  function attendanceFor(studentId, date) {
    return alive(get().attendance).filter(function (a) {
      return a.studentId === studentId && a.date === date;
    })[0] || null;
  }
  function attendanceRange(studentId, from, to) {
    return alive(get().attendance).filter(function (a) {
      return a.studentId === studentId && a.date >= from && a.date <= to;
    }).sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  }
  /** 출결 기록 저장 (없으면 생성) */
  function setAttendance(studentId, date, patch) {
    var d = get();
    var rec = attendanceFor(studentId, date);
    if (!rec) {
      rec = {
        id: U.uid('att'), studentId: studentId, date: date,
        status: '', flags: [], planner: false, planDone: false, homework: false, note: ''
      };
      d.attendance.push(rec);
    }
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    stamp(rec);
    save({ kind: 'attendance', id: rec.id });
    return rec;
  }
  function toggleFlag(studentId, date, flag) {
    var rec = attendanceFor(studentId, date);
    var flags = rec && rec.flags ? rec.flags.slice() : [];
    var i = flags.indexOf(flag);
    if (i >= 0) flags.splice(i, 1); else flags.push(flag);
    return setAttendance(studentId, date, { flags: flags });
  }

  /* ---------- 순회 점검 ---------- */
  function patrols(opts) {
    opts = opts || {};
    var list = alive(get().patrols).slice();
    if (opts.date) list = list.filter(function (p) { return (p.at || '').slice(0, 10) === opts.date; });
    if (opts.studentId) list = list.filter(function (p) { return p.studentId === opts.studentId; });
    if (opts.from) list = list.filter(function (p) { return (p.at || '').slice(0, 10) >= opts.from; });
    if (opts.to) list = list.filter(function (p) { return (p.at || '').slice(0, 10) <= opts.to; });
    return list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function savePatrol(p) {
    var d = get();
    var rec = null;
    if (p.id) {
      for (var i = 0; i < d.patrols.length; i++) {
        if (d.patrols[i].id === p.id) { rec = Object.assign(d.patrols[i], p); break; }
      }
    }
    if (!rec) { p.id = p.id || U.uid('pat'); rec = p; d.patrols.push(rec); }
    stamp(rec);
    save({ kind: 'patrol', id: rec.id });
    return rec.id;
  }
  function deletePatrol(id) {
    return softDelete('patrols', 'patrol', id);
  }
  /** 주의가 필요한 상태(학습중 제외) 인지 */
  function isIssue(state) { return state !== PATROL_STATES[0]; }

  /* ---------- 메모 ---------- */
  function memos(studentId) {
    var list = alive(get().memos).slice();
    if (studentId) list = list.filter(function (m) { return m.studentId === studentId; });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function addMemo(m) {
    m.id = m.id || U.uid('memo');
    m.date = m.date || U.ymd();
    stamp(m);
    get().memos.push(m);
    save({ kind: 'memo', id: m.id });
  }
  function deleteMemo(id) {
    return softDelete('memos', 'memo', id);
  }

  /* ---------- 업무 메모 ---------- */
  function tasks(bucket) {
    var list = alive(get().tasks).slice();
    if (bucket) list = list.filter(function (t) { return t.bucket === bucket; });
    return list;
  }
  function addTask(text, bucket) {
    var t = stamp({ id: U.uid('task'), text: text, bucket: bucket || 'today', done: false, at: new Date().toISOString() });
    get().tasks.push(t);
    save({ kind: 'task', id: t.id });
  }
  function updateTask(id, patch) {
    get().tasks.forEach(function (t) {
      if (t.id === id) { Object.assign(t, patch); stamp(t); }
    });
    save({ kind: 'task', id: id });
  }
  function deleteTask(id) {
    return softDelete('tasks', 'task', id);
  }

  /** 컬렉션에서 한 레코드에 삭제 표시 */
  function softDelete(collection, kind, id) {
    var list = get()[collection];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].deleted = true;
        stamp(list[i]);
        save({ kind: kind, id: id });
        return true;
      }
    }
    return false;
  }

  /* ---------- 수강료 납부 ---------- */
  /** 청구서 목록 (월 / 학생 / 상태로 필터) */
  function payments(opts) {
    opts = opts || {};
    var list = alive(get().payments).slice();
    if (opts.month) list = list.filter(function (p) { return p.month === opts.month; });
    if (opts.studentId) list = list.filter(function (p) { return p.studentId === opts.studentId; });
    return list.sort(function (a, b) { return a.month < b.month ? 1 : -1; });
  }
  function paymentFor(studentId, month) {
    return alive(get().payments).filter(function (p) {
      return p.studentId === studentId && p.month === month;
    })[0] || null;
  }

  /** 학생의 월 수강료 (개인 설정 > 학원 기본값) */
  function feeOf(s) {
    var v = (s && s.fee !== undefined && s.fee !== '') ? Number(s.fee) : Number(get().academy.defaultFee);
    return isNaN(v) ? 0 : v;
  }
  /** 청구서의 납부 기한 계산 */
  function dueDateFor(month, billingDay) {
    var p = month.split('-');
    var last = new Date(+p[0], +p[1], 0).getDate();
    var day = Math.min(Math.max(parseInt(billingDay, 10) || get().academy.billingDay || 10, 1), last);
    return month + '-' + U.pad(day);
  }

  /**
   * 청구서 상태 판정
   *  면제(청구액 0) / 완납 / 부분납부 / 연체 / 청구
   */
  function paymentStatus(p, today) {
    today = today || U.ymd();
    var amount = Number(p.amount) || 0;
    var paid = Number(p.paidAmount) || 0;
    if (amount <= 0) return { key: 'exempt', label: '면제', tag: 'gray', overdue: 0 };
    if (paid >= amount) return { key: 'paid', label: '완납', tag: 'ok', overdue: 0 };
    var overdue = p.dueDate && today > p.dueDate ? U.dayDiff(p.dueDate, today) : 0;
    if (paid > 0) {
      return {
        key: 'partial',
        label: overdue ? '부분납부 · ' + overdue + '일 경과' : '부분납부',
        tag: 'warn', overdue: overdue
      };
    }
    if (overdue) return { key: 'overdue', label: '미납 ' + overdue + '일', tag: 'bad', overdue: overdue };
    return { key: 'due', label: '청구', tag: 'blue', overdue: 0 };
  }

  function savePayment(p) {
    var d = get();
    var rec = null;
    if (p.id) {
      for (var i = 0; i < d.payments.length; i++) {
        if (d.payments[i].id === p.id) { rec = Object.assign(d.payments[i], p); break; }
      }
    }
    if (!rec) {
      p.id = p.id || U.uid('pay');
      p.createdAt = p.createdAt || new Date().toISOString();
      rec = p;
      d.payments.push(rec);
    }
    stamp(rec);
    save({ kind: 'payment', id: rec.id });
    return rec.id;
  }
  function deletePayment(id) {
    return softDelete('payments', 'payment', id);
  }

  /**
   * 해당 월 청구서 일괄 생성.
   * 이미 청구서가 있는 학생은 건드리지 않고, 등록생만 대상으로 합니다.
   * @return 새로 만든 청구서 수
   */
  function generateBills(month) {
    var made = 0;
    students({ active: true }).forEach(function (s) {
      if (paymentFor(s.id, month)) return;
      savePayment({
        studentId: s.id, month: month,
        amount: feeOf(s),
        paidAmount: 0, paidDate: '', method: '', note: '',
        dueDate: dueDateFor(month, s.billingDay)
      });
      made++;
    });
    return made;
  }

  /** 월 전체 수납 집계 */
  function paymentSummary(month) {
    var list = payments({ month: month });
    var billed = 0, collected = 0, counts = { paid: 0, partial: 0, overdue: 0, due: 0, exempt: 0 };
    list.forEach(function (p) {
      billed += Number(p.amount) || 0;
      collected += Number(p.paidAmount) || 0;
      counts[paymentStatus(p).key]++;
    });
    return {
      list: list, billed: billed, collected: collected,
      outstanding: Math.max(0, billed - collected),
      rate: U.pct(collected, billed), counts: counts,
      unpaidCount: counts.overdue + counts.partial + counts.due
    };
  }

  /** 한 학생의 납부 이력 요약 */
  function paymentHistory(studentId) {
    var list = payments({ studentId: studentId });
    var billed = 0, collected = 0, unpaidMonths = [];
    list.forEach(function (p) {
      billed += Number(p.amount) || 0;
      collected += Number(p.paidAmount) || 0;
      var st = paymentStatus(p);
      if (st.key === 'overdue' || st.key === 'partial') unpaidMonths.push(p.month);
    });
    return { list: list, billed: billed, collected: collected, outstanding: billed - collected, unpaidMonths: unpaidMonths };
  }

  /* ---------- 집계 ---------- */
  /** 한 학생의 기간 통계 (노션의 출석률 / 체크사항 수식과 동일한 의미) */
  function summarize(studentId, from, to) {
    var recs = attendanceRange(studentId, from, to);
    var present = 0, absent = 0, planner = 0, planDone = 0, homework = 0;
    var flagCount = { '지각': 0, '외출': 0, '조퇴': 0 };
    recs.forEach(function (r) {
      if (r.status === '출석') present++;
      else if (r.status === '결석') absent++;
      if (r.planner) planner++;
      if (r.planDone) planDone++;
      if (r.homework) homework++;
      (r.flags || []).forEach(function (f) { if (flagCount[f] !== undefined) flagCount[f]++; });
    });
    var marked = present + absent;
    var pats = patrols({ studentId: studentId, from: from, to: to });
    var issues = 0;
    pats.forEach(function (p) {
      if ((p.states || []).some(isIssue)) issues++;
    });
    return {
      records: recs, total: marked, present: present, absent: absent,
      rate: U.pct(present, marked),
      planner: planner, planDone: planDone, homework: homework,
      plannerRate: U.pct(planner, marked), homeworkRate: U.pct(homework, marked),
      flags: flagCount, patrols: pats, patrolIssues: issues
    };
  }

  /** 특정 날짜의 학원 전체 현황 */
  function dayOverview(date) {
    var day = U.dayOf(date);
    var expected = studentsOnDay(day);
    var present = 0, absent = 0, late = 0, unmarked = 0;
    expected.forEach(function (s) {
      var r = attendanceFor(s.id, date);
      if (!r || !r.status) { unmarked++; return; }
      if (r.status === '출석') present++;
      if (r.status === '결석') absent++;
      if ((r.flags || []).indexOf('지각') >= 0) late++;
    });
    return {
      date: date, day: day, expected: expected,
      present: present, absent: absent, late: late, unmarked: unmarked,
      rate: U.pct(present, present + absent)
    };
  }

  /* ---------- 동기화 지원 ---------- */
  /** 모든 레코드를 {kind, id, data, updatedAt, deleted} 형태로 펼칩니다. */
  function allRecords() {
    var d = get(), out = [];
    Object.keys(KINDS).forEach(function (kind) {
      (d[KINDS[kind]] || []).forEach(function (r) {
        out.push({
          kind: kind, id: r.id, data: r,
          updatedAt: r.updatedAt || '1970-01-01T00:00:00.000Z',
          deleted: !!r.deleted
        });
      });
    });
    out.push({
      kind: 'academy', id: 'main', data: d.academy,
      updatedAt: d.academy.updatedAt || '1970-01-01T00:00:00.000Z',
      deleted: false
    });
    return out;
  }

  /** 한 레코드를 kind+id 로 찾습니다. */
  function findRecord(kind, id) {
    var d = get();
    if (kind === 'academy') return d.academy;
    var list = d[KINDS[kind]];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /**
   * 서버에서 받은 레코드를 병합합니다.
   * 같은 레코드가 양쪽에서 바뀐 경우 updatedAt 이 나중인 쪽을 남깁니다.
   * @return 실제로 반영된 건수
   */
  function applyRemote(rows) {
    var d = get(), n = 0;
    (rows || []).forEach(function (row) {
      if (!row || !row.kind) return;
      var incoming = row.data || {};
      incoming.updatedAt = row.updatedAt || incoming.updatedAt;
      if (row.deleted) incoming.deleted = true;

      if (row.kind === 'academy') {
        if (!d.academy.updatedAt || d.academy.updatedAt < incoming.updatedAt) {
          d.academy = incoming; n++;
        }
        return;
      }
      var list = d[KINDS[row.kind]];
      if (!list) return;
      var local = findRecord(row.kind, row.id);
      if (!local) {
        incoming.id = row.id;
        list.push(incoming); n++;
      } else if (!local.updatedAt || local.updatedAt < incoming.updatedAt) {
        // 제자리 교체 — 다른 참조가 깨지지 않도록 키를 덮어씁니다.
        Object.keys(local).forEach(function (k) { delete local[k]; });
        Object.assign(local, incoming, { id: row.id });
        n++;
      }
    });
    if (n) save();
    return n;
  }

  /** 모든 레코드에 새 수정 시각을 찍습니다 (백업 복원 · 최초 업로드용) */
  function stampAll() {
    var recs = allRecords();
    var now = new Date().toISOString();
    recs.forEach(function (r) { r.data.updatedAt = now; r.updatedAt = now; });
    save();
    return recs.map(function (r) { return { kind: r.kind, id: r.id }; });
  }

  /* ---------- 백업 / 복원 ---------- */
  function exportJson() { return JSON.stringify(get(), null, 2); }
  function importJson(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
      throw new Error('고래영어 원생관리 백업 파일이 아닙니다.');
    }
    localStorage.setItem(KEY, JSON.stringify(parsed));
    load();
    // 복원한 기록이 클라우드로도 올라가도록 전부 새 시각을 찍습니다.
    save(stampAll());
  }
  function resetAll() {
    // 삭제 표시를 남겨야 다른 기기에도 초기화가 전달됩니다.
    var changed = [];
    var d = get();
    Object.keys(KINDS).forEach(function (kind) {
      (d[KINDS[kind]] || []).forEach(function (r) {
        if (r.deleted) return;
        r.deleted = true; stamp(r);
        changed.push({ kind: kind, id: r.id });
      });
    });
    save(changed);
    data = clone(DEFAULTS);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    listeners.forEach(function (fn) { fn(); });
  }
  function saveAcademy(patch) {
    Object.assign(get().academy, patch);
    stamp(get().academy);
    save({ kind: 'academy', id: 'main' });
  }

  load();

  return {
    STATUS: STATUS, GRADES: GRADES, FLAGS: FLAGS,
    PATROL_STATES: PATROL_STATES, WEEKDAYS: WEEKDAYS, PAY_METHODS: PAY_METHODS,
    get: get, save: save, onChange: onChange, onRecordChange: onRecordChange,
    allRecords: allRecords, findRecord: findRecord, applyRemote: applyRemote, stampAll: stampAll,
    students: students, student: student, saveStudent: saveStudent,
    archiveStudent: archiveStudent, deleteStudent: deleteStudent,
    studentsOnDay: studentsOnDay, seatMap: seatMap,
    attendanceOn: attendanceOn, attendanceFor: attendanceFor, attendanceRange: attendanceRange,
    setAttendance: setAttendance, toggleFlag: toggleFlag,
    patrols: patrols, savePatrol: savePatrol, deletePatrol: deletePatrol, isIssue: isIssue,
    memos: memos, addMemo: addMemo, deleteMemo: deleteMemo,
    tasks: tasks, addTask: addTask, updateTask: updateTask, deleteTask: deleteTask,
    payments: payments, paymentFor: paymentFor, feeOf: feeOf, dueDateFor: dueDateFor,
    paymentStatus: paymentStatus, savePayment: savePayment, deletePayment: deletePayment,
    generateBills: generateBills, paymentSummary: paymentSummary, paymentHistory: paymentHistory,
    summarize: summarize, dayOverview: dayOverview,
    exportJson: exportJson, importJson: importJson, resetAll: resetAll, saveAcademy: saveAcademy
  };
})();
