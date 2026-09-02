/* ===== 로그인 화면 · 동기화 상태 표시 ===== */
var AuthUI = (function () {

  var gateEl = null;

  /* ---------- 로그인 게이트 ---------- */
  function needsLogin() {
    return Sync.isCloud() && !Sync.signedIn();
  }

  function showGate(message) {
    if (gateEl) { gateEl.remove(); gateEl = null; }
    var ac = Store.get().academy;
    gateEl = document.createElement('div');
    gateEl.className = 'gate';
    gateEl.innerHTML =
      '<div class="gate-card">' +
        '<div class="gate-brand">🐋 ' + U.esc(ac.name) + ' <span>' + U.esc(ac.campus || '') + '</span></div>' +
        '<h1>선생님 로그인</h1>' +
        '<p class="gate-sub">학원 계정으로 로그인하면 다른 선생님이 입력한 기록까지 함께 보입니다.</p>' +
        (message ? '<div class="gate-msg">' + U.esc(message) + '</div>' : '') +
        '<label class="fld">이메일<input type="email" id="g-email" autocomplete="username" placeholder="teacher@example.com"></label>' +
        '<label class="fld" style="margin-top:12px">비밀번호<input type="password" id="g-pw" autocomplete="current-password"></label>' +
        '<div class="gate-err" id="g-err" hidden></div>' +
        '<button class="btn primary block" id="g-login" style="margin-top:16px">로그인</button>' +
        '<button class="btn block ghost" id="g-local" style="margin-top:8px">이 기기에만 저장하는 모드로 쓰기</button>' +
        '<p class="hint" style="margin-top:16px;text-align:center">계정은 원장님이 만들어 드립니다.<br>비밀번호를 잊으셨다면 원장님께 재설정을 요청해 주세요.</p>' +
      '</div>';
    document.body.appendChild(gateEl);

    var err = gateEl.querySelector('#g-err');
    function fail(msg) {
      err.textContent = msg;
      err.hidden = false;
    }

    function doLogin() {
      var email = gateEl.querySelector('#g-email').value.trim();
      var pw = gateEl.querySelector('#g-pw').value;
      if (!email || !pw) { fail('이메일과 비밀번호를 모두 입력해 주세요.'); return; }
      var btn = gateEl.querySelector('#g-login');
      btn.disabled = true; btn.textContent = '로그인 중…';
      err.hidden = true;
      Sync.signIn(email, pw).then(function () {
        hideGate();
        UI.toast('로그인했습니다.');
        if (window.App) App.rerender();
      }).catch(function (e) {
        fail(e && e.message ? e.message : '로그인에 실패했습니다.');
        btn.disabled = false; btn.textContent = '로그인';
      });
    }

    gateEl.querySelector('#g-login').addEventListener('click', doLogin);
    gateEl.querySelector('#g-pw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
    gateEl.querySelector('#g-local').addEventListener('click', function () {
      UI.confirm(
        '이 기기에만 저장하는 모드로 바꿀까요?<br>' +
        '<span style="font-size:13px;color:#63778a">클라우드 연결이 끊기고, 이 기기에 남아 있는 기록만 보입니다. ' +
        '설정 화면에서 언제든 다시 연결할 수 있습니다.</span>',
        function () {
          Sync.disableCloud();
          hideGate();
          if (window.App) App.rerender();
          UI.toast('이 기기 저장 모드로 전환했습니다.');
        }, { yes: '전환' });
    });

    setTimeout(function () {
      var f = gateEl.querySelector('#g-email');
      if (f) f.focus();
    }, 50);
  }

  function hideGate() {
    if (gateEl) { gateEl.remove(); gateEl = null; }
  }

  /** 로그인이 필요하면 화면을 덮고, 아니면 걷어냅니다. */
  function gate(message) {
    if (needsLogin()) showGate(message);
    else hideGate();
  }

  /* ---------- 상태 칩 ---------- */
  var LABEL = {
    off:       { text: '이 기기 저장', cls: 'gray' },
    connecting:{ text: '동기화 중…',   cls: 'blue' },
    online:    { text: '클라우드 연결됨', cls: 'ok' },
    offline:   { text: '오프라인 · 대기중', cls: 'warn' },
    error:     { text: '연결 오류',    cls: 'bad' },
    signedout: { text: '로그아웃됨',   cls: 'gray' }
  };

  function mountStatus() {
    var host = document.querySelector('.topbar-right');
    if (!host || host.querySelector('#sync-chip')) return;
    var chip = document.createElement('button');
    chip.id = 'sync-chip';
    chip.className = 'sync-chip';
    host.insertBefore(chip, host.firstChild);

    chip.addEventListener('click', function () { openPanel(); });

    Sync.onStatus(function (s) {
      // 세션이 끊기면(로그아웃 · 토큰 만료) 다시 로그인 화면을 띄웁니다.
      // 단, 학부모용 공개 화면은 덮지 않습니다.
      if (s === 'signedout' && Sync.isCloud() &&
          !(window.App && App.isPublicRoute && App.isPublicRoute())) {
        showGate(Sync.statusMessage() || '세션이 만료되었습니다. 다시 로그인해 주세요.');
      }
      // 사이드바 하단 안내도 모드에 맞춰 바꿉니다.
      var note = document.getElementById('storage-note');
      if (note && !/저장 불가/.test(note.textContent)) {
        note.textContent = Sync.isCloud() ? '선생님들과 공유 중' : '이 기기에 저장됨';
      }
      var meta = LABEL[s] || LABEL.off;
      var pending = Sync.pendingCount();
      chip.className = 'sync-chip ' + meta.cls;
      chip.textContent = (s === 'off' ? '💾 ' : '☁️ ') + meta.text +
        (pending ? ' (' + pending + ')' : '');
      chip.hidden = false;
    });
  }

  function openPanel() {
    var s = Sync.status();
    var u = Sync.currentUser();
    var cfg = Sync.config();
    UI.modal({
      title: '동기화 상태',
      body:
        '<dl class="kv">' +
          '<dt>모드</dt><dd>' + (Sync.isCloud() ? '클라우드 (여러 기기 공유)' : '이 기기에만 저장') + '</dd>' +
          '<dt>상태</dt><dd>' + U.esc((LABEL[s] || LABEL.off).text) +
            (Sync.statusMessage() ? ' <span class="hint">· ' + U.esc(Sync.statusMessage()) + '</span>' : '') + '</dd>' +
          (u ? '<dt>로그인</dt><dd>' + U.esc(u.email || '') + '</dd>' : '') +
          '<dt>보낼 기록</dt><dd>' + Sync.pendingCount() + '건</dd>' +
          (cfg.lastPulledAt ? '<dt>마지막 수신</dt><dd>' + U.esc(cfg.lastPulledAt.slice(0, 19).replace('T', ' ')) + '</dd>' : '') +
        '</dl>' +
        (Sync.isCloud()
          ? '<p class="hint" style="margin-top:14px">기록은 입력하는 즉시 이 기기에 저장되고, 잠시 뒤 자동으로 다른 선생님 기기에도 전달됩니다. ' +
            '인터넷이 끊겨도 계속 입력할 수 있고 연결되면 밀린 기록이 올라갑니다.</p>'
          : '<p class="hint" style="margin-top:14px">지금은 이 기기에만 저장하는 모드입니다. 여러 선생님이 함께 쓰려면 ' +
            '<b>설정 · 백업</b>에서 클라우드를 연결해 주세요.</p>'),
      footer: (Sync.isCloud()
        ? '<button class="btn" id="sp-out">로그아웃</button><div class="sp"></div>' +
          '<button class="btn primary" id="sp-sync">지금 동기화</button>'
        : '<button class="btn primary" data-close>닫기</button>'),
      onMount: function (w) {
        var sync = w.querySelector('#sp-sync');
        if (sync) sync.addEventListener('click', function () {
          sync.disabled = true; sync.textContent = '동기화 중…';
          Sync.syncNow().then(function () {
            UI.close(); UI.toast('동기화했습니다.');
            if (window.App) App.rerender();
          });
        });
        var out = w.querySelector('#sp-out');
        if (out) out.addEventListener('click', function () {
          UI.close();
          Sync.signOut().then(function () { gate('로그아웃했습니다.'); });
        });
      }
    });
  }

  return { gate: gate, mountStatus: mountStatus, openPanel: openPanel, hideGate: hideGate };
})();
