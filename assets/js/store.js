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

  var DEFAULTS = {
    version: 1,
    academy: {
      name: '고래영어',
      campus: '초전동캠퍼스',
      address: '경남 진주시 초전동 1639-2',
      phone: '010-3803-8335',
      site: 'https://englishwhale.com',
      seatCount: 20,
      times: ['1시', '2시', '3시', '4시', '5시', '6시', '7시', '8시']
    },
    students: [],
    attendance: [],
    patrols: [],
    memos: [],
    tasks: []
  };

  var data = null;
  var listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

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

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      if (window.UI) UI.toast('저장 공간이 부족합니다. 설정에서 백업 후 정리해 주세요.', true);
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }
  function get() { if (!data) load(); return data; }

  /* ---------- 학생 ---------- */
  function students(opts) {
    opts = opts || {};
    var list = get().students.filter(function (s) {
      return opts.includeArchived ? true : !s.archived;
    });
    if (opts.status) list = list.filter(function (s) { return s.status === opts.status; });
    if (opts.active) list = list.filter(function (s) { return s.status === '등록생'; });
    return list.slice().sort(U.byName);
  }
  function student(id) {
    return get().students.filter(function (s) { return s.id === id; })[0] || null;
  }
  function saveStudent(s) {
    var d = get();
    if (s.id) {
      for (var i = 0; i < d.students.length; i++) {
        if (d.students[i].id === s.id) { d.students[i] = Object.assign(d.students[i], s); break; }
      }
    } else {
      s.id = U.uid('stu');
      s.createdAt = new Date().toISOString();
      d.students.push(s);
    }
    save();
    return s.id;
  }
  /** 보관(퇴원 처리) — 기록은 남기고 명부에서만 감춥니다 */
  function archiveStudent(id, on) {
    var s = student(id);
    if (!s) return;
    s.archived = !!on;
    if (on && s.status !== '퇴원생') s.status = '퇴원생';
    s.seat = on ? '' : s.seat;
    save();
  }
  /** 완전 삭제 — 학생과 연결된 모든 기록을 함께 지웁니다 */
  function deleteStudent(id) {
    var d = get();
    d.students = d.students.filter(function (s) { return s.id !== id; });
    d.attendance = d.attendance.filter(function (a) { return a.studentId !== id; });
    d.patrols = d.patrols.filter(function (p) { return p.studentId !== id; });
    d.memos = d.memos.filter(function (m) { return m.studentId !== id; });
    save();
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
    return get().attendance.filter(function (a) { return a.date === date; });
  }
  function attendanceFor(studentId, date) {
    return get().attendance.filter(function (a) {
      return a.studentId === studentId && a.date === date;
    })[0] || null;
  }
  function attendanceRange(studentId, from, to) {
    return get().attendance.filter(function (a) {
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
    save();
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
    var list = get().patrols.slice();
    if (opts.date) list = list.filter(function (p) { return (p.at || '').slice(0, 10) === opts.date; });
    if (opts.studentId) list = list.filter(function (p) { return p.studentId === opts.studentId; });
    if (opts.from) list = list.filter(function (p) { return (p.at || '').slice(0, 10) >= opts.from; });
    if (opts.to) list = list.filter(function (p) { return (p.at || '').slice(0, 10) <= opts.to; });
    return list.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function savePatrol(p) {
    var d = get();
    if (p.id) {
      for (var i = 0; i < d.patrols.length; i++) {
        if (d.patrols[i].id === p.id) { d.patrols[i] = Object.assign(d.patrols[i], p); break; }
      }
    } else {
      p.id = U.uid('pat');
      d.patrols.push(p);
    }
    save();
    return p.id;
  }
  function deletePatrol(id) {
    var d = get();
    d.patrols = d.patrols.filter(function (p) { return p.id !== id; });
    save();
  }
  /** 주의가 필요한 상태(학습중 제외) 인지 */
  function isIssue(state) { return state !== PATROL_STATES[0]; }

  /* ---------- 메모 ---------- */
  function memos(studentId) {
    var list = get().memos.slice();
    if (studentId) list = list.filter(function (m) { return m.studentId === studentId; });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function addMemo(m) {
    m.id = U.uid('memo');
    m.date = m.date || U.ymd();
    get().memos.push(m);
    save();
  }
  function deleteMemo(id) {
    var d = get();
    d.memos = d.memos.filter(function (m) { return m.id !== id; });
    save();
  }

  /* ---------- 업무 메모 ---------- */
  function tasks(bucket) {
    var list = get().tasks.slice();
    if (bucket) list = list.filter(function (t) { return t.bucket === bucket; });
    return list;
  }
  function addTask(text, bucket) {
    get().tasks.push({ id: U.uid('task'), text: text, bucket: bucket || 'today', done: false, at: new Date().toISOString() });
    save();
  }
  function updateTask(id, patch) {
    get().tasks.forEach(function (t) { if (t.id === id) Object.assign(t, patch); });
    save();
  }
  function deleteTask(id) {
    var d = get();
    d.tasks = d.tasks.filter(function (t) { return t.id !== id; });
    save();
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

  /* ---------- 백업 / 복원 ---------- */
  function exportJson() { return JSON.stringify(get(), null, 2); }
  function importJson(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
      throw new Error('고래영어 원생관리 백업 파일이 아닙니다.');
    }
    localStorage.setItem(KEY, JSON.stringify(parsed));
    load();
    save();
  }
  function resetAll() {
    data = clone(DEFAULTS);
    save();
  }
  function saveAcademy(patch) {
    Object.assign(get().academy, patch);
    save();
  }

  load();

  return {
    STATUS: STATUS, GRADES: GRADES, FLAGS: FLAGS,
    PATROL_STATES: PATROL_STATES, WEEKDAYS: WEEKDAYS,
    get: get, save: save, onChange: onChange,
    students: students, student: student, saveStudent: saveStudent,
    archiveStudent: archiveStudent, deleteStudent: deleteStudent,
    studentsOnDay: studentsOnDay, seatMap: seatMap,
    attendanceOn: attendanceOn, attendanceFor: attendanceFor, attendanceRange: attendanceRange,
    setAttendance: setAttendance, toggleFlag: toggleFlag,
    patrols: patrols, savePatrol: savePatrol, deletePatrol: deletePatrol, isIssue: isIssue,
    memos: memos, addMemo: addMemo, deleteMemo: deleteMemo,
    tasks: tasks, addTask: addTask, updateTask: updateTask, deleteTask: deleteTask,
    summarize: summarize, dayOverview: dayOverview,
    exportJson: exportJson, importJson: importJson, resetAll: resetAll, saveAcademy: saveAcademy
  };
})();
