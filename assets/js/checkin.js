/* ===== 등하원 출결 (학원 태블릿 전용) =====
 * 아이가 학부모 휴대폰 뒤 4자리를 누르면 오늘 출결에 등원·하원 시각을 찍습니다.
 * 기록은 원생관리와 같은 저장소(Store)에 들어가고, 동기화(Sync)가 클라우드로 올립니다.
 * 원생관리 [출결 · 일일학습] 화면에 15초 안에 나타납니다.
 *
 *  - 처음 누르면   : 등원 (출석 처리 + 등원 시각)
 *  - 다시 누르면   : 하원할지 물어본 뒤 하원 시각
 *  - 형제자매처럼 번호가 같은 학생이 여럿이면 이름을 골라서 누릅니다.
 */
var Checkin = (function () {

  var DIGITS = 4;
  var RECHECK_MIN = 50;     // 등원 직후 이 시간 안에 다시 누르면 하원으로 넘기지 않습니다
  var IDLE_MS = 20000;      // 이름 고르는 화면에서 아무것도 안 하면 처음으로
  var DONE_MS = 3500;       // 완료 화면을 보여주는 시간

  var code = '';
  var idleTimer = null;
  var root = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nowHm(d) { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function digits(v) { return String(v || '').replace(/[^0-9]/g, ''); }

  /** 학부모 연락처 뒤 4자리가 같은 등록생 */
  function matches(last4) {
    return Store.students({ active: true }).filter(function (s) {
      // 아버지·어머니 번호를 한 칸에 '010-…, 010-…' 로 적어도 둘 다 받습니다.
      var list = String(s.parentPhone || '').match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g) || [s.parentPhone];
      return list.some(function (one) {
        var p = digits(one);
        return p.length >= DIGITS && p.slice(-DIGITS) === last4;
      });
    });
  }

  /** 오늘 이 학생의 상태: in(등원 전) / out(하원 전) / done(하원까지 끝) */
  function stateOf(s) {
    var r = Store.attendanceFor(s.id, U.ymd());
    if (!r || !r.checkIn) return { step: 'in', rec: r };
    if (!r.checkOut) return { step: 'out', rec: r };
    return { step: 'done', rec: r };
  }

  /* ---------- 소리 ---------- */
  var audio = null;
  function beep(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var notes = ok ? [880, 1320] : [220];
      notes.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        var t = audio.currentTime + i * 0.12;
        o.frequency.value = f;
        o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.22 : 0.35));
        o.connect(g); g.connect(audio.destination);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) { /* 소리가 안 나도 출결에는 영향 없습니다 */ }
  }

  /* ---------- 화면 ---------- */
  function $(sel) { return root.querySelector(sel); }

  function clearIdle() { clearTimeout(idleTimer); idleTimer = null; }
  function idle(ms) {
    clearIdle();
    idleTimer = setTimeout(reset, ms || IDLE_MS);
  }

  function reset() {
    clearIdle();
    code = '';
    showPad();
  }

  function dots() {
    var out = '';
    for (var i = 0; i < DIGITS; i++) {
      out += '<span class="ci-dot' + (i < code.length ? ' on' : (i === code.length ? ' cur' : '')) + '">' +
        (i < code.length ? U.esc(code[i]) : '') + '</span>';
    }
    return out;
  }

  function showPad(message, bad) {
    // 번호판은 오른쪽 파란 영역에 늘 떠 있고, 여기(왼쪽)에는 4칸만 그립니다.
    $('#ci-panel').innerHTML =
      '<div class="ci-dots' + (bad ? ' shake' : '') + '" id="ci-dots">' + dots() + '</div>' +
      '<p class="ci-msg' + (bad ? ' bad' : '') + '" id="ci-msg">' + (message ? U.esc(message) : '&nbsp;') + '</p>';
  }

  function refreshDots() {
    var el = $('#ci-dots');
    if (el) { el.className = 'ci-dots'; el.innerHTML = dots(); }
    var m = $('#ci-msg');
    if (m) { m.className = 'ci-msg'; m.innerHTML = '&nbsp;'; }
  }

  function press(k) {
    if (!$('#ci-dots')) {
      // 이름 고르기·완료 화면에서 다음 아이가 숫자를 누르면 바로 처음부터 새로 받습니다.
      if (!/^[0-9]$/.test(k)) return;
      reset();
    }
    if (k === 'clear') { code = ''; refreshDots(); return; }
    if (k === 'back') { code = code.slice(0, -1); refreshDots(); return; }
    if (!/^[0-9]$/.test(k) || code.length >= DIGITS) return;
    code += k;
    refreshDots();
    if (code.length === DIGITS) setTimeout(lookup, 120);
  }

  function lookup() {
    var list = matches(code);
    if (!list.length) {
      beep(false);
      code = '';
      // 명단 자체가 비어 있으면 번호 문제가 아니라 원생관리와 연결이 안 된 것입니다.
      showPad(Store.students({ active: true }).length
        ? '등록된 번호가 없어요. 다시 눌러 주세요.'
        : '학생 명단을 아직 받아오지 못했어요. 선생님께 알려 주세요.', true);
      return;
    }
    showPick(list);
  }

  function badge(s) {
    var st = stateOf(s);
    if (st.step === 'out') return '<span class="ci-badge">등원 ' + U.esc(st.rec.checkIn) + '</span>';
    if (st.step === 'done') return '<span class="ci-badge done">하원 ' + U.esc(st.rec.checkOut) + '</span>';
    return '';
  }

  function showPick(list) {
    var sc;
    $('#ci-panel').innerHTML =
      '<p class="ci-ask">' + (list.length > 1 ? '내 이름을 눌러 주세요' : '내 이름이 맞으면 눌러 주세요') + '</p>' +
      '<div class="ci-names">' +
        list.map(function (s) {
          sc = Store.scheduleOf(s);
          return '<button class="ci-name" data-sid="' + U.esc(s.id) + '">' +
            '<span class="nm">' + U.esc(s.name) + '</span>' +
            '<span class="sub">' + U.esc(sc.className || s.grade || '') + '</span>' +
            badge(s) +
          '</button>';
        }).join('') +
      '</div>' +
      '<button class="ci-back" data-act="reset">처음으로</button>';
    idle();
  }

  function choose(id) {
    var s = Store.student(id);
    if (!s) { reset(); return; }
    var st = stateOf(s);
    if (st.step === 'in') { checkIn(s); return; }
    if (st.step === 'out') {
      var at = st.rec.checkInAt ? new Date(st.rec.checkInAt) : null;
      if (at && (Date.now() - at.getTime()) < RECHECK_MIN * 60000) {
        done(s, 'already', st.rec.checkIn);
        return;
      }
      askOut(s, st.rec);
      return;
    }
    done(s, 'finished', st.rec.checkOut);
  }

  function checkIn(s) {
    var now = new Date();
    // 선생님이 미리 '결석'을 눌러 두었더라도 실제로 왔으면 출석으로 바꿉니다.
    Store.setAttendance(s.id, U.ymd(now), {
      status: '출석',
      checkIn: nowHm(now),
      checkInAt: now.toISOString()
    });
    var told = Notify.queue(s, 'in', U.ymd(now), nowHm(now));
    Sync.push();
    done(s, 'in', nowHm(now), told);
  }

  function askOut(s, rec) {
    $('#ci-panel').innerHTML =
      '<div class="ci-confirm">' +
        '<p class="ci-big">' + U.esc(s.name) + '</p>' +
        '<p class="ci-ask">등원 ' + U.esc(rec.checkIn) + ' · 지금 <b>하원</b>할까요?</p>' +
        '<div class="ci-two">' +
          '<button class="ci-btn ghost" data-act="reset">아니요</button>' +
          '<button class="ci-btn primary" data-act="out" data-sid="' + U.esc(s.id) + '">하원하기</button>' +
        '</div>' +
      '</div>';
    idle();
  }

  function checkOut(id) {
    var s = Store.student(id);
    if (!s) { reset(); return; }
    var now = new Date();
    Store.setAttendance(s.id, U.ymd(now), { checkOut: nowHm(now), checkOutAt: now.toISOString() });
    var told = Notify.queue(s, 'out', U.ymd(now), nowHm(now));
    Sync.push();
    done(s, 'out', nowHm(now), told);
  }

  /** told: 부모님께 카톡을 보내기로 했는지 */
  function done(s, kind, time, told) {
    var ok = kind === 'in' || kind === 'out';
    beep(ok);
    var title = {
      in: '등원 완료!',
      out: '하원 완료!',
      already: '이미 등원했어요',
      finished: '오늘은 이미 하원했어요'
    }[kind];
    var line = {
      in: '오늘도 즐겁게 공부해요 :)',
      out: '오늘도 수고했어요. 조심히 가요!',
      already: '등원 시각 ' + time,
      finished: '하원 시각 ' + time
    }[kind];
    $('#ci-panel').innerHTML =
      '<div class="ci-done ' + (ok ? 'ok' : 'info') + '">' +
        '<div class="ci-check">' + (ok ? '✓' : 'i') + '</div>' +
        '<p class="ci-big">' + U.esc(s.name) + '</p>' +
        '<p class="ci-title">' + U.esc(title) + (ok ? ' <span class="ci-time">' + U.esc(time) + '</span>' : '') + '</p>' +
        '<p class="ci-line">' + U.esc(line) + '</p>' +
        (told ? '<p class="ci-told">부모님께 카톡으로 알려 드렸어요</p>' : '') +
      '</div>';
    code = '';
    tick();
    idle(DONE_MS);
  }

  /* ---------- 시계 · 상태 ---------- */
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function tick() {
    var d = new Date();
    var c = document.getElementById('ci-clock');
    if (c) {
      var h = d.getHours() % 12 || 12;
      c.innerHTML = pad(h) + '<span class="colon">:</span>' + pad(d.getMinutes());
    }
    var ap = document.getElementById('ci-ampm');
    if (ap) ap.textContent = d.getHours() < 12 ? '오전' : '오후';
    var t = document.getElementById('ci-date');
    if (t) t.textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일';
    var n = document.getElementById('ci-count');
    if (n) {
      var today = Store.attendanceOn(U.ymd(d)).filter(function (r) { return r.checkIn; });
      var inside = today.filter(function (r) { return !r.checkOut; }).length;
      n.textContent = '오늘 등원 ' + today.length + '명 · 지금 학원에 ' + inside + '명';
    }
  }

  var LABEL = {
    off: '이 기기에만 저장 중 — 원생관리와 연동되지 않습니다',
    connecting: '동기화 중…',
    online: '원생관리와 연결됨',
    offline: '인터넷 끊김 · 연결되면 자동으로 올라갑니다',
    error: '연결 오류',
    signedout: '로그인이 필요합니다'
  };
  function paintStatus(s) {
    var el = document.getElementById('ci-status');
    if (!el) return;
    var pending = Sync.pendingCount();
    el.className = 'ci-status ' + s;
    var msg = Sync.statusMessage();
    // 인터넷 문제가 아닌 서버 오류는 원인을 그대로 보여 줍니다 (선생님이 알아볼 수 있게).
    var detail = (s === 'offline' || s === 'error') && msg && navigator.onLine ? ' — ' + msg : '';
    el.textContent = (s === 'offline' && navigator.onLine ? '원생관리와 연결 안 됨' : (LABEL[s] || '')) + detail +
      (pending ? ' (보낼 기록 ' + pending + '건)' : '');
  }

  /* ---------- 시작 ---------- */
  function bind() {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && b.id === 'ci-gear') return;
      if (!b) return;
      if (b.hasAttribute('data-k')) { press(b.getAttribute('data-k')); return; }
      if (b.classList.contains('ci-name')) { choose(b.getAttribute('data-sid')); return; }
      var act = b.getAttribute('data-act');
      if (act === 'reset') reset();
      if (act === 'out') checkOut(b.getAttribute('data-sid'));
    });
    // 블루투스 키보드·숫자패드로도 누를 수 있게
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('.gate, .modal-wrap')) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape') reset();
    });

    // 톱니바퀴(또는 아래 상태 표시)를 2초간 누르면 동기화 상태 창(로그아웃 · 지금 동기화)이 열립니다.
    // 아이들이 실수로 누르지 않도록 길게 눌러야 열리게 했습니다.
    [document.getElementById('ci-gear'), document.getElementById('ci-status')].forEach(function (el) {
      var holdTimer = null;
      function hold() {
        el.classList.add('holding');
        holdTimer = setTimeout(function () { el.classList.remove('holding'); AuthUI.openPanel(); }, 2000);
      }
      function release() { clearTimeout(holdTimer); el.classList.remove('holding'); }
      el.addEventListener('pointerdown', hold);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('pointercancel', release);
    });
  }

  function boot() {
    root = document.getElementById('ci-app');
    var nm = String(Store.get().academy.name || '고래영어').trim();
    document.getElementById('ci-academy').textContent = /학원$/.test(nm) ? nm : nm + '학원';
    bind();
    showPad();
    tick();
    setInterval(tick, 5000);

    Sync.onStatus(function (s) {
      paintStatus(s);
      if (s === 'signedout' && Sync.isCloud()) AuthUI.gate(Sync.statusMessage() || '태블릿을 학원 계정으로 로그인해 주세요.');
    });
    Sync.init().then(function () {
      AuthUI.gate();
      tick();
    });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
    // 화면이 꺼지지 않게 (지원하는 브라우저만)
    try {
      if (navigator.wakeLock) {
        var lock = function () { navigator.wakeLock.request('screen').catch(function () {}); };
        lock();
        document.addEventListener('visibilitychange', function () { if (!document.hidden) lock(); });
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { matches: matches, press: press, reset: reset, choose: choose };
})();
