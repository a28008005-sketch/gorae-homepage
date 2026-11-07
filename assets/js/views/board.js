/* ===== 학습 현황판 (2026-11-07 추가) =====
 * 학생 명부의 등록생을 한 표로 보고, 학생마다
 *  - 웨일 프로그램 사용 여부 (웨일스튜던트 · 웨일튜터 3종 · 이북 · 스마트보타)
 *  - 센텐스뱅크 레벨·진도
 *  - 본사 교재 진도와 다음 교재 주문 알림 (80% 노랑 · 90% 빨강 · 주문완료 파랑)
 *  - 보유 교재 (부교재·예습·복습·문법·단어)
 *  - 주간 공통 숙제 (프랙시트북 · 데일리시트 10회) 와 개인 숙제 (ERLT · 원서 2권 · 추가 과제)
 * 를 체크합니다. 기록은 Store 의 boards 컬렉션(학생 1명당 1줄)에 저장되고 sync.js 가 다른 기기로 보냅니다.
 */
window.Views = window.Views || {};
Views.board = (function () {

  var PROGRAMS = [['ws', '웨일스튜던트', 'WS'], ['tg', '웨일튜터 · 고래영어', '튜터·고래'],
    ['to', '웨일튜터 · 오션라이팅', '튜터·오션'], ['tl', '웨일튜터 · 영어도서관', '튜터·도서관'],
    ['eb', '이북', '이북'], ['sb', '스마트보타 앱', '보타']];
  var MAT_TYPES = ['부교재', '예습', '복습', '문법', '단어', '기타'];
  var EXTRAS = [['news', '영자신문'], ['gram', '문법'], ['read', '독해'], ['voca', '단어'], ['exam', '시험대비']];
  var WARN = 80, URGENT = 90;
  var STATE_LABEL = { ok: '진행 중', warn: '주문 준비', urgent: '지금 주문', ordered: '주문 완료' };

  var week = mondayOf(new Date());
  var filter = { q: '', classId: '', alertOnly: false };
  var viewEl = null;
  var modal = { wrap: null, sid: null, tab: 'info', showPw: false, confirm: '' };
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
    return { studentId: sid, tutorId: '', tutorPw: '', programs: {}, sbank: { level: '', done: 0, total: 0 },
      current: { title: '', start: '', done: 0, total: 0, next: '', ordered: false },
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
    return { practice: !!w.practice, daily: num(w.daily), erlt: !!w.erlt, w1: w.w1 || '', w2: w.w2 || '',
      c1: !!w.c1, c2: !!w.c2, ex: Object.assign({}, w.ex || {}) };
  }
  function setWk(r, patch) { r.hw[week] = Object.assign(wk(r), patch); }
  function bookState(r) {
    var c = r.current;
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
    return '등록생 ' + roster().length + '명' + (n ? ' · 교재 주문 필요 ' + n + '명' : '');
  }

  function statsHtml(list) {
    var done = list.filter(function (s) { var w = wk(rec(s.id)); return w.practice && w.daily >= 10; }).length;
    var st = list.map(function (s) { return bookState(rec(s.id)).k; });
    var urg = st.filter(function (k) { return k === 'urgent'; }).length;
    var warn = st.filter(function (k) { return k === 'warn'; }).length;
    var ord = st.filter(function (k) { return k === 'ordered'; }).length;
    return '<div class="bd-stats">' +
      '<div class="bd-stat"><span>등록생</span><b>' + list.length + '</b><small>학생 명부 기준</small></div>' +
      '<div class="bd-stat"><span>이번 주 공통숙제 완료</span><b>' + done + '<small> / ' + list.length + '</small></b><small>프랙시트북 + 데일리 10회</small></div>' +
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

  function cellBook(s, r) {
    var c = r.current, b = bookState(r);
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

  function tableHtml(list) {
    if (!roster().length) return UI.emptyBox('학생 명부에 등록생이 없습니다. 학생 명부에서 먼저 학생을 등록해 주세요.', 'students');
    if (!list.length) return UI.emptyBox('조건에 맞는 학생이 없습니다. 검색어나 반 선택을 확인해 주세요.', 'search');
    return '<div class="bd-tablebox"><table class="bd-table"><thead><tr>' +
      '<th class="bd-sticky">학생</th><th>웨일 프로그램</th><th>센텐스뱅크</th><th>본사 교재 진도</th><th>보유 교재</th><th>공통 숙제</th><th>개인 숙제</th>' +
      '</tr></thead><tbody>' +
      list.map(function (s) {
        var r = rec(s.id), w = wk(r), b = bookState(r), sb = r.sbank;
        return '<tr data-sid="' + s.id + '" class="s-' + b.k + '">' +
          '<td class="bd-sticky bd-name"><button class="nm" data-act="open">' + esc(s.name) + '</button><span class="cls">' + esc(className(s) || s.grade || '반 미지정') + '</span></td>' +
          '<td class="bd-prog"><div class="bd-chips">' + PROGRAMS.map(function (p) {
            return '<button class="bd-chip' + (r.programs[p[0]] ? ' on' : '') + '" data-act="prog" data-k="' + p[0] + '" title="' + p[1] + '" aria-pressed="' + !!r.programs[p[0]] + '">' + p[2] + '</button>';
          }).join('') + '</div></td>' +
          '<td class="bd-sb">' + (sb.level
            ? '레벨 <b>' + esc(sb.level) + '</b>' + (sb.total ? ' <span class="muted">' + sb.done + '/' + sb.total + '</span><div class="bd-bar"><i style="width:' + Math.min(100, Math.round(sb.done / sb.total * 100)) + '%"></i></div>' : '')
            : '<button class="bd-chip ghost" data-act="open" data-tab="info">+ 레벨</button>') + '</td>' +
          '<td class="bd-bk">' + cellBook(s, r) + '</td>' +
          '<td class="bd-mat">' + cellMat(r) + '</td>' +
          '<td class="bd-hw"><div class="hw">' +
            '<button class="bd-tog' + (w.practice ? ' on' : '') + '" data-act="practice" aria-pressed="' + w.practice + '"><i></i>프랙시트북</button>' +
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
    el.innerHTML = '<div class="stack bd">' + statsHtml(all) + ordersHtml() + toolsHtml() + tableHtml(list) + legendHtml() + '</div>';
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
      var html = tableHtml(visible());
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
      case 'open': openModal(sid, t.getAttribute('data-tab')); break;
      case 'prog': mutate(sid, function (r) { r.programs[k] = !r.programs[k]; }); break;
      case 'unit': mutate(sid, function (r) { r.current.done = Math.max(0, Math.min(r.current.total, r.current.done + n)); }); break;
      case 'practice': mutate(sid, function (r) { setWk(r, { practice: !wk(r).practice }); }); break;
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
      '<div class="bd-sec"><h4>센텐스뱅크</h4><div class="bd-grid3">' +
        fld('레벨', 'sbank.level', r.sbank.level, 'text', '예: 240') + fld('완료 단원', 'sbank.done', r.sbank.done, 'number') + fld('전체 단원', 'sbank.total', r.sbank.total, 'number') +
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
        '<div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="bd-tog' + (c.ordered ? ' on' : '') + '" data-act="ordered"><i></i>다음 교재 주문 완료</button>' + finishUi + '</div>' +
        '<p class="hint">진도가 ' + WARN + '%를 넘으면 노란색, ' + URGENT + '%를 넘으면 빨간색으로 바뀌고 대시보드와 이 화면 위쪽 주문 알림에 올라갑니다.</p>' +
      '</div></div>' +
      '<div class="bd-sec"><h4>지난 교재 히스토리</h4>' +
        (r.history.length ? '<div class="bd-list">' + r.history.map(function (h, i) { return { h: h, i: i }; }).reverse().map(function (x) {
          return '<div class="li"><div class="grow"><b>' + esc(x.h.title) + '</b><span>' + esc(x.h.start || '?') + ' ~ ' + esc(x.h.end || '?') + '</span></div>' +
            '<button class="btn sm ghost" data-act="hdel" data-i="' + x.i + '">지우기</button></div>';
        }).join('') + '</div>' : '<p class="hint">완료 처리한 교재가 여기에 순서대로 쌓입니다.</p>') +
        '<div class="bd-grid3" style="align-items:end;margin-top:8px"><label class="fld">지난 교재 직접 추가<input id="bd-h-title" placeholder="교재명"></label>' +
          '<label class="fld">시작<input id="bd-h-start" type="date"></label><label class="fld">끝<input id="bd-h-end" type="date"></label></div>' +
        '<button class="btn sm" data-act="hadd" style="margin-top:8px">히스토리에 추가</button></div>';
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
        return '<span>' + weekLabel(k) + '</span><span>프랙시트북 ' + (x.practice ? '✓' : '–') + ' · 데일리 ' + x.daily + '/10' +
          (sp.erlt.on ? ' · ERLT ' + (x.erlt ? '✓' : '–') : '') + (ex.length ? ' · ' + ex.join(', ') + ' ✓' : '') + '</span>';
      }).join('') + '</div></div>';
  }

  function openModal(sid, tab) {
    var s = Store.student(sid);
    if (!s) return;
    modal.sid = sid; modal.tab = tab || 'info'; modal.showPw = false; modal.confirm = '';
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
    var tabs = [['info', '웨일 프로그램'], ['book', '본사 교재'], ['mat', '보유 교재'], ['hw', '개인 숙제']];
    var body = { info: tabInfo, book: tabBook, mat: tabMat, hw: tabHw }[modal.tab](s, r);
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
        case 'finish': modal.confirm = 'finish'; paintModal(); return;
        case 'cancel': modal.confirm = ''; paintModal(); return;
        case 'finish-yes':
          modal.confirm = '';
          mutate(sid, function (r) {
            var c = r.current;
            r.history.push({ title: c.title, start: c.start || '', end: U.ymd() });
            r.current = { title: c.next || '', start: c.next ? U.ymd() : '', done: 0, total: c.next ? c.total : 0, next: '', ordered: false };
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

  return { title: title, sub: sub, render: render, dashboardCard: dashboardCard,
    _bookState: function (sid) { return bookState(rec(sid)); } };
})();
