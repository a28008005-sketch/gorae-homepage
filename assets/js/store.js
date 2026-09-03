/* ===== 데이터 저장소 (localStorage) =====
 * 노션 [프리미엄] 고래영어 학생관리의 데이터 구조를 그대로 옮겼습니다.
 *  - 학생 명부      -> students
 *  - 일일 학습 관리  -> attendance (출결 + 플래너/계획실천/숙제)
 *  - 순회 점검 기록  -> 일일학습 안의 '수업 태도'로 합쳤습니다
 *  - 메모           -> memos
 *  - 업무 메모       -> tasks
 */
var Store = (function () {
  var KEY = 'gorae-academy-v1';

  var STATUS = ['등록생', '대기생', '휴원생', '퇴원생'];
  var GRADES = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년', '중1', '중2', '중3'];
  var FLAGS = ['지각', '외출', '조퇴'];
  // 수업 태도 (예전 '순회 점검 기록'을 일일학습 안으로 합쳤습니다)
  var ATTITUDES = ['🟢 집중', '💤 졸음', '🏃 이탈/부재', '📱 휴대폰 사용', '💬 잡담/소란'];
  var HOMEWORK_TYPES = ['단어', '원서 읽기', '워크북', '녹음', '기타'];
  var SUBMIT_STATUS = ['미제출', '제출', '확인'];
  var BOOK_CATEGORIES = ['리더스', '챕터북', '노블', '논픽션', '그림책', '워크북'];
  var LOAN_DAYS = 7;
  var CLASS_COLORS = ['#1a7fd4', '#17b7a6', '#d98218', '#8a6ad4', '#d5453f', '#12a05c', '#c2557f', '#4a7a99'];
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
    meta: {},
    classes: [],
    students: [],
    attendance: [],
    patrols: [],   // 예전 순회 점검 기록 — 일일학습으로 옮긴 뒤 사용하지 않습니다
    memos: [],
    tasks: [],
    payments: [],
    homeworks: [],    // 숙제 (반/학생에게 낸 과제)
    submissions: [],  // 숙제별 학생 제출 상태
    vocabLogs: [],    // 단어학습앱에서 넘어온 학습 기록
    books: [],        // 도서 목록
    loans: []         // 도서 대여 기록
  };

  var data = null;
  var listeners = [];
  var changeListeners = [];

  /** 컬렉션 이름 <-> 동기화 종류(kind) 매핑 */
  var KINDS = {
    klass: 'classes', student: 'students', attendance: 'attendance',
    memo: 'memos', task: 'tasks', payment: 'payments',
    homework: 'homeworks', submission: 'submissions',
    vocab: 'vocabLogs', book: 'books', loan: 'loans'
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** 주의가 필요한 태도인지 (집중 외 전부) */
  function isIssue(state) { return state !== ATTITUDES[0]; }

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

  /* ---------- 반 (클래스) ---------- */
  function classes() {
    return alive(get().classes).slice().sort(function (a, b) {
      var ta = get().academy.times.indexOf(a.time), tb = get().academy.times.indexOf(b.time);
      if (ta !== tb) return ta - tb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
  }
  function klass(id) {
    if (!id) return null;
    return alive(get().classes).filter(function (c) { return c.id === id; })[0] || null;
  }
  function saveClass(c) {
    var d = get(), rec = null;
    if (c.id) {
      for (var i = 0; i < d.classes.length; i++) {
        if (d.classes[i].id === c.id) { rec = Object.assign(d.classes[i], c); break; }
      }
    }
    if (!rec) {
      c.id = c.id || U.uid('cls');
      if (!c.color) c.color = CLASS_COLORS[d.classes.length % CLASS_COLORS.length];
      rec = c;
      d.classes.push(rec);
    }
    stamp(rec);
    save({ kind: 'klass', id: rec.id });
    return rec.id;
  }
  /** 반 삭제 — 소속 학생은 미배정으로 돌립니다 (학생 기록은 그대로) */
  function deleteClass(id) {
    var d = get(), changed = [];
    d.classes.forEach(function (c) {
      if (c.id === id && !c.deleted) {
        c.deleted = true; stamp(c);
        changed.push({ kind: 'klass', id: c.id });
      }
    });
    d.students.forEach(function (s) {
      if (s.classId === id) {
        s.classId = ''; stamp(s);
        changed.push({ kind: 'student', id: s.id });
      }
    });
    save(changed);
  }
  function studentsInClass(classId) {
    return students().filter(function (s) { return s.classId === classId; });
  }
  /**
   * 학생의 실제 수업 요일·시간.
   * 반에 속해 있으면 반의 시간표를, 아니면 학생 개인 설정을 씁니다.
   */
  function scheduleOf(s) {
    var c = s && s.classId ? klass(s.classId) : null;
    return {
      days: c ? (c.days || []) : (s && s.days ? s.days : []),
      time: c ? (c.time || '') : (s && s.time ? s.time : ''),
      className: c ? c.name : '',
      color: c ? c.color : '',
      classId: c ? c.id : ''
    };
  }

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
    kill(d.memos, 'memo', function (m) { return m.studentId === id; });
    kill(d.payments, 'payment', function (p) { return p.studentId === id; });
    kill(d.submissions, 'submission', function (x) { return x.studentId === id; });
    kill(d.vocabLogs, 'vocab', function (v) { return v.studentId === id; });
    kill(d.loans, 'loan', function (l) { return l.studentId === id; });
    save(changed);
  }
  /** 특정 요일에 수업이 있는 등록생 */
  function studentsOnDay(dayKo) {
    return students({ active: true }).filter(function (s) {
      return scheduleOf(s).days.indexOf(dayKo) >= 0;
    });
  }

  /** 학생 코드 — 단어학습앱 등 외부에서 학생을 지목할 때 쓰는 4자리 코드 */
  function ensureCode(id) {
    var s = student(id);
    if (!s) return '';
    if (s.code) return s.code;
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 글자 제외
    var code;
    do {
      code = '';
      for (var i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (studentByCode(code));
    saveStudent({ id: id, code: code });
    return code;
  }
  function studentByCode(code) {
    if (!code) return null;
    var up = String(code).trim().toUpperCase();
    return students({ includeArchived: true }).filter(function (s) {
      return String(s.code || '').toUpperCase() === up;
    })[0] || null;
  }
  /** 이름 또는 코드로 학생 찾기 (외부 데이터를 받을 때 사용) */
  function findStudent(ref) {
    if (!ref) return null;
    return studentByCode(ref) ||
      students({ includeArchived: true }).filter(function (s) {
        return s.name === String(ref).trim();
      })[0] || null;
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
        status: '', flags: [], planner: false, planDone: false, homework: false,
        attitude: [], attitudeNote: '', note: ''
      };
      d.attendance.push(rec);
    }
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    stamp(rec);
    save({ kind: 'attendance', id: rec.id });
    return rec;
  }
  /** 수업 태도 항목 켜고 끄기 */
  function toggleAttitude(studentId, date, state) {
    var rec = attendanceFor(studentId, date);
    var list = rec && rec.attitude ? rec.attitude.slice() : [];
    var i = list.indexOf(state);
    if (i >= 0) list.splice(i, 1); else list.push(state);
    return setAttendance(studentId, date, { attitude: list });
  }
  function toggleFlag(studentId, date, flag) {
    var rec = attendanceFor(studentId, date);
    var flags = rec && rec.flags ? rec.flags.slice() : [];
    var i = flags.indexOf(flag);
    if (i >= 0) flags.splice(i, 1); else flags.push(flag);
    return setAttendance(studentId, date, { flags: flags });
  }

  /* ---------- 예전 순회 점검 기록 옮기기 ---------- */
  /** 예전 상태 이름 -> 지금 수업 태도 이름 */
  var ATTITUDE_ALIAS = { '🟢 학습중': '🟢 집중' };

  /**
   * 예전에 따로 쌓아 둔 순회 점검 기록을 그날의 일일학습 기록 안으로 합칩니다.
   * 한 번만 실행되며, 옮긴 뒤 원래 기록에는 삭제 표시를 합니다.
   */
  function migratePatrols() {
    var d = get();
    if (!d.meta) d.meta = {};
    if (d.meta.patrolsMerged) return 0;
    var list = (d.patrols || []).filter(function (p) { return !p.deleted; });
    if (!list.length) { d.meta.patrolsMerged = true; return 0; }

    var moved = 0;
    list.forEach(function (p) {
      var date = String(p.at || '').slice(0, 10);
      if (!date || !p.studentId) return;
      var rec = attendanceFor(p.studentId, date);
      var attitude = (rec && rec.attitude ? rec.attitude.slice() : []);
      (p.states || []).forEach(function (st) {
        var name = ATTITUDE_ALIAS[st] || st;
        if (attitude.indexOf(name) < 0) attitude.push(name);
      });
      // 다른 기기에서 이미 옮긴 내용을 또 붙이지 않도록 중복은 걸러냅니다.
      var notes = [];
      function addNote(t) {
        t = String(t || '').trim();
        if (t && notes.indexOf(t) < 0) notes.push(t);
      }
      if (rec && rec.attitudeNote) String(rec.attitudeNote).split(' / ').forEach(addNote);
      addNote(p.action);
      addNote(p.note);
      setAttendance(p.studentId, date, {
        attitude: attitude,
        attitudeNote: notes.join(' / ')
      });
      p.deleted = true;
      stamp(p);
      moved++;
    });
    d.meta.patrolsMerged = true;
    save();
    return moved;
  }

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

  /* ---------- 숙제 ---------- */
  function homeworks(opts) {
    opts = opts || {};
    var list = alive(get().homeworks).slice();
    if (opts.classId) list = list.filter(function (h) { return h.classId === opts.classId; });
    if (opts.open) list = list.filter(function (h) { return !h.dueDate || h.dueDate >= U.ymd(); });
    return list.sort(function (a, b) {
      return String(b.assignedDate || '').localeCompare(String(a.assignedDate || ''));
    });
  }
  function homework(id) {
    return alive(get().homeworks).filter(function (h) { return h.id === id; })[0] || null;
  }
  function submissions(opts) {
    opts = opts || {};
    var list = alive(get().submissions).slice();
    if (opts.homeworkId) list = list.filter(function (x) { return x.homeworkId === opts.homeworkId; });
    if (opts.studentId) list = list.filter(function (x) { return x.studentId === opts.studentId; });
    return list;
  }
  function submissionFor(homeworkId, studentId) {
    return alive(get().submissions).filter(function (x) {
      return x.homeworkId === homeworkId && x.studentId === studentId;
    })[0] || null;
  }

  /**
   * 숙제 저장. 대상 학생(반 또는 지정 학생)에게 제출 칸을 함께 만듭니다.
   * @param {Array} studentIds 대상 학생. 없으면 반 소속 학생 전체.
   */
  function saveHomework(h, studentIds) {
    var d = get(), rec = null, changed = [];
    if (h.id) {
      for (var i = 0; i < d.homeworks.length; i++) {
        if (d.homeworks[i].id === h.id) { rec = Object.assign(d.homeworks[i], h); break; }
      }
    }
    if (!rec) {
      h.id = h.id || U.uid('hw');
      h.assignedDate = h.assignedDate || U.ymd();
      rec = h;
      d.homeworks.push(rec);
    }
    stamp(rec);
    changed.push({ kind: 'homework', id: rec.id });

    var targets = studentIds || (rec.classId ? studentsInClass(rec.classId).map(function (s) { return s.id; }) : []);
    targets.forEach(function (sid) {
      if (submissionFor(rec.id, sid)) return;
      var sub = stamp({
        id: U.uid('sub'), homeworkId: rec.id, studentId: sid,
        status: '미제출', score: '', submittedAt: '', note: ''
      });
      d.submissions.push(sub);
      changed.push({ kind: 'submission', id: sub.id });
    });
    save(changed);
    return rec.id;
  }
  function setSubmission(homeworkId, studentId, patch) {
    var d = get();
    var rec = submissionFor(homeworkId, studentId);
    if (!rec) {
      rec = { id: U.uid('sub'), homeworkId: homeworkId, studentId: studentId,
              status: '미제출', score: '', submittedAt: '', note: '' };
      d.submissions.push(rec);
    }
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    stamp(rec);
    save({ kind: 'submission', id: rec.id });
    return rec;
  }
  function deleteHomework(id) {
    var d = get(), changed = [];
    d.homeworks.forEach(function (h) {
      if (h.id === id && !h.deleted) { h.deleted = true; stamp(h); changed.push({ kind: 'homework', id: h.id }); }
    });
    d.submissions.forEach(function (x) {
      if (x.homeworkId === id && !x.deleted) { x.deleted = true; stamp(x); changed.push({ kind: 'submission', id: x.id }); }
    });
    save(changed);
  }
  /** 한 숙제의 제출 현황 */
  function homeworkProgress(id) {
    var subs = submissions({ homeworkId: id });
    var done = subs.filter(function (x) { return x.status !== '미제출'; }).length;
    return { total: subs.length, done: done, rate: U.pct(done, subs.length), list: subs };
  }

  /* ---------- 단어 학습 ---------- */
  function vocabLogs(opts) {
    opts = opts || {};
    var list = alive(get().vocabLogs).slice();
    if (opts.studentId) list = list.filter(function (v) { return v.studentId === opts.studentId; });
    if (opts.from) list = list.filter(function (v) { return v.date >= opts.from; });
    if (opts.to) list = list.filter(function (v) { return v.date <= opts.to; });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function saveVocabLog(v) {
    var d = get(), rec = null;
    // 앱이 보낸 세션 아이디가 같으면 같은 기록으로 봅니다 (두 번 들어와도 안 쌓임)
    if (v.sessionId) {
      rec = d.vocabLogs.filter(function (x) { return x.sessionId === v.sessionId; })[0] || null;
    }
    if (!rec && v.id) {
      rec = d.vocabLogs.filter(function (x) { return x.id === v.id; })[0] || null;
    }
    if (rec) Object.assign(rec, v, { id: rec.id });
    else {
      v.id = v.id || U.uid('voc');
      rec = v;
      d.vocabLogs.push(rec);
    }
    stamp(rec);
    save({ kind: 'vocab', id: rec.id });
    return rec.id;
  }
  function deleteVocabLog(id) { return softDelete('vocabLogs', 'vocab', id); }

  /** 한 학생의 단어 학습 요약 */
  function vocabSummary(studentId, from, to) {
    var list = vocabLogs({ studentId: studentId, from: from, to: to });
    var total = 0, correct = 0, seconds = 0;
    list.forEach(function (v) {
      total += Number(v.total) || 0;
      correct += Number(v.correct) || 0;
      seconds += Number(v.durationSec) || 0;
    });
    return {
      list: list, sessions: list.length, total: total, correct: correct,
      accuracy: U.pct(correct, total), minutes: Math.round(seconds / 60),
      lastDate: list.length ? list[0].date : ''
    };
  }

  /* ---------- 도서 대여 ---------- */
  function books(opts) {
    opts = opts || {};
    var list = alive(get().books).slice();
    if (opts.q) {
      var q = String(opts.q).toLowerCase();
      list = list.filter(function (b) {
        return [b.code, b.title, b.author, b.series, b.level].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (opts.category) list = list.filter(function (b) { return b.category === opts.category; });
    return list.sort(function (a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    });
  }
  function book(id) {
    return alive(get().books).filter(function (b) { return b.id === id; })[0] || null;
  }
  function bookByCode(code) {
    if (!code) return null;
    var up = String(code).trim().toLowerCase();
    return alive(get().books).filter(function (b) {
      return String(b.code || '').trim().toLowerCase() === up;
    })[0] || null;
  }
  function saveBook(b) {
    var d = get(), rec = null;
    if (b.id) {
      for (var i = 0; i < d.books.length; i++) {
        if (d.books[i].id === b.id) { rec = Object.assign(d.books[i], b); break; }
      }
    }
    if (!rec) { b.id = b.id || U.uid('bk'); rec = b; d.books.push(rec); }
    stamp(rec);
    save({ kind: 'book', id: rec.id });
    return rec.id;
  }
  function deleteBook(id) { return softDelete('books', 'book', id); }

  function loans(opts) {
    opts = opts || {};
    var list = alive(get().loans).slice();
    if (opts.bookId) list = list.filter(function (l) { return l.bookId === opts.bookId; });
    if (opts.studentId) list = list.filter(function (l) { return l.studentId === opts.studentId; });
    if (opts.open) list = list.filter(function (l) { return !l.returnDate; });
    return list.sort(function (a, b) { return a.outDate < b.outDate ? 1 : -1; });
  }
  /** 이 책이 지금 대출 중이면 그 기록 */
  function openLoanOf(bookId) {
    return alive(get().loans).filter(function (l) {
      return l.bookId === bookId && !l.returnDate;
    })[0] || null;
  }
  /** 책 상태 — 대출가능 / 대출중 / 연체 */
  function bookStatus(b) {
    var l = openLoanOf(b.id);
    if (!l) return { key: 'in', label: '대출 가능', tag: 'ok', loan: null, overdue: 0 };
    var over = l.dueDate && U.ymd() > l.dueDate ? U.dayDiff(l.dueDate, U.ymd()) : 0;
    return over
      ? { key: 'overdue', label: '연체 ' + over + '일', tag: 'bad', loan: l, overdue: over }
      : { key: 'out', label: '대출 중', tag: 'blue', loan: l, overdue: 0 };
  }
  function lendBook(bookId, studentId, dueDate) {
    if (openLoanOf(bookId)) throw new Error('이미 대출 중인 책입니다.');
    var out = U.ymd();
    var rec = stamp({
      id: U.uid('ln'), bookId: bookId, studentId: studentId,
      outDate: out, dueDate: dueDate || U.daysAgo(-LOAN_DAYS), returnDate: '', note: ''
    });
    get().loans.push(rec);
    save({ kind: 'loan', id: rec.id });
    return rec.id;
  }
  function returnBook(loanId, date) {
    var d = get();
    for (var i = 0; i < d.loans.length; i++) {
      if (d.loans[i].id === loanId) {
        d.loans[i].returnDate = date || U.ymd();
        stamp(d.loans[i]);
        save({ kind: 'loan', id: loanId });
        return true;
      }
    }
    return false;
  }
  function deleteLoan(id) { return softDelete('loans', 'loan', id); }

  /** 지금 연체된 대출 목록 */
  function overdueLoans() {
    var today = U.ymd();
    return loans({ open: true }).filter(function (l) {
      return l.dueDate && today > l.dueDate;
    });
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
    // 수업 태도에 주의 항목(졸음 · 이탈 · 휴대폰 · 잡담)이 찍힌 날 수
    var issues = 0, attitudeCount = {};
    ATTITUDES.forEach(function (a) { attitudeCount[a] = 0; });
    recs.forEach(function (r) {
      var list = r.attitude || [];
      list.forEach(function (a) { if (attitudeCount[a] !== undefined) attitudeCount[a]++; });
      if (list.some(isIssue)) issues++;
    });
    return {
      records: recs, total: marked, present: present, absent: absent,
      rate: U.pct(present, marked),
      planner: planner, planDone: planDone, homework: homework,
      plannerRate: U.pct(planner, marked), homeworkRate: U.pct(homework, marked),
      flags: flagCount, attitude: attitudeCount, attitudeIssues: issues
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
  migratePatrols();

  return {
    STATUS: STATUS, GRADES: GRADES, FLAGS: FLAGS,
    ATTITUDES: ATTITUDES, WEEKDAYS: WEEKDAYS, PAY_METHODS: PAY_METHODS,
    HOMEWORK_TYPES: HOMEWORK_TYPES, SUBMIT_STATUS: SUBMIT_STATUS,
    BOOK_CATEGORIES: BOOK_CATEGORIES, LOAN_DAYS: LOAN_DAYS,
    CLASS_COLORS: CLASS_COLORS,
    get: get, save: save, onChange: onChange, onRecordChange: onRecordChange,
    allRecords: allRecords, findRecord: findRecord, applyRemote: applyRemote, stampAll: stampAll,
    students: students, student: student, saveStudent: saveStudent,
    archiveStudent: archiveStudent, deleteStudent: deleteStudent,
    studentsOnDay: studentsOnDay,
    attendanceOn: attendanceOn, attendanceFor: attendanceFor, attendanceRange: attendanceRange,
    setAttendance: setAttendance, toggleFlag: toggleFlag,
    isIssue: isIssue, toggleAttitude: toggleAttitude,
    classes: classes, klass: klass, saveClass: saveClass, deleteClass: deleteClass,
    studentsInClass: studentsInClass, scheduleOf: scheduleOf,
    memos: memos, addMemo: addMemo, deleteMemo: deleteMemo,
    tasks: tasks, addTask: addTask, updateTask: updateTask, deleteTask: deleteTask,
    payments: payments, paymentFor: paymentFor, feeOf: feeOf, dueDateFor: dueDateFor,
    paymentStatus: paymentStatus, savePayment: savePayment, deletePayment: deletePayment,
    generateBills: generateBills, paymentSummary: paymentSummary, paymentHistory: paymentHistory,
    homeworks: homeworks, homework: homework, submissions: submissions,
    submissionFor: submissionFor, saveHomework: saveHomework, setSubmission: setSubmission,
    deleteHomework: deleteHomework, homeworkProgress: homeworkProgress,
    vocabLogs: vocabLogs, saveVocabLog: saveVocabLog, deleteVocabLog: deleteVocabLog,
    vocabSummary: vocabSummary,
    books: books, book: book, bookByCode: bookByCode, saveBook: saveBook, deleteBook: deleteBook,
    loans: loans, openLoanOf: openLoanOf, bookStatus: bookStatus,
    lendBook: lendBook, returnBook: returnBook, deleteLoan: deleteLoan, overdueLoans: overdueLoans,
    ensureCode: ensureCode, studentByCode: studentByCode, findStudent: findStudent,
    summarize: summarize, dayOverview: dayOverview,
    exportJson: exportJson, importJson: importJson, resetAll: resetAll, saveAcademy: saveAcademy,
    migratePatrols: migratePatrols
  };
})();
