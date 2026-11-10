/* ===== 학습 현황판 (2026-11-07 추가) =====
 * 학생 명부의 등록생을 한 표로 보고, 학생마다
 *  - 웨일 프로그램 사용 여부 (웨일스튜던트 · 웨일튜터 3종 · 이북 · 스마트보카)
 *  - 센텐스뱅크 레벨·진도 (파닉스 단계 학생은 '파닉스 카드' 과정 — 센텐스뱅크처럼 카드로 진행, 2026-11-07)
 *  - 본사 교재 진도와 다음 교재 주문 알림 (80% 노랑 · 90% 빨강 · 주문완료 파랑)
 *  - 보유 교재 (부교재·예습·복습·문법·단어)
 *  - 주간 공통 숙제 (프랙티스북 · 데일리시트 10회) 와 개인 숙제 (ERLT · 원서 2권 · 추가 과제)
 *  - 레벨 21회차 진도 (Unit 1~4 × Day1~4 + 위클리, 21회차 먼슬리) 와 웨일튜터 AI 테스트 기록 — whaletutor.js (2026-11-07)
 * 를 체크합니다. 기록은 Store 의 boards 컬렉션(학생 1명당 1줄)에 저장되고 sync.js 가 다른 기기로 보냅니다.
 */
window.Views = window.Views || {};
Views.board = (function () {

  var PROGRAMS = [['ws', '웨일스튜던트', 'WS'], ['tg', '웨일튜터 · 고래영어', '튜터·고래'],
    ['to', '웨일튜터 · 오션라이팅', '튜터·오션'], ['tl', '웨일튜터 · 영어도서관', '튜터·도서관'],
    ['eb', '이북', '이북'], ['sb', '스마트보카 앱', '스마트보카']];
  var MAT_TYPES = ['부교재', '예습', '복습', '문법', '단어', '기타'];
  var EXTRAS = [['news', '영자신문'], ['gram', '문법'], ['read', '독해'], ['voca', '단어'], ['exam', '시험대비']];
  var WARN = 80, URGENT = 90;
  // 파닉스 서바이벌 카드 (dailytest 저장소 cards/phonics.html, 2026-11-07)
  var PHONICS_URL = 'https://a28008005-sketch.github.io/dailytest/cards/phonics.html';
  var SENTENCE_URL = 'https://a28008005-sketch.github.io/dailytest/cards/survival.html';
  var SB_LEVELS = ['240', '520', '860', '1240', '1680'];
  // 교재 한 권의 프랙티스북 · 데일리테스트 회차 (2026-11-07, 원장님 기준 20회차)
  var SESSIONS = 20;
  var STATE_LABEL = { ok: '진행 중', warn: '주문 준비', urgent: '지금 주문', ordered: '주문 완료' };

  var week = mondayOf(new Date());
  var filter = { q: '', classId: '', alertOnly: false };
  var viewEl = null;
  var mode = 'table';                     // 'table' 표로 보기 · 'wt' 웨일튜터 한눈에
  var hmSort = 'worry';                   // 한눈에 보기 정렬: 걱정 순 · 반 순
  var modal = { wrap: null, sid: null, tab: 'info', showPw: false, confirm: '', sel: 0 };
  var saveTimers = {};
  var popupDay = '';
  var drafts = {};        // 아직 저장 전인 학생 기록 (처음 체크하는 순간 저장소로 들어갑니다)
  var typing = false;     // 상세 창에서 글자를 입력하는 중

  /* ---------- 날짜 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mondayOf(d) {
    var x = new Date(d); x.setHours(12, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return ymd(x);
  }
  function shiftWeek(key, n) { var d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + 7 * n); return ymd(d); }
  function weekLabel(key) {
    var d = new Date(key + 'T12:00:00'), e = new Date(d); e.setDate(e.getDate() + 6);
    return (d.getMonth() + 1) + '.' + d.getDate() + ' – ' + (e.getMonth() + 1) + '.' + e.getDate();
  }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
  function esc(s) { return U.esc(s == null ? '' : String(s)); }

  /* ---------- 기록 ---------- */
  function blank(sid) {
    return { studentId: sid, tutorId: '', tutorPw: '', programs: {}, sbank: { track: 'sb', level: '', done: 0, total: 0 },
      current: { title: '', start: '', done: 0, total: 0, next: '', ordered: false, pb: 0, pbTotal: SESSIONS, dt: 0, dtTotal: SESSIONS },
      history: [], materials: [], special: { erlt: { on: false, book: '' }, wonseo: { on: false }, extras: {} },
      hw: {}, memo: '' };
  }
  /** 저장된 기록을 빠진 칸 없이 채워서 돌려줍니다. 저장된 기록이 있으면 그 객체를 그대로 고칩니다. */
  function rec(sid) {
    var r = Store.board(sid);
    var b = blank(sid);
    if (!r) return drafts[sid] || (drafts[sid] = b);
    if (drafts[sid]) delete drafts[sid];
    Object.keys(b).forEach(function (k) { if (r[k] === undefined || r[k] === null) r[k] = b[k]; });
    r.sbank = Object.assign({}, b.sbank, r.sbank);
    r.current = Object.assign({}, b.current, r.current);
    r.special = r.special || {};
    r.special.erlt = Object.assign({}, b.special.erlt, r.special.erlt);
    r.special.wonseo = Object.assign({}, b.special.wonseo, r.special.wonseo);
    r.special.extras = r.special.extras || {};
    if (!Array.isArray(r.history)) r.history = [];
    if (!Array.isArray(r.materials)) r.materials = [];
    return r;
  }
  function wk(r, key) {
    var w = (r.hw || {})[key || week] || {};
    return { practice: !!w.practice, pbN: num(w.pbN), dtN: num(w.dtN), daily: num(w.daily), erlt: !!w.erlt, w1: w.w1 || '', w2: w.w2 || '',
      c1: !!w.c1, c2: !!w.c2, ex: Object.assign({}, w.ex || {}) };
  }
  function setWk(r, patch) { r.hw[week] = Object.assign(wk(r), patch); }
  /** 프랙티스북(pb) · 데일리테스트(dt) 성취율 */
  function ach(c, k) {
    var tot = num(c[k + 'Total']) || SESSIONS, d = Math.min(num(c[k]), tot);
    return { d: d, t: tot, p: Math.round(d / tot * 100) };
  }
  function achHtml(c, k, label) {
    var a = ach(c, k);
    return '<div class="bd-ach' + (a.p >= 100 ? ' full' : '') + '"><span class="lb">' + label + ' <b class="pct">' + a.p + '%</b></span>' +
      '<span class="bd-step sm"><button data-act="ses" data-k="' + k + '" data-n="-1" aria-label="' + label + ' 1회 빼기">−</button>' +
      '<span>' + a.d + '/' + a.t + '</span><button data-act="ses" data-k="' + k + '" data-n="1" aria-label="' + label + ' 1회 더하기">+</button></span>' +
      '<div class="bd-bar"><i style="width:' + a.p + '%"></i></div></div>';
  }
  /** 레벨 학생: 프랙티스북 · 데일리테스트는 회차 기록(웨일튜터 + 선생님 체크)에서 셉니다 */
  function autoAch(st) {
    var one = function (label, d, extra) {
      var p = Math.round(d / 20 * 100);
      return '<div class="bd-ach auto' + (p >= 100 ? ' full' : '') + '"><span class="lb">' + label + ' <b class="pct">' + d + '/20</b></span>' +
        '<div class="bd-bar"><i style="width:' + p + '%"></i></div>' + (extra ? '<span class="ex">' + extra + '</span>' : '') + '</div>';
    };
    return '<button class="bd-achbtn" data-act="open" data-tab="level" title="회차별로 보기">' +
      one('프랙티스북', st.pb) + one('데일리테스트', st.dt, st.dtAvg != null ? '평균 ' + st.dtAvg + '점' : '') + '</button>';
  }
  /** 지금 교재 이름에서 권(vol) 번호, 진도에서 지금 Unit 을 뽑습니다. */
  function bookVolUnit(r, lvPrefix) {
    if (leveled(r)) {
      var info = WT.bookInfo(WT.bookKey(r)), st = WT.stats(r);
      if (info && (!lvPrefix || info.name.toLowerCase().indexOf(lvPrefix.toLowerCase()) === 0))
        return { v: info.vol, u: st.next && st.next.u ? st.next.u : 0 };
    }
    var t = String(r.current.title || ''), v = 0, u = 0;
    var m = /vol\.?\s*(\d)/i.exec(t) || /phonics\s*(\d)/i.exec(t);
    if (m && (!lvPrefix || t.toLowerCase().indexOf(lvPrefix.toLowerCase()) === 0)) v = +m[1];
    if (v && r.current.total) u = Math.min(4, Math.floor(num(r.current.done) / 5) + 1);
    return { v: v, u: u };
  }

  /** 레벨 21회차 틀로 관리하는 교재인가 (웨일 파닉스 · 센텐스뱅크 240~1680) */
  function leveled(r) { return !!WT.bookKey(r); }
  function bookState(r) {
    var c = r.current;
    if (leveled(r)) {
      var st = WT.stats(r);
      if (!c.title) c.title = (WT.bookInfo(st.key) || {}).name || '';
      var lp = st.pct, lk = st.finished ? 'done' : c.ordered ? 'ordered' : lp >= URGENT ? 'urgent' : lp >= WARN ? 'warn' : 'ok';
      return { k: lk === 'done' ? (c.ordered ? 'ordered' : 'urgent') : lk, p: lp, st: st };
    }
    if (!c.title || !c.total) return { k: 'none', p: 0 };
    var p = Math.min(100, Math.round(c.done / c.total * 100));
    if (c.ordered) return { k: 'ordered', p: p };
    if (p >= URGENT) return { k: 'urgent', p: p };
    if (p >= WARN) return { k: 'warn', p: p };
    return { k: 'ok', p: p };
  }

  /** 즉시 저장 (체크·버튼) */
  function commit(r) { clearTimeout(saveTimers[r.studentId]); Store.saveBoard(r); }
  /** 글자 입력은 잠시 모았다가 저장 */
  function commitLater(r) {
    clearTimeout(saveTimers[r.studentId]);
    saveTimers[r.studentId] = setTimeout(function () { Store.saveBoard(r); }, 600);
  }

  /** 기록을 고치고, 교재 주문 단계가 바뀌면 알려 줍니다. */
  function mutate(sid, fn) {
    var r = rec(sid);
    var before = bookState(r).k;
    fn(r);
    commit(r);
    var b = bookState(r);
    if (b.k !== before && (b.k === 'urgent' || b.k === 'warn')) {
      var s = Store.student(sid);
      UI.toast((s ? s.name + ' · ' : '') + r.current.title + ' ' + b.p + '% — ' +
        (b.k === 'urgent' ? '다음 교재를 지금 주문해 주세요' : '다음 교재 주문을 준비하세요'), b.k === 'urgent');
    }
    refresh();
  }

  /* ---------- 대상 학생 ---------- */
  function className(s) { var c = s.classId ? Store.klass(s.classId) : null; return c ? c.name : ''; }
  function roster() {
    return Store.students({ active: true }).slice().sort(function (a, b) {
      return className(a).localeCompare(className(b), 'ko') || String(a.name).localeCompare(String(b.name), 'ko');
    });
  }
  function visible() {
    var q = filter.q.trim().toLowerCase();
    return roster().filter(function (s) {
      var r = rec(s.id);
      if (filter.classId === '__none__' && s.classId) return false;
      if (filter.classId && filter.classId !== '__none__' && s.classId !== filter.classId) return false;
      if (filter.alertOnly && ['warn', 'urgent'].indexOf(bookState(r).k) < 0) return false;
      if (q) {
        var hay = [s.name, className(s), s.grade, r.current.title, r.current.next, r.special.erlt.book]
          .concat(r.materials.map(function (m) { return m.title; })).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  /** 교재 주문이 필요한 학생 (진도 높은 순) */
  function orderList(kinds) {
    return roster().map(function (s) { return { s: s, r: rec(s.id) }; })
      .filter(function (x) { return kinds.indexOf(bookState(x.r).k) >= 0; })
      .sort(function (a, b) { return bookState(b.r).p - bookState(a.r).p; });
  }

  /* ---------- 화면 ---------- */
  function title() { return '학습 현황판'; }
  function sub() {
    var n = orderList(['urgent', 'warn']).length;
    return n ? '교재 주문 필요 ' + n + '명' : '학생별 교재 · 숙제 · 웨일 프로그램';
  }

  function statsHtml(list) {
    var pcts = { pb: [], dt: [], ai: [] };
    list.forEach(function (s) {
      var r = rec(s.id);
      if (leveled(r)) {
        var st = WT.stats(r), base = Math.max(1, Math.min(20, st.reached));   // 지금까지 나간 회차 기준
        pcts.pb.push(Math.min(100, Math.round(st.pb / base * 100))); pcts.dt.push(Math.min(100, Math.round(st.dt / base * 100)));
        if (st.ai != null) pcts.ai.push(st.ai);
      } else if (r.current.title) { pcts.pb.push(ach(r.current, 'pb').p); pcts.dt.push(ach(r.current, 'dt').p); }
    });
    var avg = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; };
    var pbAvg = avg(pcts.pb), dtAvg = avg(pcts.dt), aiAvg = pcts.ai.length ? avg(pcts.ai) : null;
    var st = list.map(function (s) { return bookState(rec(s.id)).k; });
    var urg = st.filter(function (k) { return k === 'urgent'; }).length;
    var warn = st.filter(function (k) { return k === 'warn'; }).length;
    var ord = st.filter(function (k) { return k === 'ordered'; }).length;
    return '<div class="bd-stats">' +
      '<button class="bd-stat" data-act="mode" data-k="wt"><span>웨일튜터 AI 테스트 평균</span><b>' + (aiAvg == null ? '–' : aiAvg + '<small>%</small>') + '</b>' +
        '<small>프랙티스북 ' + pbAvg + '% · 데일리테스트 ' + dtAvg + '% (나간 회차 기준) · 눌러서 한눈에 보기</small></button>' +
      '<button class="bd-stat' + (urg ? ' bad' : warn ? ' warn' : '') + (filter.alertOnly ? ' on' : '') + '" data-act="alertonly">' +
        '<span>교재 주문 필요</span><b>' + (urg + warn) + '</b><small>지금 주문 ' + urg + ' · 준비 ' + warn +
        (filter.alertOnly ? ' · 눌러서 전체 보기' : ' · 눌러서 모아 보기') + '</small></button>' +
      '<div class="bd-stat"><span>다음 교재 주문 완료</span><b>' + ord + '</b><small>도착하면 완료 처리</small></div>' +
    '</div>';
  }

  function ordersHtml() {
    var list = orderList(['urgent', 'warn']);
    if (!list.length) return '';
    return '<div class="bd-orders"><h2>' + Icon.svg('alert', 15) + ' 교재 주문 알림</h2>' +
      list.map(function (x) {
        var b = bookState(x.r);
        return '<span class="bd-ord ' + b.k + '"><b>' + esc(x.s.name) + '</b><em>' + esc(x.r.current.title) +
          (x.r.current.next ? ' → ' + esc(x.r.current.next) : '') + '</em><span class="p">' + b.p + '%</span>' +
          '<button data-act="ordered" data-sid="' + x.s.id + '">주문완료</button></span>';
      }).join('') + '</div>';
  }

  function toolsHtml() {
    var cs = Store.classes();
    var curWeek = mondayOf(new Date());
    return '<div class="bd-tools">' +
      '<div class="seg bd-mode"><button class="' + (mode === 'table' ? 'on' : '') + '" data-act="mode" data-k="table">표로 보기</button>' +
        '<button class="' + (mode === 'wt' ? 'on' : '') + '" data-act="mode" data-k="wt">웨일튜터 한눈에</button></div>' +
      '<button class="btn sm" data-act="wtimport">' + Icon.svg('cloud', 14) + ' 웨일튜터 기록 가져오기</button>' +
      '<div class="bd-week"><button data-act="wk" data-n="-1" aria-label="이전 주">‹</button>' +
        '<strong>' + weekLabel(week) + '</strong>' +
        (week === curWeek ? '<span class="now">이번 주</span>' : '<button data-act="wk" data-n="0" class="now">이번 주로</button>') +
        '<button data-act="wk" data-n="1" aria-label="다음 주">›</button></div>' +
      '<input type="search" id="bd-q" class="bd-search" placeholder="이름 · 반 · 교재명 검색" value="' + esc(filter.q) + '">' +
      '<select id="bd-class" class="bd-select"><option value="">전체 반</option>' +
        cs.map(function (c) { return '<option value="' + c.id + '"' + (filter.classId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
        '<option value="__none__"' + (filter.classId === '__none__' ? ' selected' : '') + '>반 미지정</option></select>' +
    '</div>';
  }

  /** 21칸 회차 줄 (D1~4 네모 · 위클리 W · 먼슬리 M). 색은 웨일튜터 AI 테스트 점수 */
  function aiClass(s) {
    if (s.kind === 'M') return s.done ? 'g4' : '';
    if (s.ai == null) return s.done ? 'g3' : '';
    if (s.ai < 0) return 'miss';
    var p = s.aiPct;
    return p >= 90 ? 'g4' : p >= 75 ? 'g3' : p >= 60 ? 'g2' : p >= 40 ? 'g1' : 'g0';
  }
  function sesTitle(s) {
    var t = s.label + (s.date ? ' · ' + s.date.slice(5).replace('-', '/') : '');
    if (s.ai != null) t += s.ai < 0 ? ' · AI 테스트 안 함' : ' · AI ' + s.ai + '/' + s.max;
    if (s.dt != null) t += ' · 데일리 ' + s.dt;
    if (s.wk != null) t += ' · 위클리 ' + s.wk;
    if (s.pb) t += ' · 프랙티스북 ✓';
    if (s.card) t += ' · 카드 연습 ✓';
    if (s.mt != null) t += ' · 먼슬리 ' + s.mt;
    return t;
  }
  function stripHtml(st, sel) {
    var nxt = st.next ? st.next.n : 0;
    return '<div class="bd-strip">' + st.ss.map(function (x) {
      return '<button class="sq k' + x.kind + ' ' + aiClass(x) + (x.n === nxt ? ' now' : '') + (sel === x.n ? ' sel' : '') + '" data-act="open" data-tab="level" data-n="' + x.n + '" title="' + esc(sesTitle(x)) + '">' +
        (x.kind === 'L' ? '' : WT.shortOf(x.n)) + '</button>' + (x.kind === 'W' && x.n < 20 ? '<i class="gap"></i>' : '');
    }).join('') + '</div>';
  }
  function cellLevel(s, r, b) {
    var st = b.st, c = r.current;
    var nx = st.next ? '다음 ' + st.next.label : '레벨 종료 ✓';
    return '<div class="bd-book lv st-' + b.k + '">' +
      '<div class="row"><div class="t" title="' + esc(c.title) + '">' + esc(c.title) + '</div><span class="pill">' + (st.finished ? '레벨 종료' : STATE_LABEL[b.k]) + '</span></div>' +
      stripHtml(st) +
      '<div class="row"><span class="muted">' + st.reached + '/' + WT.TOTAL + '회차 · ' + nx + '</span>' +
        (st.ai != null ? '<span class="bd-ai ' + aiClass({ kind: 'L', ai: 1, aiPct: st.ai }) + '" title="웨일튜터 AI 테스트 평균 (' + st.aiN + '회)">AI ' + st.ai + '%</span>' : '') + '</div>' +
      (c.next ? '<div class="row"><span class="next">다음 교재 ' + esc(c.next) + '</span></div>' : '') +
      '</div>';
  }

  function cellBook(s, r) {
    var c = r.current, b = bookState(r);
    if (b.st) return cellLevel(s, r, b);
    if (!c.title) return '<button class="bd-add" data-act="open" data-tab="book">+ 본사 교재 등록</button>';
    if (!c.total) return '<div class="bd-book"><div class="t">' + esc(c.title) + '</div><button class="bd-add" data-act="open" data-tab="book">전체 단원 수를 넣으면 진도가 보입니다</button></div>';
    return '<div class="bd-book st-' + b.k + '">' +
      '<div class="row"><div class="t" title="' + esc(c.title) + '">' + esc(c.title) + '</div><span class="pill">' + STATE_LABEL[b.k] + '</span></div>' +
      '<div class="row"><div class="bd-bar"><i style="width:' + b.p + '%"></i></div><span class="pct">' + b.p + '%</span></div>' +
      '<div class="row"><span class="bd-step"><button data-act="unit" data-n="-1" aria-label="진도 하나 줄이기">−</button><span>' + c.done + '/' + c.total + '</span>' +
        '<button data-act="unit" data-n="1" aria-label="진도 하나 올리기">+</button></span>' +
        '<span class="next">' + (c.next ? '다음 ' + esc(c.next) : '') + '</span></div></div>';
  }

  function cellMat(r) {
    var act = r.materials.filter(function (m) { return !m.finished; });
    if (!act.length) return '<button class="bd-chip ghost" data-act="open" data-tab="mat">+ 등록</button>';
    var cnt = {};
    act.forEach(function (m) { cnt[m.type] = (cnt[m.type] || 0) + 1; });
    return '<div class="bd-chips">' + MAT_TYPES.filter(function (t) { return cnt[t]; }).map(function (t) {
      var names = act.filter(function (m) { return m.type === t; }).map(function (m) { return m.title; }).join(', ');
      return '<button class="bd-chip tag" data-act="open" data-tab="mat" title="' + esc(names) + '">' + t + ' ' + cnt[t] + '</button>';
    }).join('') + '</div>';
  }

  function cellSpecial(r) {
    var w = wk(r), sp = r.special, out = [];
    if (sp.erlt.on) out.push('<button class="bd-chip' + (w.erlt ? ' done' : '') + '" data-act="sp" data-k="erlt" title="' + esc(sp.erlt.book) + '">ERLT · ' + esc(sp.erlt.book || '도서명 입력') + '</button>');
    if (sp.wonseo.on) {
      [['w1', 'c1', '①'], ['w2', 'c2', '②']].forEach(function (x) {
        out.push(w[x[0]]
          ? '<button class="bd-chip' + (w[x[1]] ? ' done' : '') + '" data-act="sp" data-k="' + x[1] + '" title="' + esc(w[x[0]]) + '">' + x[2] + ' ' + esc(w[x[0]]) + '</button>'
          : '<button class="bd-chip ghost" data-act="open" data-tab="hw">' + x[2] + ' 이번 주 원서</button>');
      });
    }
    EXTRAS.forEach(function (e) {
      if (sp.extras[e[0]]) out.push('<button class="bd-chip' + (w.ex[e[0]] ? ' done' : '') + '" data-act="ex" data-k="' + e[0] + '">' + e[1] + '</button>');
    });
    if (!out.length) return '<button class="bd-chip ghost" data-act="open" data-tab="hw">+ 개인 숙제</button>';
    return '<div class="bd-chips">' + out.join('') + '</div>';
  }

  /** 그 학생 레벨·권·Unit 으로 바로 열리는 카드 링크 (카드 화면에서 다른 레벨도 고를 수 있음) */
  function cardLink(base, lv, v, u, label) {
    var href = base + '?lv=' + encodeURIComponent(lv) + '&v=' + v + (u ? '&u=' + u : '') + '&from=board';
    return '<a class="bd-chip tag go" target="_blank" rel="noopener" href="' + href + '" title="' + label + ' ' + esc(lv) + ' Vol.' + v + (u ? ' Unit ' + u : '') + ' 바로 열기">' +
      label + ' ▶ <small>Vol.' + v + (u ? ' · U' + u : '') + '</small></a>';
  }

  /** 센텐스뱅크 · 파닉스 카드 칸 */
  function sbCell(sb, r) {
    var pc = sb.track === 'pc';
    if (!sb.level && !pc) return '<button class="bd-chip ghost" data-act="open" data-tab="info">+ 레벨</button>';
    var bar = sb.total ? ' <span class="muted">' + sb.done + '/' + sb.total + '</span><div class="bd-bar"><i style="width:' +
      Math.min(100, Math.round(sb.done / sb.total * 100)) + '%"></i></div>' : '';
    if (pc) {
      var pv = (/(\d)/.exec(sb.level || '') || [])[1];
      var pu = r ? bookVolUnit(r, 'whale phonics') : { v: 0, u: 0 };
      if (pu.v && String(pu.v) !== String(pv)) pu.u = 0;   // 단계와 지금 교재 권이 다르면 Unit 은 고르게
      return (sb.level ? '<b>' + esc(sb.level) + '</b> ' : '') +
        (pv ? cardLink(PHONICS_URL, 'Phonics', pv, pu.u, '파닉스카드') : '<button class="bd-chip tag" data-act="open" data-tab="info">파닉스카드</button>') + bar;
    }
    var link = '';
    if (SB_LEVELS.indexOf(String(sb.level)) >= 0) {
      var vu = r ? bookVolUnit(r, String(sb.level)) : { v: 0, u: 0 };
      link = ' ' + cardLink(SENTENCE_URL, String(sb.level), vu.v || 1, vu.v ? vu.u : 0, '센텐스카드');
    }
    return '레벨 <b>' + esc(sb.level) + '</b>' + link + bar;
  }

  function tableHtml(list) {
    if (!roster().length) return UI.emptyBox('학생 명부에 등록생이 없습니다. 학생 명부에서 먼저 학생을 등록해 주세요.', 'students');
    if (!list.length) return UI.emptyBox('조건에 맞는 학생이 없습니다. 검색어나 반 선택을 확인해 주세요.', 'search');
    return '<div class="bd-tablebox"><table class="bd-table"><thead><tr>' +
      '<th class="bd-sticky">학생</th><th>웨일 프로그램</th><th>센텐스뱅크 · 파닉스 카드</th><th>본사 교재 진도</th><th>보유 교재</th><th>공통 숙제</th><th>개인 숙제</th>' +
      '</tr></thead><tbody>' +
      list.map(function (s) {
        var r = rec(s.id), w = wk(r), b = bookState(r), sb = r.sbank;
        return '<tr data-sid="' + s.id + '" class="s-' + b.k + '">' +
          '<td class="bd-sticky bd-name"><button class="nm" data-act="open">' + esc(s.name) + '</button><span class="cls">' + esc(className(s) || s.grade || '반 미지정') + '</span></td>' +
          '<td class="bd-prog"><div class="bd-chips">' + PROGRAMS.map(function (p) {
            return '<button class="bd-chip' + (r.programs[p[0]] ? ' on' : '') + '" data-act="prog" data-k="' + p[0] + '" title="' + p[1] + '" aria-pressed="' + !!r.programs[p[0]] + '">' + p[2] + '</button>';
          }).join('') + '</div></td>' +
          '<td class="bd-sb">' + sbCell(sb, r) + '</td>' +
          '<td class="bd-bk">' + cellBook(s, r) + '</td>' +
          '<td class="bd-mat">' + cellMat(r) + '</td>' +
          '<td class="bd-hw"><div class="hw">' +
            (b.st ? autoAch(b.st) : achHtml(r.current, 'pb', '프랙티스북') + achHtml(r.current, 'dt', '데일리테스트')) +
            '<span class="bd-daily' + (w.daily >= 10 ? ' full' : '') + '" style="--p:' + (w.daily * 10) + '%">' +
              '<button class="plus" data-act="daily" data-n="1" aria-label="데일리시트 읽기 1회 추가">데일리시트 <b>' + w.daily + '/10</b></button>' +
              '<button class="minus" data-act="daily" data-n="-1" aria-label="1회 빼기">−</button></span>' +
          '</div></td>' +
          '<td class="bd-sp">' + cellSpecial(r) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function legendHtml() {
    return '<p class="bd-legend"><span><i style="background:var(--warn)"></i>진도 ' + WARN + '% 이상 · 주문 준비</span>' +
      '<span><i style="background:var(--bad)"></i>' + URGENT + '% 이상 · 지금 주문</span>' +
      '<span><i style="background:var(--blue)"></i>다음 교재 주문 완료</span>' +
      '<span>숙제는 주 단위로 따로 기록됩니다. 지난주 기록은 ‹ 버튼으로 확인하세요.</span></p>';
  }

  function render(el) {
    viewEl = el;
    var list = visible();
    var all = roster();
    el.innerHTML = '<div class="stack bd">' + statsHtml(all) + ordersHtml() + toolsHtml() +
      (mode === 'wt' ? heatHtml(list) : tableHtml(list) + legendHtml()) +
      (all.length ? '<p class="bd-count">등록생 ' + all.length + '명 · 학생 명부 기준</p>' : '') + '</div>';
    bind(el);
    // 다른 선생님 기기에서 바뀐 내용이 들어오면 열린 상세 창도 맞춰 줍니다 (입력 중일 땐 건드리지 않음).
    if (!typing && modal.wrap && modal.wrap.parentNode) {
      var a = document.activeElement;
      if (!(a && modal.wrap.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) paintModal();
    }
    maybePopup();
  }
  function refresh() {
    if (viewEl && document.body.contains(viewEl) && location.hash.indexOf('#/board') === 0) {
      App.setSub(sub());
      render(viewEl);
    } else if (modal.wrap && modal.wrap.parentNode) {
      paintModal();
    }
  }

  function bind(el) {
    el.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t || !el.contains(t)) return;
      var row = t.closest('tr[data-sid]');
      var sid = t.getAttribute('data-sid') || (row && row.getAttribute('data-sid'));
      handle(t.getAttribute('data-act'), t, sid);
    };
    var q = el.querySelector('#bd-q');
    if (q) q.oninput = function () {
      filter.q = q.value;
      var box = el.querySelector('.bd-tablebox') || el.querySelector('.empty');
      var html = mode === 'wt' ? heatHtml(visible()) : tableHtml(visible());
      if (box) { var tmp = document.createElement('div'); tmp.innerHTML = html; box.parentNode.replaceChild(tmp.firstChild, box); }
    };
    var c = el.querySelector('#bd-class');
    if (c) c.onchange = function () { filter.classId = c.value; render(el); };
  }

  /* ---------- 동작 (표 · 상세 창 공통) ---------- */
  function handle(act, t, sid) {
    var k = t.getAttribute('data-k'), n = +t.getAttribute('data-n');
    switch (act) {
      case 'wk': week = n === 0 ? mondayOf(new Date()) : shiftWeek(week, n); render(viewEl); if (modal.wrap) paintModal(); break;
      case 'alertonly': filter.alertOnly = !filter.alertOnly; render(viewEl); break;
      case 'open': openModal(sid, t.getAttribute('data-tab'), +t.getAttribute('data-n') || 0); break;
      case 'prog': mutate(sid, function (r) { r.programs[k] = !r.programs[k]; }); break;
      case 'unit': mutate(sid, function (r) { r.current.done = Math.max(0, Math.min(r.current.total, r.current.done + n)); }); break;
      case 'mode': mode = k; render(viewEl); break;
      case 'hmsort': hmSort = k; render(viewEl); break;
      case 'wtimport': openImport(); break;
      case 'ses': mutate(sid, function (r) {
          var c = r.current, tot = num(c[k + 'Total']) || SESSIONS, before = num(c[k]);
          c[k] = Math.max(0, Math.min(tot, before + n));
          var w = wk(r), key = k === 'pb' ? 'pbN' : 'dtN', p = {};
          p[key] = Math.max(0, num(w[key]) + (c[k] - before));   // 이번 주에 한 회차 수
          if (k === 'pb') p.practice = p.pbN > 0;
          setWk(r, p);
        }); break;
      case 'daily': mutate(sid, function (r) { setWk(r, { daily: Math.max(0, Math.min(10, wk(r).daily + n)) }); }); break;
      case 'sp': mutate(sid, function (r) { var p = {}; p[k] = !wk(r)[k]; setWk(r, p); }); break;
      case 'ex': mutate(sid, function (r) { var w = wk(r); w.ex[k] = !w.ex[k]; setWk(r, { ex: w.ex }); }); break;
      case 'ordered':
        mutate(sid, function (r) { r.current.ordered = !r.current.ordered; });
        if (popupOpen()) paintPopup();
        break;
    }
  }

  /* ---------- 학생 상세 창 ---------- */
  function fld(label, path, val, type, ph) {
    type = type || 'text';
    return '<label class="fld">' + label + '<input id="bd-f-' + path.replace(/\./g, '-') + '" data-f="' + path + '" type="' + type +
      '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"' + (type === 'number' ? ' min="0" inputmode="numeric"' : '') + '></label>';
  }

  function tabInfo(s, r) {
    return '<div class="bd-sec"><h4>웨일튜터 로그인</h4><div class="form-grid">' +
        '<label class="fld">아이디<div class="bd-pw"><input id="bd-f-tutorId" data-f="tutorId" value="' + esc(r.tutorId) + '" autocomplete="off">' +
          '<button class="btn sm" data-act="copy" data-v="tutorId">복사</button></div></label>' +
        '<label class="fld">비밀번호<div class="bd-pw"><input id="bd-f-tutorPw" data-f="tutorPw" type="' + (modal.showPw ? 'text' : 'password') + '" value="' + esc(r.tutorPw) + '" autocomplete="off">' +
          '<button class="btn sm" data-act="showpw">' + (modal.showPw ? '숨기기' : '보기') + '</button>' +
          '<button class="btn sm" data-act="copy" data-v="tutorPw">복사</button></div></label></div>' +
        '<p class="hint">원생관리에 로그인한 선생님은 모두 볼 수 있습니다.</p></div>' +
      '<div class="bd-sec"><h4>웨일 프로그램 사용</h4><div class="bd-bigtogs">' + PROGRAMS.map(function (p) {
        return '<button class="bd-tog' + (r.programs[p[0]] ? ' on' : '') + '" data-act="prog" data-k="' + p[0] + '"><i></i>' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="bd-sec"><h4>센텐스뱅크 · 파닉스 카드</h4>' +
        '<div class="seg" style="margin-bottom:10px"><button class="' + (r.sbank.track !== 'pc' ? 'on' : '') + '" data-act="track" data-k="sb">센텐스뱅크</button>' +
        '<button class="' + (r.sbank.track === 'pc' ? 'on' : '') + '" data-act="track" data-k="pc">파닉스 카드</button></div>' +
        (r.sbank.track === 'pc' ? '<p class="hint" style="margin:0 0 8px">파닉스 단계 학생은 센텐스뱅크 대신 파닉스 서바이벌 카드로 진행합니다. 표의 「파닉스 카드 ▶」를 누르면 그 권의 카드가 열립니다. 완료/전체는 끝낸 Unit 수(전체 4)로 적어도 됩니다.</p>' : '') +
        '<div class="bd-grid3">' +
        (r.sbank.track === 'pc'
          ? fld('파닉스 단계', 'sbank.level', r.sbank.level, 'text', '예: Phonics 3') + fld('완료 카드', 'sbank.done', r.sbank.done, 'number') + fld('전체 카드', 'sbank.total', r.sbank.total, 'number')
          : fld('레벨', 'sbank.level', r.sbank.level, 'text', '예: 240') + fld('완료 단원', 'sbank.done', r.sbank.done, 'number') + fld('전체 단원', 'sbank.total', r.sbank.total, 'number')) +
      '</div></div>' +
      '<div class="bd-sec"><h4>현황판 메모</h4><label class="fld"><textarea id="bd-f-memo" data-f="memo" rows="3" placeholder="교재·숙제 관련 특이사항">' + esc(r.memo) + '</textarea></label>' +
        '<p class="hint">이름·반·연락처는 학생 명부에서 고칩니다.</p></div>';
  }

  function tabBook(s, r) {
    var c = r.current, b = bookState(r);
    var finishUi = !c.title ? '' : (modal.confirm === 'finish'
      ? '<div class="bd-confirm">「' + esc(c.title) + '」을 지난 교재로 옮기고 ' + (c.next ? '「' + esc(c.next) + '」을 새로 시작합니다.' : '현재 교재 칸을 비웁니다.') +
        ' <button class="btn sm primary" data-act="finish-yes">확인</button><button class="btn sm" data-act="cancel">취소</button></div>'
      : '<button class="btn" data-act="finish">이 교재 완료 처리</button>');
    return '<div class="bd-sec"><h4>지금 진행 중인 본사 교재</h4>' +
      '<div class="bd-panel' + (b.k !== 'none' ? ' st-' + b.k : '') + '">' +
        (b.k !== 'none' ? '<div class="row"><div><b class="big">' + b.p + '%</b> <span class="muted">' + c.done + ' / ' + c.total + ' 단원</span></div><span class="pill">' + STATE_LABEL[b.k] + '</span></div>' +
          '<div class="bd-bar"><i style="width:' + b.p + '%"></i></div>' : '') +
        '<div class="bd-grid3">' + fld('교재명', 'current.title', c.title, 'text', '예: Whale Phonics 2') +
          fld('완료 단원', 'current.done', c.done, 'number') + fld('전체 단원', 'current.total', c.total, 'number') + '</div>' +
        '<div class="form-grid">' + fld('시작일', 'current.start', c.start, 'date') + fld('다음 교재', 'current.next', c.next, 'text', '주문할 교재명') + '</div>' +
        '<div class="bd-grid4">' + fld('프랙티스북 끝낸 회차', 'current.pb', num(c.pb), 'number') + fld('프랙티스북 전체 회차', 'current.pbTotal', num(c.pbTotal) || SESSIONS, 'number') +
          fld('데일리테스트 끝낸 회차', 'current.dt', num(c.dt), 'number') + fld('데일리테스트 전체 회차', 'current.dtTotal', num(c.dtTotal) || SESSIONS, 'number') + '</div>' +
        '<div class="bd-achrow">' + achHtml(c, 'pb', '프랙티스북') + achHtml(c, 'dt', '데일리테스트') + '</div>' +
        '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="bd-tog' + (c.ordered ? ' on' : '') + '" data-act="ordered"><i></i>다음 교재 주문 완료</button>' + finishUi + '</div>' +
        '<p class="hint">진도가 ' + WARN + '%를 넘으면 노란색, ' + URGENT + '%를 넘으면 빨간색으로 바뀌고 대시보드와 이 화면 위쪽 주문 알림에 올라갑니다.</p>' +
      '</div></div>' +
      '<div class="bd-sec"><h4>지난 교재 히스토리</h4>' +
        (r.history.length ? '<div class="bd-list">' + r.history.map(function (h, i) { return { h: h, i: i }; }).reverse().map(function (x) {
          return '<div class="li"><div class="grow"><b>' + esc(x.h.title) + '</b><span>' + esc(x.h.start || '?') + ' ~ ' + esc(x.h.end || '?') +
            (x.h.pb ? ' · 프랙티스북 ' + esc(x.h.pb) + ' · 데일리테스트 ' + esc(x.h.dt) : '') + (x.h.ai ? ' · 웨일튜터 AI ' + esc(x.h.ai) : '') +
            (x.h.mt ? ' · 먼슬리 ' + esc(x.h.mt) + '점' : '') + (x.h.note ? ' · ' + esc(x.h.note) : '') + '</span></div>' +
            '<button class="btn sm ghost" data-act="hdel" data-i="' + x.i + '">지우기</button></div>';
        }).join('') + '</div>' : '<p class="hint">완료 처리한 교재가 여기에 순서대로 쌓입니다.</p>') +
        '<div class="bd-grid3" style="align-items:end;margin-top:8px"><label class="fld">지난 교재 직접 추가<input id="bd-h-title" placeholder="교재명"></label>' +
          '<label class="fld">시작<input id="bd-h-start" type="date"></label><label class="fld">끝<input id="bd-h-end" type="date"></label></div>' +
        '<button class="btn sm" data-act="hadd" style="margin-top:8px">히스토리에 추가</button></div>';
  }

  /* ---------- 레벨 21회차 탭 ---------- */
  function lvSet(r, n, k, v) {
    var key = WT.bookKey(r);
    r.lv = r.lv || {};
    var b = r.lv[key] = r.lv[key] || {};
    var m = b[n] = b[n] || {};
    if (v === null || v === '') delete m[k]; else m[k] = v;
  }
  function cardFor(r, u, label) {
    var info = WT.bookInfo(WT.bookKey(r));
    if (!info) return '';
    return info.phonics ? cardLink(PHONICS_URL, 'Phonics', info.vol, u, label || '파닉스카드') : cardLink(SENTENCE_URL, info.level, info.vol, u, label || '센텐스카드');
  }
  function tabLevel(s, r) {
    var st = WT.stats(r), info = WT.bookInfo(st.key) || { name: r.current.title, phonics: false };
    var sel = modal.sel || (st.next ? st.next.n : WT.TOTAL), x = st.ss[sel - 1];
    var cardName = info.phonics ? '파닉스카드' : '센텐스카드';
    var tog = function (k, on, label) { return '<button class="bd-tog' + (on ? ' on' : '') + '" data-act="lvt" data-n="' + x.n + '" data-k="' + k + '" data-v="' + (on ? 0 : 1) + '"><i></i>' + label + '</button>'; };
    var numIn = function (k, v, label, max) {
      return '<label class="fld">' + label + '<input id="bd-lv-' + k + '" data-lv="' + x.n + '.' + k + '" type="number" min="0" max="' + (max || 100) + '" inputmode="numeric" value="' + (v == null ? '' : v) + '" placeholder="점수"></label>';
    };
    var lmsLine = x.lms
      ? '<div class="bd-lms"><b>웨일튜터</b> ' + esc(x.lms.date) + ' · ' + (x.ai < 0 ? '<span class="bad">AI 테스트 안 함</span>' : 'AI 테스트 <b>' + x.ai + ' / ' + x.max + '</b> (' + x.aiPct + '%)') +
        (x.kind === 'L' ? ' · 데일리테스트 ' + (x.lms.dt || 0) + '점' : '') + ' · 프랙티스북 ' + (x.lms.pb ? '✓' : '–') +
        (x.lms.voca != null ? ' · 단어 ' + x.lms.voca : '') + (x.lms.ks != null ? ' · 핵심문장 ' + x.lms.ks : '') + '</div>'
      : (x.kind === 'M' ? '' : '<div class="bd-lms muted">웨일튜터 기록이 아직 없습니다. 「웨일튜터 기록 가져오기」로 불러오거나, 수업을 했다면 아래에서 직접 체크하세요.</div>');
    var detail;
    if (x.kind === 'L') {
      detail = lmsLine + '<div class="bd-lvform">' + (x.lms ? '' : tog('done', !!x.m.done, '이 회차 수업함')) + tog('pb', x.pb, '프랙티스북') +
        numIn('dt', x.m.dt != null ? x.m.dt : null, '데일리테스트 점수' + (x.lms && x.lms.dt ? ' (웨일튜터 ' + x.lms.dt + ')' : '')) + '</div>';
    } else if (x.kind === 'W') {
      detail = lmsLine + '<p class="hint" style="margin:6px 0">위클리테스트 날입니다. 교재 진도는 나가지 않고, 데일리테스트지 위클리 시험 · ' + cardName + ' 영상 연습 · 웨일튜터 AI 테스트 20문제를 봅니다.</p>' +
        '<div class="bd-lvform">' + (x.lms ? '' : tog('done', !!x.m.done, '이 회차 수업함')) + numIn('wk', x.wk, '위클리테스트 (시험지) 점수') +
        tog('card', x.card, cardName + ' 영상 연습') + tog('pb', x.pb, '프랙티스북') + '</div>' +
        '<div class="bd-chips" style="margin-top:8px">' + cardFor(r, x.u, cardName + ' Unit ' + x.u + ' 연습') + '</div>';
    } else {
      var fin = !r.current.title ? '' : (modal.confirm === 'finish'
        ? '<div class="bd-confirm">「' + esc(r.current.title) + '」 레벨을 끝내고 히스토리로 옮깁니다' + (r.current.next ? '. 「' + esc(r.current.next) + '」을 새로 시작합니다.' : '.') +
          ' <button class="btn sm primary" data-act="finish-yes">확인</button><button class="btn sm" data-act="cancel">취소</button></div>'
        : '<button class="btn primary" data-act="finish">레벨 종료 처리</button>');
      detail = '<p class="hint" style="margin:0 0 8px">모든 레슨이 끝난 21회차입니다. 먼슬리테스트 → 교재 정리 → ' + cardName + ' 완료 영상까지 마치면 레벨 종료입니다.</p>' +
        '<div class="bd-lvform">' + numIn('mt', x.mt, '먼슬리테스트 점수') + tog('org', x.org, '교재 정리') + tog('video', x.video, cardName + ' 완료 영상') + '</div>' +
        '<div class="bd-chips" style="margin-top:8px">' + cardFor(r, 0, cardName + ' 권 전체 (완료 영상)') + '</div>' +
        '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;justify-content:flex-start">' + fin + '</div>';
    }
    var units = [1, 2, 3, 4].map(function (u) {
      return '<div class="bd-unit"><b>Unit ' + u + '</b>' + st.ss.slice((u - 1) * 5, u * 5).map(function (y) { return sesBox(y, sel, st); }).join('') + '</div>';
    }).join('');
    var chip = function (label, val, cls) { return '<span class="bd-mchip ' + (cls || '') + '"><small>' + label + '</small><b>' + val + '</b></span>'; };
    return '<div class="bd-sec"><div class="row" style="align-items:baseline"><h4 style="margin:0">' + esc(info.name) + '</h4>' +
        '<span class="muted">' + st.reached + ' / 21회차 · ' + (st.next ? '다음 ' + st.next.label : '레벨 종료') + '</span></div>' +
        '<div class="bd-bar" style="margin:8px 0 12px"><i style="width:' + st.pct + '%"></i></div>' +
        '<div class="bd-mchips">' +
          chip('웨일튜터 AI 평균', st.ai == null ? '–' : st.ai + '%', st.ai == null ? '' : aiClass({ kind: 'L', ai: 1, aiPct: st.ai })) +
          chip('AI 테스트 안 함', st.aiMiss + '회', st.aiMiss ? 'miss' : '') +
          chip('위클리 AI 평균', st.weekly == null ? '–' : st.weekly + '%') +
          chip('프랙티스북', st.pb + '/20') + chip('데일리테스트', st.dt + '/20' + (st.dtAvg != null ? ' · ' + st.dtAvg + '점' : '')) +
          chip(cardName + ' 연습', st.cards + '/4') +
        '</div>' +
        '<div class="bd-units">' + units + '<div class="bd-unit m">' + sesBox(st.ss[20], sel, st) + '</div></div>' +
        '<div class="bd-lvlegend"><span><i class="g4"></i>90%↑</span><span><i class="g3"></i>75%↑</span><span><i class="g2"></i>60%↑</span><span><i class="g1"></i>40%↑</span><span><i class="g0"></i>40% 미만</span><span><i class="miss"></i>AI 테스트 안 함</span><span><i></i>아직</span></div>' +
      '</div>' +
      '<div class="bd-sec bd-seldetail"><h4>' + x.n + '회차 · ' + x.label + '</h4>' + detail + '</div>';
  }
  function sesBox(y, sel, st) {
    var nxt = st.next ? st.next.n : 0;
    var main = y.kind === 'M' ? (y.mt != null ? y.mt + '점' : y.done ? '✓' : '먼슬리') :
      y.ai == null ? (y.done ? '✓' : '') : y.ai < 0 ? '×' : y.ai + '/' + y.max;
    var marks = (y.pb ? '<i class="pb" title="프랙티스북">P</i>' : '') + (y.dt != null ? '<i title="데일리테스트">' + y.dt + '</i>' : '') +
      (y.wk != null ? '<i title="위클리테스트">' + y.wk + '</i>' : '') + (y.card ? '<i class="cd" title="카드 연습">🎴</i>' : '') +
      (y.org ? '<i>정리</i>' : '') + (y.video ? '<i class="cd">🎬</i>' : '');
    return '<button class="bd-ses k' + y.kind + ' ' + aiClass(y) + (y.n === sel ? ' sel' : '') + (y.n === nxt ? ' now' : '') + '" data-act="lvsel" data-n="' + y.n + '" title="' + esc(sesTitle(y)) + '">' +
      '<span class="lb">' + (y.kind === 'L' ? 'D' + y.d : y.kind === 'W' ? '위클리' : '21회차') + (y.date ? ' <small>' + y.date.slice(5).replace('-', '/') + '</small>' : '') + '</span>' +
      '<b>' + main + '</b><span class="mk">' + marks + '</span></button>';
  }

  function tabMat(s, r) {
    return '<div class="bd-sec"><h4>보유 교재 (부교재 · 예습 · 복습 · 문법 · 단어)</h4>' +
      (r.materials.length ? '<div class="bd-list">' + r.materials.map(function (m, i) {
        return '<div class="bd-mrow' + (m.finished ? ' fin' : '') + '">' +
          '<select id="bd-m-' + i + '-type" data-m="' + i + '.type">' + UI.options(MAT_TYPES, m.type) + '</select>' +
          '<input class="t" id="bd-m-' + i + '-title" data-m="' + i + '.title" value="' + esc(m.title) + '" placeholder="교재명">' +
          '<span class="nums"><input id="bd-m-' + i + '-done" data-m="' + i + '.done" type="number" min="0" inputmode="numeric" value="' + num(m.done) + '" aria-label="완료">' +
            '<span class="muted">/</span><input id="bd-m-' + i + '-total" data-m="' + i + '.total" type="number" min="0" inputmode="numeric" value="' + num(m.total) + '" aria-label="전체"></span>' +
          '<button class="bd-tog' + (m.finished ? ' on' : '') + '" data-act="mfin" data-i="' + i + '"><i></i>끝냄</button>' +
          '<button class="btn sm ghost" data-act="mdel" data-i="' + i + '">지우기</button></div>';
      }).join('') + '</div>' : '<p class="hint">아직 등록된 교재가 없습니다.</p>') +
      '<div class="bd-chips" style="margin-top:8px">' + MAT_TYPES.map(function (t) {
        return '<button class="bd-chip" data-act="madd" data-t="' + t + '">+ ' + t + '</button>';
      }).join('') + '</div>' +
      '<p class="hint">완료/전체 칸은 비워 둬도 됩니다. 끝낸 교재는 표에서 빠지고 여기에는 흐리게 남습니다.</p></div>';
  }

  function tabHw(s, r) {
    var w = wk(r), sp = r.special, prev = wk(r, shiftWeek(week, -1));
    var recent = [0, -1, -2, -3, -4, -5].map(function (n) { return shiftWeek(week, n); });
    var wonLog = recent.map(function (k) {
      var x = wk(r, k);
      return (x.w1 || x.w2) ? '<span>' + weekLabel(k) + '</span><span>' + esc(x.w1 || '-') + (x.c1 ? ' ✓' : '') + ' · ' + esc(x.w2 || '-') + (x.c2 ? ' ✓' : '') + '</span>' : '';
    }).join('');
    return '<div class="bd-sec"><h4>ERLT 도서 숙제</h4>' +
        '<button class="bd-tog' + (sp.erlt.on ? ' on' : '') + '" data-act="cfg" data-k="erlt"><i></i>ERLT 대상자</button>' +
        (sp.erlt.on ? '<div class="form-grid" style="margin-top:8px">' + fld('ERLT 도서명', 'special.erlt.book', sp.erlt.book) +
          '<label class="fld">이번 주 (' + weekLabel(week) + ')<button class="bd-tog' + (w.erlt ? ' on' : '') + '" data-act="sp" data-k="erlt"><i></i>ERLT 숙제 해 옴</button></label></div>' : '') +
      '</div>' +
      '<div class="bd-sec"><h4>원서 2권 숙제</h4>' +
        '<button class="bd-tog' + (sp.wonseo.on ? ' on' : '') + '" data-act="cfg" data-k="wonseo"><i></i>원서 숙제 대상자</button>' +
        (sp.wonseo.on ? '<div class="form-grid" style="margin-top:8px">' +
          '<label class="fld">이번 주 원서 ①<input id="bd-f-w1" data-w="w1" value="' + esc(w.w1) + '" placeholder="' + esc(prev.w1 ? '지난주: ' + prev.w1 : '도서명') + '"></label>' +
          '<label class="fld">이번 주 원서 ②<input id="bd-f-w2" data-w="w2" value="' + esc(w.w2) + '" placeholder="' + esc(prev.w2 ? '지난주: ' + prev.w2 : '도서명') + '"></label></div>' +
          '<div class="bd-chips" style="margin-top:8px"><button class="bd-tog' + (w.c1 ? ' on' : '') + '" data-act="sp" data-k="c1"><i></i>① 읽어 옴</button>' +
          '<button class="bd-tog' + (w.c2 ? ' on' : '') + '" data-act="sp" data-k="c2"><i></i>② 읽어 옴</button></div>' +
          (wonLog ? '<div class="bd-log">' + wonLog + '</div>' : '') : '') +
      '</div>' +
      '<div class="bd-sec"><h4>추가 개인 숙제</h4><p class="hint" style="margin-top:0">켜 둔 항목만 표에 체크 버튼으로 나옵니다. 중등은 시험대비를 켜 두세요.</p>' +
        '<div class="bd-bigtogs">' + EXTRAS.map(function (e) {
          return '<button class="bd-tog' + (sp.extras[e[0]] ? ' on' : '') + '" data-act="cfgx" data-k="' + e[0] + '"><i></i>' + e[1] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="bd-sec"><h4>최근 6주 숙제 기록</h4><div class="bd-log">' + recent.map(function (k) {
        var x = wk(r, k);
        var ex = EXTRAS.filter(function (e) { return x.ex[e[0]]; }).map(function (e) { return e[1]; });
        return '<span>' + weekLabel(k) + '</span><span>프랙티스북 ' + (x.pbN ? x.pbN + '회' : (x.practice ? '✓' : '–')) + ' · 데일리테스트 ' + (x.dtN ? x.dtN + '회' : '–') + ' · 데일리시트 ' + x.daily + '/10' +
          (sp.erlt.on ? ' · ERLT ' + (x.erlt ? '✓' : '–') : '') + (ex.length ? ' · ' + ex.join(', ') + ' ✓' : '') + '</span>';
      }).join('') + '</div></div>';
  }

  function openModal(sid, tab, n) {
    var s = Store.student(sid);
    if (!s) return;
    var r0 = rec(sid);
    if (tab === 'book' && leveled(r0)) tab = 'level';
    if (tab === 'level' && !leveled(r0)) tab = 'book';
    modal.sid = sid; modal.tab = tab || 'info'; modal.showPw = false; modal.confirm = '';
    modal.sel = n || 0;
    modal.wrap = UI.modal({ title: s.name + ' · 학습 현황', wide: true, body: '<div id="bd-modal"></div>',
      footer: '<a class="btn ghost" href="#/students">학생 명부에서 정보 고치기</a><div class="sp"></div><button class="btn primary" data-close>닫기</button>' });
    bindModal(modal.wrap);
    paintModal();
  }

  function paintModal() {
    if (!modal.wrap || !modal.wrap.parentNode) { modal.wrap = null; return; }
    var box = modal.wrap.querySelector('#bd-modal');
    var s = Store.student(modal.sid);
    if (!box || !s) return;
    var r = rec(modal.sid);
    var tabs = [['info', '웨일 프로그램']].concat(leveled(r) ? [['level', '레벨 21회차']] : [])
      .concat([['book', '본사 교재'], ['mat', '보유 교재'], ['hw', '개인 숙제']]);
    var body = { info: tabInfo, level: tabLevel, book: tabBook, mat: tabMat, hw: tabHw }[modal.tab](s, r);
    var mb = modal.wrap.querySelector('.modal-b'), top = mb ? mb.scrollTop : 0;
    box.innerHTML = '<p class="bd-msub">' + esc(className(s) || s.grade || '반 미지정') + ' · ' + weekLabel(week) + ' 주 기록</p>' +
      '<div class="seg bd-tabs">' + tabs.map(function (t) {
        return '<button class="' + (modal.tab === t[0] ? 'on' : '') + '" data-act="tab" data-t="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body;
    if (mb) mb.scrollTop = top;
  }

  function setPath(o, path, v) {
    var ks = path.split('.'), t = o;
    for (var i = 0; i < ks.length - 1; i++) t = t[ks[i]];
    t[ks[ks.length - 1]] = v;
  }

  function bindModal(w) {
    var box = w.querySelector('.modal-b');
    box.onclick = function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act'), sid = modal.sid, i = +t.getAttribute('data-i');
      switch (act) {
        case 'tab': modal.tab = t.getAttribute('data-t'); modal.confirm = ''; paintModal(); return;
        case 'showpw': modal.showPw = !modal.showPw; paintModal(); return;
        case 'copy': {
          var v = rec(sid)[t.getAttribute('data-v')] || '';
          var input = w.querySelector('#bd-f-' + t.getAttribute('data-v'));
          var fallback = function () { if (input) { input.type = 'text'; input.select(); UI.toast('선택됐습니다. 길게 눌러 복사해 주세요'); } };
          try { navigator.clipboard.writeText(v).then(function () { UI.toast('복사했습니다'); }, fallback); } catch (err) { fallback(); }
          return;
        }
        case 'lvsel': modal.sel = i || +t.getAttribute('data-n'); modal.confirm = ''; paintModal(); return;
        case 'lvt': mutate(sid, function (r) { lvSet(r, +t.getAttribute('data-n'), t.getAttribute('data-k'), t.getAttribute('data-v') === '1'); }); paintModal(); return;
        case 'finish': modal.confirm = 'finish'; paintModal(); return;
        case 'cancel': modal.confirm = ''; paintModal(); return;
        case 'finish-yes':
          modal.confirm = '';
          mutate(sid, function (r) {
            var c = r.current;
            if (leveled(r)) {
              var st = WT.stats(r);
              r.history.push({ title: c.title, start: c.start || '', end: U.ymd(), pb: st.pb + '/20', dt: st.dt + '/20', ai: st.ai == null ? '' : st.ai + '%', mt: st.m.mt == null ? '' : String(st.m.mt) });
              if (r.wt) r.wt.done = r.wt.book;   // 이 교재는 끝남 (웨일튜터에서 다음 교재가 배정되면 그쪽으로 넘어갑니다)
            } else
            r.history.push({ title: c.title, start: c.start || '', end: U.ymd(), pb: ach(c, 'pb').d + '/' + ach(c, 'pb').t, dt: ach(c, 'dt').d + '/' + ach(c, 'dt').t });
            r.current = { title: c.next || '', start: c.next ? U.ymd() : '', done: 0, total: c.next ? c.total : 0, next: '', ordered: false,
              pb: 0, pbTotal: num(c.pbTotal) || SESSIONS, dt: 0, dtTotal: num(c.dtTotal) || SESSIONS };
          });
          UI.toast('교재를 히스토리로 옮겼습니다');
          paintModal(); return;
        case 'hdel': mutate(sid, function (r) { r.history.splice(i, 1); }); paintModal(); return;
        case 'hadd': {
          var ti = w.querySelector('#bd-h-title').value.trim();
          if (!ti) { UI.toast('교재명을 입력해 주세요', true); return; }
          var st = w.querySelector('#bd-h-start').value, en = w.querySelector('#bd-h-end').value;
          mutate(sid, function (r) {
            r.history.push({ title: ti, start: st, end: en });
            r.history.sort(function (a, b) { return String(a.end || '').localeCompare(String(b.end || '')); });
          });
          paintModal(); return;
        }
        case 'madd':
          mutate(sid, function (r) { r.materials.push({ type: t.getAttribute('data-t'), title: '', done: 0, total: 0, finished: false }); });
          paintModal();
          var ins = w.querySelectorAll('.bd-mrow input.t'); if (ins.length) ins[ins.length - 1].focus();
          return;
        case 'mfin': mutate(sid, function (r) { r.materials[i].finished = !r.materials[i].finished; }); paintModal(); return;
        case 'mdel': mutate(sid, function (r) { r.materials.splice(i, 1); }); paintModal(); return;
        case 'cfg': mutate(sid, function (r) { r.special[t.getAttribute('data-k')].on = !r.special[t.getAttribute('data-k')].on; }); paintModal(); return;
        case 'track': mutate(sid, function (r) { r.sbank.track = t.getAttribute('data-k'); }); paintModal(); return;
        case 'cfgx': mutate(sid, function (r) { var k = t.getAttribute('data-k'); r.special.extras[k] = !r.special.extras[k]; }); paintModal(); return;
      }
      handle(act, t, sid);
      paintModal();
    };
    box.oninput = function (e) {
      var t = e.target, r = rec(modal.sid);
      if (t.getAttribute('data-f')) {
        var v = t.type === 'number' ? num(t.value) : t.value;
        setPath(r, t.getAttribute('data-f'), v);
      } else if (t.getAttribute('data-w')) {
        var p = {}; p[t.getAttribute('data-w')] = t.value; setWk(r, p);
      } else if (t.getAttribute('data-lv')) {
        var lv = t.getAttribute('data-lv').split('.');
        lvSet(r, +lv[0], lv[1], t.value === '' ? null : Math.max(0, Math.min(100, +t.value || 0)));
      } else if (t.getAttribute('data-m')) {
        var mi = t.getAttribute('data-m').split('.');
        r.materials[+mi[0]][mi[1]] = t.type === 'number' ? num(t.value) : t.value;
      } else return;
      commitLater(r);
      if (viewEl && document.body.contains(viewEl) && location.hash.indexOf('#/board') === 0) {
        typing = true;   // 입력 중엔 상세 창을 다시 그리지 않습니다
        render(viewEl); typing = false;
      }
    };
    box.onchange = function (e) {
      var t = e.target, r = rec(modal.sid);
      if (t.tagName === 'SELECT' && t.getAttribute('data-m')) {
        r.materials[+t.getAttribute('data-m').split('.')[0]].type = t.value;
        commit(r);
      }
      var f = t.getAttribute('data-f') || '';
      if (t.getAttribute('data-lv')) {
        setTimeout(function () {
          var a = document.activeElement;
          if (!(a && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) paintModal();
        }, 0);
      }
      if (f === 'current.done' || f === 'current.total') {
        if (r.current.total && r.current.done > r.current.total) r.current.done = r.current.total;
        typing = true; mutate(modal.sid, function () {}); typing = false;
        // 다음 칸으로 옮겨 가는 중이면 상세 창을 다시 그리지 않습니다 (입력이 끊기지 않게).
        setTimeout(function () {
          var a = document.activeElement;
          if (!(a && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) paintModal();
        }, 0);
      }
    };
  }

  /* ---------- 웨일튜터 한눈에 (날짜 × 학생 색칸) ---------- */
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function localTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function heatHtml(list) {
    var recs = list.map(function (s) { return { s: s, r: rec(s.id) }; });
    var withWt = recs.filter(function (x) { return x.r.wt && x.r.wt.days; });
    var at = WT.lastImport();
    var head = '<div class="bd-hmtop"><div><b>웨일튜터 한눈에</b><span class="muted"> · 최근 수업일 20일, 칸 색은 그날 AI 테스트 점수 · ' +
      (at ? '마지막 가져온 시각 ' + esc(localTime(at)) : '아직 가져온 기록이 없습니다') + '</span></div>' +
      '<div class="seg"><button class="' + (hmSort === 'worry' ? 'on' : '') + '" data-act="hmsort" data-k="worry">챙길 학생 먼저</button>' +
      '<button class="' + (hmSort === 'class' ? 'on' : '') + '" data-act="hmsort" data-k="class">반 순서</button></div></div>';
    if (!withWt.length) return '<div class="bd-tablebox bd-hmbox">' + head +
      '<div class="empty" style="padding:28px">웨일튜터 기록이 아직 없습니다. 위의 「웨일튜터 기록 가져오기」를 눌러 처음 한 번 연결해 주세요.</div></div>';
    var dates = WT.classDates(withWt.map(function (x) { return x.r; }), 20);
    var rows = recs.map(function (x) {
      var rc = WT.recent(x.r, dates), st = leveled(x.r) ? WT.stats(x.r) : null;
      // 챙길 점수: 안 한 날 · 낮은 점수 · 떨어지는 추세
      var worry = (rc.came ? (100 - (rc.rate || 0)) * 1.2 : 0) + (rc.ai != null ? (100 - rc.ai) : 0) + (rc.trend != null && rc.trend < 0 ? -rc.trend : 0);
      return { s: x.s, r: x.r, rc: rc, st: st, worry: x.r.wt ? worry : -1 };
    });
    if (hmSort === 'worry') rows.sort(function (a, b) { return b.worry - a.worry; });
    var flag = function (x) {
      var f = [];
      if (x.rc.came && x.rc.rate != null && x.rc.rate < 70) f.push('<span class="bd-flag bad">AI 테스트 자주 안 함</span>');
      if (x.rc.ai != null && x.rc.ai < 60) f.push('<span class="bd-flag warn">점수 낮음</span>');
      if (x.rc.trend != null && x.rc.trend <= -10) f.push('<span class="bd-flag warn">점수 ↓</span>');
      if (x.rc.trend != null && x.rc.trend >= 10) f.push('<span class="bd-flag ok">점수 ↑</span>');
      return f.join('');
    };
    var cell = function (x, i) {
      var d = (x.r.wt && x.r.wt.days || {})[dates[i]];
      if (!d) return '<td class="hc"><i class="hm none"></i></td>';
      var p = WT.parseCode(d[0]), w = p && p.d === 5;
      var o = { kind: 'L', ai: d[1], aiPct: d[1] >= 0 && d[2] ? Math.round(d[1] / d[2] * 100) : null };
      var t = dates[i].slice(5).replace('-', '/') + (p ? ' · ' + (WT.bookInfo(p.book) || {}).name + ' ' + WT.labelOf(p.n) : '') +
        (d[1] < 0 ? ' · AI 테스트 안 함' : ' · AI ' + d[1] + '/' + d[2]) + (d[3] ? ' · 데일리 ' + d[3] : '') + (d[4] ? ' · 프랙티스북 ✓' : '');
      return '<td class="hc"><i class="hm ' + aiClass(o) + (w ? ' w' : '') + '" title="' + esc(t) + '">' + (d[1] < 0 ? '×' : o.aiPct) + '</i></td>';
    };
    var bar = function (v) { return v == null ? '<span class="muted">–</span>' : '<span class="bd-mini"><i class="' + aiClass({ kind: 'L', ai: 1, aiPct: v }) + '" style="width:' + v + '%"></i></span><b>' + v + '</b>'; };
    return '<div class="bd-tablebox bd-hmbox">' + head +
      '<table class="bd-table bd-hm"><thead><tr><th class="bd-sticky">학생</th><th>레벨 진도</th>' +
        dates.map(function (d) { var x = new Date(d + 'T12:00:00'); return '<th class="hc"><span>' + (x.getMonth() + 1) + '/' + x.getDate() + '</span><small>' + DOW[x.getDay()] + '</small></th>'; }).join('') +
        '<th>AI 테스트<br>응시율</th><th>AI 평균</th><th>데일리<br>평균</th><th>단어<br>평균</th><th>살펴볼 점</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var st = x.st;
        return '<tr data-sid="' + x.s.id + '"><td class="bd-sticky bd-name"><button class="nm" data-act="open" data-tab="level">' + esc(x.s.name) + '</button><span class="cls">' + esc(className(x.s) || '') + '</span></td>' +
          '<td class="bd-hmlv">' + (st ? '<button class="lk" data-act="open" data-tab="level"><span>' + esc(x.r.current.title) + '</span><small>' + st.reached + '/21 · ' + (st.next ? st.next.label : '종료') + '</small></button>' : '<span class="muted">–</span>') + '</td>' +
          (x.r.wt ? dates.map(function (d, i) { return cell(x, i); }).join('') : '<td colspan="' + dates.length + '" class="muted" style="text-align:center">' + (x.r.tutorId || x.r.current.title ? '웨일튜터에서 찾지 못한 학생입니다 (아이디를 확인해 주세요)' : '교재 미배정') + '</td>') +
          '<td class="nm2">' + (x.rc.came ? '<b>' + x.rc.rate + '%</b><small> ' + x.rc.took + '/' + x.rc.came + '일</small>' : '<span class="muted">–</span>') + '</td>' +
          '<td class="nm2">' + bar(x.rc.ai) + '</td><td class="nm2">' + (x.rc.dt == null ? '<span class="muted">–</span>' : x.rc.dt) + '</td>' +
          '<td class="nm2">' + (x.rc.voca == null ? '<span class="muted">–</span>' : x.rc.voca) + '</td><td>' + flag(x) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="bd-lvlegend" style="padding:10px 14px"><span><i class="g4"></i>90%↑</span><span><i class="g3"></i>75%↑</span><span><i class="g2"></i>60%↑</span><span><i class="g1"></i>40%↑</span><span><i class="g0"></i>40% 미만</span>' +
        '<span><i class="miss"></i>수업했지만 AI 테스트 안 함</span><span><i class="none"></i>그날 수업 없음</span><span><i class="g3 w"></i>굵은 테두리 = 위클리 (20문제)</span></div></div>';
  }

  /* ---------- 웨일튜터 기록 가져오기 ---------- */
  function openImport() {
    var at = WT.lastImport();
    var w = UI.modal({ title: '웨일튜터 기록 가져오기', wide: true, body:
      '<div class="bd-import">' +
        '<p>본사 웨일튜터 관리자 화면의 <b>학습현황</b>(AI 테스트 · 데일리테스트 · 프랙티스북)을 최근 ' + 120 + '일치 한 번에 가져옵니다. ' +
          '가져온 기록은 다른 선생님 기기에도 그대로 보입니다. ' + (at ? '<br>마지막으로 가져온 시각: <b>' + esc(localTime(at)) + '</b>' : '') + '</p>' +
        '<ol>' +
          '<li><b>처음 한 번만</b> — 아래 고래 버튼을 브라우저 <b>북마크바로 끌어다 놓으세요.</b> (북마크바가 안 보이면 Ctrl + Shift + B)</li>' +
          '<li>웨일튜터 관리자(whale.cloubot.com)에 로그인합니다.</li>' +
          '<li>북마크바의 <b>「고래 현황판으로 보내기」</b>를 누르면 이 현황판이 새 창으로 열리고 자동으로 저장됩니다. 1분 정도 걸립니다.</li>' +
        '</ol>' +
        '<div class="bd-bmrow"><a class="btn primary bd-bm" href="' + WT.bookmarkletHref() + '" draggable="true" data-bm>🐳 고래 현황판으로 보내기</a>' +
          '<span class="hint">← 이 버튼을 북마크바로 끌어다 놓기</span></div>' +
        '<details><summary>태블릿 · 끌어다 놓기가 안 될 때</summary>' +
          '<p class="hint">아무 페이지나 북마크로 저장한 뒤, 북마크 편집에서 주소(URL)를 아래 「주소 복사」로 복사한 내용으로 바꾸고 이름을 「고래 현황판으로 보내기」로 저장하세요.</p>' +
          '<button class="btn sm" data-bmcopy>주소 복사</button></details>' +
        '<p class="hint">웨일튜터 아이디가 현황판 「웨일 프로그램」 탭의 아이디와 같은 학생끼리 연결됩니다. 아이디가 없으면 이름으로 찾습니다.</p>' +
      '</div>',
      footer: '<a class="btn" href="https://whale.cloubot.com" target="_blank" rel="noopener">웨일튜터 관리자 열기</a><div class="sp"></div><button class="btn primary" data-close>닫기</button>' });
    var b = w.querySelector('[data-bm]');
    b.onclick = function (e) { e.preventDefault(); UI.toast('이 버튼은 북마크바로 끌어다 놓고, 웨일튜터 화면에서 눌러 주세요'); };
    w.querySelector('[data-bmcopy]').onclick = function () {
      var v = WT.bookmarkletHref();
      try { navigator.clipboard.writeText(v).then(function () { UI.toast('주소를 복사했습니다'); }, function () { UI.toast('복사가 막혔습니다. 노트북에서 해 주세요', true); }); } catch (e) { UI.toast('복사가 막혔습니다', true); }
    };
  }
  var wtHandled = '', wtPending = null;
  function wtReceive(data, source) {
    if (window.Sync && Sync.isCloud && Sync.isCloud() && !Sync.signedIn()) {
      wtPending = { data: data, source: source };
      try { if (source) source.postMessage('gorae-wt-login', WT.ORIGIN); } catch (e) {}
      setTimeout(function () { if (wtPending) { var p = wtPending; wtPending = null; wtReceive(p.data, p.source); } }, 2000);
      return;
    }
    if (wtHandled !== data.at) {
      wtHandled = data.at;
      var res = WT.importPayload(data);
      mode = 'wt';
      if (location.hash.indexOf('#/board') !== 0) location.hash = '#/board';
      else refresh();
      UI.modal({ title: '웨일튜터 기록을 가져왔습니다', body:
        '<p>학생 <b>' + res.matched + '명</b> · 수업 기록 <b>' + res.rows + '건</b>을 현황판에 붙였습니다.</p>' +
        (res.switched.length ? '<p><b>교재가 바뀐 학생</b> (이전 교재는 히스토리로 옮김)<br>' + res.switched.map(esc).join('<br>') + '</p>' : '') +
        (res.missing.length ? '<p class="hint">웨일튜터에서 찾지 못한 학생: ' + res.missing.map(esc).join(', ') + ' — 「웨일 프로그램」 탭에 웨일튜터 아이디를 넣어 주세요.</p>' : '') +
        (res.unknown.length ? '<p class="hint">현황판 등록생 명단에 없는 웨일튜터 학생: ' + res.unknown.map(esc).join(', ') + '</p>' : ''),
        footer: '<button class="btn primary" data-close>확인</button>' });
    }
    try { if (source) source.postMessage('gorae-wt-ack', WT.ORIGIN); } catch (e) {}
  }
  // 새 창이 막혀 같은 창으로 넘어온 경우: 기록이 창 이름(window.name)에 담겨 옵니다
  (function () {
    var nm = '';
    try { nm = window.name || ''; } catch (e) {}
    if (nm.indexOf('gorae-wt:') !== 0) return;
    try { window.name = ''; } catch (e) {}
    var data = null;
    try { data = JSON.parse(nm.slice(9)); } catch (e) {}
    if (data && data.type === 'gorae-wt') setTimeout(function () { wtReceive(data, null); }, 1200);
  })();
  window.addEventListener('message', function (e) {
    if (e.origin !== WT.ORIGIN || !e.data || e.data.type !== 'gorae-wt') return;
    wtReceive(e.data, e.source);
  });

  /* ---------- 하루 한 번 주문 알림 팝업 ---------- */
  var popupWrap = null;
  function popupOpen() { return popupWrap && popupWrap.parentNode; }
  function paintPopup() {
    var list = orderList(['urgent']);
    if (!list.length) { UI.close(); popupWrap = null; return; }
    popupWrap.querySelector('.modal-b').innerHTML =
      '<p style="margin:0 0 12px;color:var(--muted);font-size:13.5px">진도 ' + URGENT + '% 이상인데 다음 교재 주문 표시가 없는 학생입니다.</p>' +
      '<div class="bd-list">' + list.map(function (x) {
        return '<div class="li"><div class="grow"><b>' + esc(x.s.name) + ' · ' + esc(className(x.s)) + '</b><span>' + esc(x.r.current.title) + ' ' + bookState(x.r).p + '%' +
          (x.r.current.next ? ' → ' + esc(x.r.current.next) : ' · 다음 교재 미정') + '</span></div>' +
          '<button class="btn sm primary" data-act="ordered" data-sid="' + x.s.id + '">주문완료</button></div>';
      }).join('') + '</div>';
  }
  /** 화면을 처음 열었을 때만 (그날 한 번) 띄웁니다. 작업 중에 진도가 넘어가면 토스트로만 알립니다. */
  function maybePopup() {
    var today = U.ymd();
    if (popupDay === today || typing || (modal.wrap && modal.wrap.parentNode)) return;
    popupDay = today;
    var seen = '';
    try { seen = localStorage.getItem('gorae-board-popup') || ''; } catch (e) {}
    if (seen === today) return;
    var list = orderList(['urgent']);
    if (!list.length) return;
    try { localStorage.setItem('gorae-board-popup', today); } catch (e) {}
    popupWrap = UI.modal({ title: '교재 주문할 학생 ' + list.length + '명', body: '',
      footer: '<button class="btn" data-close>나중에 하기</button>' });
    popupWrap.querySelector('.modal-b').onclick = function (e) {
      var t = e.target.closest('[data-act="ordered"]');
      if (t) handle('ordered', t, t.getAttribute('data-sid'));
    };
    paintPopup();
  }

  /** 대시보드에 붙이는 요약 카드 */
  function dashboardCard() {
    var list = orderList(['urgent', 'warn']);
    var body = list.length
      ? '<div class="bd-chips">' + list.slice(0, 12).map(function (x) {
          var b = bookState(x.r);
          return '<a class="bd-chip ' + (b.k === 'urgent' ? 'urgent' : 'warn') + '" href="#/board">' + esc(x.s.name) + ' · ' + esc(x.r.current.title) + ' ' + b.p + '%</a>';
        }).join('') + (list.length > 12 ? '<span class="hint">외 ' + (list.length - 12) + '명</span>' : '') + '</div>'
      : '<p class="hint" style="margin:0">지금 주문할 본사 교재가 없습니다. 진도가 ' + WARN + '%를 넘으면 여기에 나옵니다.</p>';
    return '<div class="card"><div class="card-h"><h2>교재 주문 알림</h2><div class="sp"></div>' +
      '<a class="btn primary" href="#/board">학습 현황판 →</a></div><div class="card-b">' + body + '</div></div>';
  }

  return { title: title, sub: sub, render: render, dashboardCard: dashboardCard, _receive: wtReceive,
    _bookState: function (sid) { return bookState(rec(sid)); } };
})();
