/* ===== 웨일튜터 학습 기록 · 레벨 21회차 (2026-11-07 추가) =====
 *
 * 레벨(교재 한 권) = 21회차
 *   Unit 1~4 × ( Day1~4 수업  +  Day5 위클리테스트 )  = 20회차
 *   21회차 = 먼슬리테스트 · 교재정리 · 카드 완료영상  → 레벨 종료
 *   파닉스(Lesson 16개)도 4레슨마다 위클리테스트라 같은 틀입니다.
 *
 * 본사 웨일튜터 관리자(whale.cloubot.com) 대시보드의 「학습현황」은 날짜별로
 *   레슨 코드(WE-L1V3U2D4) · AI 테스트(6 / 10, 위클리는 / 20) · 데일리테스트 점수 · 프랙티스북(P.B) 체크
 * 를 줍니다. 원장님이 웨일튜터 화면에서 북마크 「고래 현황판으로 보내기」를 누르면
 * 이 기록이 현황판 창으로 넘어와 학생별 boards 기록(r.wt)에 붙습니다.
 *
 * 저장 모양
 *   r.wt = { id, book, start, at, days: { 'YYYY-MM-DD': [코드, AI점수(-1=안 함), 만점, 데일리, PB(0/1), 단어, 핵심문장, 시각] } }
 *   r.lv = { 'WE-L1V3': { '5': { wk: 85, card: true }, '21': { mt: 92, org: true, video: true }, '3': { pb: true } } }   ← 선생님이 직접 체크한 것
 */
var WT = (function () {
  var LEVELS = { 0: 'Phonics', 1: '240', 2: '520', 3: '860', 4: '1240', 5: '1680' };
  var TOTAL = 21;
  var ORIGIN = 'https://whale.cloubot.com';
  var STAFF = 'https://staff.whalejinju.kr';
  var KEEP_DAYS = 180;     // 이보다 오래된 날짜 기록은 정리합니다
  var FETCH_DAYS = 120;    // 북마크가 한 번에 모으는 기간 (주말 제외)

  /* ---------- 회차 ---------- */
  function sessionOf(u, d) { return (u - 1) * 5 + d; }
  function kindOf(n) { return n === TOTAL ? 'M' : (n % 5 === 0 ? 'W' : 'L'); }
  function unitOf(n) { return n === TOTAL ? 0 : Math.ceil(n / 5); }
  function dayOf(n) { return n === TOTAL ? 0 : n - (unitOf(n) - 1) * 5; }
  function labelOf(n) {
    if (n === TOTAL) return '먼슬리테스트';
    return dayOf(n) === 5 ? 'Unit ' + unitOf(n) + ' 위클리' : 'Unit ' + unitOf(n) + ' · Day ' + dayOf(n);
  }
  function shortOf(n) { return n === TOTAL ? 'M' : dayOf(n) === 5 ? 'W' : String(dayOf(n)); }

  /* ---------- 교재 코드 ---------- */
  function parseCode(code) {
    var m = /^WE-L(\d+)V(\d+)U(\d)D(\d)$/.exec(code || '');
    return m ? { lv: +m[1], v: +m[2], u: +m[3], d: +m[4], book: 'WE-L' + m[1] + 'V' + m[2], n: sessionOf(+m[3], +m[4]) } : null;
  }
  function bookInfo(book) {
    var m = /^WE-L(\d+)V(\d+)$/.exec(book || '');
    if (!m) return null;
    var phonics = +m[1] === 0;
    return { phonics: phonics, level: phonics ? 'Phonics' : (LEVELS[m[1]] || ''), vol: +m[2],
      name: phonics ? 'Whale Phonics ' + m[2] : (LEVELS[m[1]] || 'L' + m[1]) + ' vol.' + m[2] };
  }
  function bookFromTitle(t) {
    t = String(t || '');
    var m = /phonics\s*(\d)/i.exec(t);
    if (m) return 'WE-L0V' + m[1];
    m = /^\s*(\d{3,4})\s*vol\.?\s*(\d)/i.exec(t);
    if (m) for (var k in LEVELS) if (LEVELS[k] === m[1]) return 'WE-L' + k + 'V' + m[2];
    return '';
  }
  /** 지금 교재의 코드. 웨일튜터에서 가져온 것이 우선, 없으면 교재명에서 읽습니다. */
  function bookKey(r) {
    // 레벨 종료 처리한 교재(wt.done)는 웨일튜터에서 다음 교재가 배정될 때까지 건너뜁니다
    if (r.wt && r.wt.book && bookInfo(r.wt.book) && r.wt.done !== r.wt.book) return r.wt.book;
    return bookFromTitle(r.current && r.current.title);
  }

  /* ---------- 회차별 기록 (웨일튜터 + 선생님 체크) ---------- */
  function manual(r, key) { var lv = r.lv || {}; return lv[key] || {}; }
  function sessions(r) {
    var key = bookKey(r), man = manual(r, key), out = [], n;
    for (n = 1; n <= TOTAL; n++) out.push({ n: n, kind: kindOf(n), u: unitOf(n), d: dayOf(n), label: labelOf(n), lms: null, m: man[n] || {} });
    var days = (r.wt && r.wt.days) || {};
    Object.keys(days).sort().forEach(function (date) {
      var x = days[date], p = parseCode(x[0]);
      if (!p || p.book !== key || p.n > 20) return;
      var s = out[p.n - 1];
      // 같은 레슨을 두 번 했으면, AI 테스트를 본 쪽 · 나중 날짜를 씁니다
      if (!s.lms || x[1] >= 0 || s.lms.ai < 0) s.lms = { date: date, ai: x[1], max: x[2], dt: x[3], pb: !!x[4], voca: x[5], ks: x[6] };
    });
    out.forEach(function (s) {
      var L = s.lms || {}, m = s.m;
      s.date = L.date || m.date || '';
      s.ai = s.lms ? L.ai : null;                          // null = 기록 없음, -1 = 수업했지만 AI 테스트 안 함
      s.max = L.max || (s.kind === 'W' ? 20 : 10);
      s.aiPct = s.ai != null && s.ai >= 0 && s.max ? Math.round(s.ai / s.max * 100) : null;
      s.pb = m.pb != null ? !!m.pb : !!L.pb;
      s.dt = s.kind === 'L' ? (m.dt != null && m.dt !== '' ? +m.dt : (L.dt > 0 ? L.dt : null)) : null;
      s.wk = s.kind === 'W' && m.wk != null && m.wk !== '' ? +m.wk : null;   // 데일리테스트지 위클리 시험 점수
      s.card = !!m.card;
      s.mt = s.kind === 'M' && m.mt != null && m.mt !== '' ? +m.mt : null;
      s.org = !!m.org; s.video = !!m.video;
      s.done = s.kind === 'M' ? (s.mt != null || (s.org && s.video) || !!m.done) : !!(s.lms || m.done);
    });
    return out;
  }

  function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
  /** 레벨 한 권의 성취 요약 */
  function stats(r) {
    var ss = sessions(r), lessons = ss.slice(0, 20);
    var reached = 0;
    ss.forEach(function (s) { if (s.done) reached = s.n; });
    var next = reached >= TOTAL ? null : ss[reached];
    var aiDone = lessons.filter(function (s) { return s.aiPct != null; });
    var attended = lessons.filter(function (s) { return s.lms; });
    var dts = lessons.filter(function (s) { return s.kind === 'L' && s.dt != null; }).map(function (s) { return s.dt; });
    return {
      key: bookKey(r), ss: ss, reached: reached, next: next,
      pct: Math.round(reached / TOTAL * 100),
      pb: lessons.filter(function (s) { return s.pb; }).length,
      dt: lessons.filter(function (s) { return s.kind === 'L' ? s.dt != null : s.wk != null; }).length,
      dtAvg: avg(dts),
      ai: avg(aiDone.map(function (s) { return s.aiPct; })),
      aiN: aiDone.length,
      aiMiss: attended.filter(function (s) { return s.ai === -1; }).length,
      weekly: avg(lessons.filter(function (s) { return s.kind === 'W' && s.aiPct != null; }).map(function (s) { return s.aiPct; })),
      cards: lessons.filter(function (s) { return s.kind === 'W' && s.card; }).length,
      m: ss[20],
      finished: ss[20].done
    };
  }

  /* ---------- 날짜별 (한눈에 보기) ---------- */
  function dayList(r) {
    var days = (r.wt && r.wt.days) || {};
    return Object.keys(days).sort().map(function (date) {
      var x = days[date], p = parseCode(x[0]);
      return { date: date, code: x[0], p: p, ai: x[1], max: x[2], dt: x[3], pb: !!x[4], voca: x[5], ks: x[6],
        pct: x[1] >= 0 && x[2] ? Math.round(x[1] / x[2] * 100) : null };
    });
  }
  /** 최근 n일(수업일) 동안의 웨일튜터 성실도 */
  function recent(r, dates) {
    var days = (r.wt && r.wt.days) || {};
    var rows = dates.map(function (d) { var x = days[d]; return x ? { ai: x[1], max: x[2], dt: x[3], voca: x[5], pct: x[1] >= 0 && x[2] ? Math.round(x[1] / x[2] * 100) : null } : null; });
    var came = rows.filter(Boolean), took = came.filter(function (x) { return x.pct != null; });
    var half = Math.floor(rows.length / 2);
    var a = avg(rows.slice(0, half).filter(function (x) { return x && x.pct != null; }).map(function (x) { return x.pct; }));
    var b = avg(rows.slice(half).filter(function (x) { return x && x.pct != null; }).map(function (x) { return x.pct; }));
    return {
      rows: rows, came: came.length, took: took.length,
      rate: came.length ? Math.round(took.length / came.length * 100) : null,
      ai: avg(took.map(function (x) { return x.pct; })),
      dt: avg(came.filter(function (x) { return x.dt > 0; }).map(function (x) { return x.dt; })),
      voca: avg(came.filter(function (x) { return x.voca != null; }).map(function (x) { return x.voca; })),
      trend: a != null && b != null ? b - a : null
    };
  }
  /** 모든 학생 기록에서 수업이 있었던 날짜 (최근 순 n개를 오래된 순으로) */
  function classDates(records, n) {
    var set = {};
    records.forEach(function (r) { Object.keys((r.wt && r.wt.days) || {}).forEach(function (d) { set[d] = 1; }); });
    return Object.keys(set).sort().slice(-n);
  }

  /* ---------- 가져오기 ---------- */
  function ymdAgo(n) { var d = new Date(Date.now() - n * 864e5); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /**
   * 북마크가 보낸 묶음을 학생 기록에 붙입니다.
   * p = { type:'gorae-wt', at, students:[[아이디, 이름, 교재코드, 교재약칭, 시작일]], days:{ 날짜: [[아이디, 코드, AI, 만점, 데일리, PB, 단어, 핵심문장, 시각]] } }
   * 학생은 현황판의 웨일튜터 아이디 → 이름 순으로 찾습니다.
   */
  function importPayload(p, opts) {
    opts = opts || {};
    var roster = Store.students({ active: true });
    var byId = {}, byName = {};
    (p.students || []).forEach(function (s) { byId[String(s[0]).toLowerCase()] = s; byName[s[1]] = s; });
    var rowsById = {};
    Object.keys(p.days || {}).forEach(function (date) {
      (p.days[date] || []).forEach(function (x) {
        var id = String(x[0]).toLowerCase();
        (rowsById[id] = rowsById[id] || {})[date] = x.slice(1);
      });
    });
    var res = { matched: 0, rows: 0, switched: [], missing: [], unknown: [] };
    var used = {};
    var cut = ymdAgo(KEEP_DAYS);
    roster.forEach(function (st) {
      var r = Store.board(st.id) || { studentId: st.id };
      var tid = String(r.tutorId || '').trim().toLowerCase();
      var s = (tid && byId[tid]) || byName[st.name];
      if (!s) { res.missing.push(st.name); return; }
      var id = String(s[0]).toLowerCase();
      used[id] = 1;
      var wt = r.wt || {};
      var days = Object.assign({}, wt.days || {});
      Object.keys(rowsById[id] || {}).forEach(function (d) { days[d] = rowsById[id][d]; res.rows++; });
      Object.keys(days).forEach(function (d) { if (d < cut) delete days[d]; });
      r.wt = { id: s[0], book: s[2] || wt.book || '', bookName: s[3] || '', start: s[4] || wt.start || '', at: p.at || new Date().toISOString(), days: days };
      if (wt.done && wt.done === r.wt.book) r.wt.done = wt.done;   // 이미 레벨 종료한 교재 — 새 교재가 배정되기 전까지 그대로
      if (!r.tutorId) r.tutorId = s[0];
      // 웨일튜터에서 교재가 바뀌었으면 현황판의 지금 교재도 따라갑니다 (이전 교재는 히스토리로)
      var info = bookInfo(r.wt.book);
      r.current = r.current || { title: '', start: '', done: 0, total: 0, next: '', ordered: false };
      if (r.wt.done) info = null;
      if (info && bookFromTitle(r.current.title) !== r.wt.book) {
        r.history = Array.isArray(r.history) ? r.history : [];
        if (r.current.title) {
          r.history.push({ title: r.current.title, start: r.current.start || '', end: r.wt.start || ymdAgo(0), note: '웨일튜터에서 다음 교재로 바뀜' });
          res.switched.push(st.name + ' ' + r.current.title + ' → ' + info.name);
        }
        var nextMatches = bookFromTitle(r.current.next) === r.wt.book;
        r.current = { title: info.name, start: r.wt.start || '', done: 0, total: TOTAL, next: nextMatches ? '' : (r.current.next || ''), ordered: false };
      }
      if (info) {
        r.sbank = r.sbank || { track: 'sb', level: '', done: 0, total: 0 };
        if (info.phonics) { r.sbank.track = 'pc'; if (!/\d/.test(r.sbank.level || '') || bookFromTitle(r.sbank.level) !== 'WE-L0V' + info.vol) r.sbank.level = 'Phonics ' + info.vol; }
        else { r.sbank.track = 'sb'; r.sbank.level = info.level; }
      }
      Store.saveBoard(r);
      res.matched++;
    });
    (p.students || []).forEach(function (s) { if (!used[String(s[0]).toLowerCase()] && rowsById[String(s[0]).toLowerCase()]) res.unknown.push(s[1]); });
    try { localStorage.setItem('gorae-wt-last', JSON.stringify({ at: p.at, matched: res.matched, rows: res.rows })); } catch (e) {}
    return res;
  }
  function lastImport() {
    var at = '';
    Store.students({ active: true }).forEach(function (s) { var r = Store.board(s.id); if (r && r.wt && r.wt.at > at) at = r.wt.at; });
    return at;
  }

  /* ---------- 북마크 (웨일튜터 관리자 화면에서 누르는 것) ----------
   * 웨일튜터 화면 안에서 실행되므로 그 화면의 로그인 상태로 본사 학습현황을 읽을 수 있습니다.
   * 현황판 창을 열고, 날짜별 기록을 모은 뒤 postMessage 로 넘깁니다. 서버를 거치지 않습니다. */
  function bookmarkletSource() {
    var f = function () {
      var T = '__STAFF__', D = __DAYS__;
      if (location.hostname.indexOf('cloubot.com') < 0) { alert('웨일튜터 관리자 화면(whale.cloubot.com)에 로그인한 뒤 눌러 주세요.'); return; }
      // 새 창이 막히는 기기(태블릿 등)는 모은 기록을 창 이름에 담아 이 창에서 현황판으로 넘어갑니다
      var w = window.open(T + '/#/board?wt=1', 'gorae_wt');
      var same = !w || w === window;
      var bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);background:#003C70;color:#fff;padding:14px 22px;border-radius:12px;font:700 15px sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3)';
      document.body.appendChild(bar);
      var say = function (t) { bar.textContent = t; };
      var B = '/api/study/getStudyStat?user_idx=43294969&user_type=2&user_org_idx=dalnim0690&campus_number=699&class_idx=&student=&date=';
      var ds = [], i, d, p2 = function (n) { return ('0' + n).slice(-2); };
      for (i = 0; i <= D; i++) { d = new Date(Date.now() - i * 864e5); if (d.getDay() % 6) ds.push(d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())); }
      var out = {}, k = 0, q = ds.slice();
      var num = function (v) { return v == null || v === '' ? null : +v; };
      var one = function (dt) {
        return fetch(B + dt, { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
          var a = (j && j.data) || [];
          if (a.length) out[dt] = a.map(function (x) {
            var t = String(x.ai_test || '-').split('/');
            return [x.id, x.lesson, t.length > 1 ? +t[0] : -1, t.length > 1 ? +t[1] : 0, +x.dt || 0, x.student_book_check == '1' ? 1 : 0, num(x.voca_score), num(x.key_sentences), String(x.indatetime || '').slice(11, 16)];
          });
        }).catch(function () {}).then(function () { say('웨일튜터 기록 모으는 중… ' + (++k) + ' / ' + ds.length + '일'); });
      };
      var run = function () { var b = q.splice(0, 6); return b.length ? Promise.all(b.map(one)).then(run) : null; };
      say('웨일튜터 기록 모으는 중…');
      Promise.all([run(), fetch('/api/user/campusStudentListAll2/dalnim0690?page=all', { credentials: 'include' }).then(function (r) { return r.json(); })]).then(function (v) {
        var L = v[1] && v[1].data; L = Array.isArray(L) ? L : (L && L.list) || [];
        var pay = { type: 'gorae-wt', v: 1, at: new Date().toISOString(), days: out,
          students: L.map(function (s) { return [s.student_id, s.student_name || s.name, s.current_bookcode || '', s.current_short_name || '', String(s.book_start_datetime || '').slice(0, 10)]; }) };
        if (same) { say('현황판으로 넘어갑니다…'); window.name = 'gorae-wt:' + JSON.stringify(pay); location.href = T + '/#/board?wt=1'; return; }
        var done = false, n = 0;
        addEventListener('message', function (e) {
          if (e.origin !== T) return;
          if (e.data === 'gorae-wt-ack') { done = true; say('현황판으로 보냈어요 ✓  학생 ' + pay.students.length + '명 · ' + Object.keys(out).length + '일'); setTimeout(function () { bar.remove(); }, 5000); }
          if (e.data === 'gorae-wt-login') say('현황판 창에서 로그인해 주세요. 로그인하면 바로 저장됩니다.');
        });
        var iv = setInterval(function () {
          if (done) return clearInterval(iv);
          if (++n > 240) { clearInterval(iv); say('현황판 창이 응답하지 않아요. 창을 닫고 다시 눌러 주세요.'); return; }
          try { w.postMessage(pay, T); } catch (e) {}
        }, 500);
      });
    };
    return '(' + String(f).replace('__STAFF__', STAFF).replace('__DAYS__', FETCH_DAYS) + ')()';
  }
  function bookmarkletHref() {
    return 'javascript:' + encodeURIComponent(bookmarkletSource().replace(/\s*\n\s*/g, ' '));
  }

  return {
    TOTAL: TOTAL, ORIGIN: ORIGIN, LEVELS: LEVELS,
    parseCode: parseCode, bookInfo: bookInfo, bookFromTitle: bookFromTitle, bookKey: bookKey,
    kindOf: kindOf, unitOf: unitOf, dayOf: dayOf, labelOf: labelOf, shortOf: shortOf,
    sessions: sessions, stats: stats, dayList: dayList, recent: recent, classDates: classDates,
    importPayload: importPayload, lastImport: lastImport,
    bookmarkletSource: bookmarkletSource, bookmarkletHref: bookmarkletHref
  };
})();
