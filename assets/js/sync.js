/* ===== 동기화 엔진 =====
 * 화면과 저장소는 지금까지처럼 동기(즉시)로 동작하고,
 * 이 파일이 뒤에서 조용히 클라우드와 주고받습니다.
 *
 *  - 내가 고친 기록  : 대기열에 담아 잠시 뒤 한 번에 올림 (offline 이면 쌓아둠)
 *  - 남이 고친 기록  : 주기적으로 내려받아 병합하고 화면을 새로 그림
 *  - 충돌           : 나중에 저장된 쪽이 남음 (서버 시각 기준)
 */
var Sync = (function () {

  var CFG_KEY = 'gorae-academy-sync';
  var PULL_MS = 15000;
  var PUSH_DEBOUNCE_MS = 800;

  // 학원 공용 클라우드. 공개용(publishable) 키라 코드에 있어도 됩니다 — 기록은 RLS 로 로그인한 계정만 봅니다.
  var DEFAULT_URL = 'https://olzyfwiurfgaxctdemxa.supabase.co';
  var DEFAULT_KEY = 'sb_publishable_Iox5QRLACYO6FEhTtneQHQ_dsmucgv_';

  var cfg = { mode: 'local', url: '', anonKey: '', lastPulledAt: '', pending: [], lastUser: null };
  var transport = null;
  var user = null;
  var status = 'off';        // off | connecting | online | offline | error | signedout
  var statusMsg = '';
  var statusListeners = [];
  var pushTimer = null;
  var pullTimer = null;
  var busy = false;
  var needConnect = false;   // 오프라인으로 시작해 아직 서버와 연결을 맺지 못한 상태
  var listening = false;

  /* ---------- 설정 저장 ---------- */
  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        Object.keys(cfg).forEach(function (k) { if (p[k] !== undefined) cfg[k] = p[k]; });
      } else if (!window.GORAE_LOCAL_ONLY && !Cloud.getTransport()) {
        // 처음 여는 기기는 학원 클라우드에 바로 연결합니다. 설정에서 해제하면 그 뒤로는 따르지 않습니다.
        cfg.mode = 'cloud';
        cfg.url = DEFAULT_URL;
        cfg.anonKey = DEFAULT_KEY;
      }
    } catch (e) { /* 저장소를 못 읽으면 로컬 모드로 둡니다 */ }
    if (!Array.isArray(cfg.pending)) cfg.pending = [];
    return cfg;
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  /** 인증이 끊긴 오류인지 (토큰 만료 · 권한 없음) */
  function isAuthError(err) {
    var m = String((err && err.message) || err || '');
    return /JWT|jwt|401|Unauthorized|not authenticated|session|로그인/i.test(m);
  }

  function setStatus(s, msg) {
    status = s;
    statusMsg = msg || '';
    statusListeners.forEach(function (fn) { try { fn(s, statusMsg); } catch (e) {} });
  }
  function onStatus(fn) { statusListeners.push(fn); fn(status, statusMsg); }

  function isCloud() { return cfg.mode === 'cloud'; }
  function signedIn() { return !!user; }
  function currentUser() { return user; }
  function pendingCount() { return cfg.pending.length; }
  function config() { return { mode: cfg.mode, url: cfg.url, anonKey: cfg.anonKey, lastPulledAt: cfg.lastPulledAt }; }

  /* ---------- 대기열 ---------- */
  function enqueue(kind, id) {
    var key = kind + ':' + id;
    if (cfg.pending.indexOf(key) < 0) cfg.pending.push(key);
    saveCfg();
    schedulePush();
  }
  function schedulePush() {
    if (!isCloud() || !signedIn()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { push(); }, PUSH_DEBOUNCE_MS);
  }

  /** 대기열의 레코드를 현재 값으로 만들어 올립니다. */
  function push() {
    if (!isCloud() || !signedIn() || busy || !cfg.pending.length) return Promise.resolve(0);
    var batch = cfg.pending.slice();
    var rows = [];
    batch.forEach(function (key) {
      var i = key.indexOf(':');
      var kind = key.slice(0, i), id = key.slice(i + 1);
      var rec = Store.findRecord(kind, id);
      if (!rec) return;
      rows.push({ kind: kind, id: id, data: rec, deleted: !!rec.deleted });
    });
    if (!rows.length) {
      cfg.pending = []; saveCfg();
      return Promise.resolve(0);
    }

    busy = true;
    setStatus('connecting');
    return transport.upsert(rows).then(function () {
      // 올리는 동안 새로 쌓인 항목은 남겨둡니다.
      cfg.pending = cfg.pending.filter(function (k) { return batch.indexOf(k) < 0; });
      saveCfg();
      setStatus('online');
      return rows.length;
    }).catch(function (err) {
      if (isAuthError(err)) { user = null; stopLoop(); setStatus('signedout', '다시 로그인해 주세요.'); }
      else setStatus('offline', err.message || '전송 실패');
      return 0;
    }).then(function (n) {
      busy = false;
      return n;
    });
  }

  /** 서버에서 바뀐 기록을 받아 병합합니다. */
  function pull() {
    if (!isCloud() || !signedIn() || busy) return Promise.resolve(0);
    busy = true;
    return transport.fetchSince(cfg.lastPulledAt || null).then(function (rows) {
      var newest = cfg.lastPulledAt || '';
      rows.forEach(function (r) { if (r.updatedAt && r.updatedAt > newest) newest = r.updatedAt; });
      var applied = Store.applyRemote(rows);
      cfg.lastPulledAt = newest;
      saveCfg();
      setStatus('online');
      if (applied && window.App && App.rerender) App.rerender();
      return applied;
    }).catch(function (err) {
      if (isAuthError(err)) { user = null; stopLoop(); setStatus('signedout', '다시 로그인해 주세요.'); }
      else setStatus('offline', err.message || '연결 실패');
      return 0;
    }).then(function (n) {
      busy = false;
      return n;
    });
  }

  /** 올리고 내려받기를 한 번에 */
  function syncNow() {
    return reconnect().then(function () { return push(); }).then(function () { return pull(); });
  }

  /** 오프라인으로 시작했다면, 인터넷이 돌아온 뒤 서버 연결을 다시 맺습니다. */
  function reconnect() {
    if (!needConnect || !transport) return Promise.resolve();
    return transport.connect().then(function (u) {
      if (!u) {
        if (!navigator.onLine) return;
        needConnect = false;
        user = null; stopLoop(); setStatus('signedout', '다시 로그인해 주세요.');
        return;
      }
      needConnect = false;
      user = u;
      rememberUser(u);
    }).catch(function () { setStatus('offline', '인터넷 연결을 기다리는 중'); });
  }

  function rememberUser(u) {
    cfg.lastUser = u ? { id: u.id, email: u.email } : null;
    saveCfg();
  }

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('focus', function () { if (signedIn()) syncNow(); });
    window.addEventListener('online', function () { if (signedIn()) syncNow(); });
  }

  /** 인터넷 없이 열었을 때, 전에 로그인했던 기기라면 막지 않고 입력을 받습니다. */
  function startOffline() {
    user = cfg.lastUser;
    needConnect = true;
    setStatus('offline', '인터넷 연결을 기다리는 중');
    startLoop();
    listen();
    return user;
  }

  function startLoop() {
    clearInterval(pullTimer);
    pullTimer = setInterval(function () {
      if (document.hidden) return;
      syncNow();
    }, PULL_MS);
  }
  function stopLoop() { clearInterval(pullTimer); }

  /* ---------- 연결 · 로그인 ---------- */
  function makeTransport() {
    // 테스트나 다른 백엔드를 위해 미리 심어둔 전송 계층이 있으면 그것을 씁니다.
    var injected = Cloud.getTransport();
    if (injected) return injected;
    return Cloud.supabaseTransport(cfg.url, cfg.anonKey);
  }

  /** 앱 시작 시 호출. 저장된 설정으로 연결을 복구합니다. */
  function init() {
    loadCfg();
    Store.onRecordChange(function (kind, id) {
      if (isCloud()) enqueue(kind, id);
    });
    if (!isCloud()) { setStatus('off'); return Promise.resolve(null); }

    setStatus('connecting');
    transport = makeTransport();
    return transport.connect().then(function (u) {
      user = u || null;
      if (!user) {
        if (!navigator.onLine && cfg.lastUser) return startOffline();
        setStatus('signedout'); return null;
      }
      rememberUser(user);
      setStatus('online');
      startLoop();
      listen();
      return syncNow().then(function () { return user; });
    }).catch(function (err) {
      if (cfg.lastUser) return startOffline();
      setStatus('error', err.message || '연결 실패');
      return null;
    });
  }

  function signIn(email, password) {
    if (!transport) transport = makeTransport();
    return Promise.resolve()
      .then(function () { return transport.connect ? transport.connect() : null; })
      .then(function () { return transport.signIn(email, password); })
      .then(function (u) {
        user = u;
        needConnect = false;
        rememberUser(u);
        setStatus('online');
        startLoop();
        listen();
        return syncNow().then(function () { return u; });
      });
  }

  function signOut() {
    stopLoop();
    return Promise.resolve(transport && transport.signOut())
      .catch(function () {})
      .then(function () {
        user = null;
        rememberUser(null);
        setStatus('signedout');
      });
  }

  /* ---------- 모드 전환 ---------- */
  /**
   * 클라우드 모드로 전환합니다. 로그인은 별도로 해야 합니다.
   */
  function enableCloud(url, anonKey) {
    cfg.mode = 'cloud';
    cfg.url = String(url || '').trim().replace(/\/+$/, '');
    cfg.anonKey = String(anonKey || '').trim();
    cfg.lastPulledAt = '';
    saveCfg();
    transport = makeTransport();
    setStatus('connecting');
    return transport.connect().then(function (u) {
      user = u || null;
      setStatus(user ? 'online' : 'signedout');
      return user;
    });
  }

  function disableCloud() {
    stopLoop();
    cfg.mode = 'local';
    cfg.pending = [];
    cfg.lastPulledAt = '';
    cfg.lastUser = null;
    saveCfg();
    user = null;
    needConnect = false;
    transport = null;
    setStatus('off');
  }

  /**
   * 이 기기에 있는 기록 전체를 클라우드로 올립니다.
   * 백업 파일을 불러온 직후나, 처음 클라우드로 옮길 때 사용합니다.
   */
  function uploadAll() {
    if (!isCloud() || !signedIn()) {
      return Promise.reject(new Error('먼저 클라우드에 로그인해 주세요.'));
    }
    var changed = Store.stampAll();
    changed.forEach(function (c) {
      var key = c.kind + ':' + c.id;
      if (cfg.pending.indexOf(key) < 0) cfg.pending.push(key);
    });
    saveCfg();
    // 큰 묶음은 나눠서 올립니다.
    return (function flush() {
      if (!cfg.pending.length) return Promise.resolve();
      return push().then(function (n) { return n ? flush() : Promise.resolve(); });
    })().then(function () { return changed.length; });
  }

  return {
    init: init, isCloud: isCloud, signedIn: signedIn, currentUser: currentUser,
    signIn: signIn, signOut: signOut, enableCloud: enableCloud, disableCloud: disableCloud,
    uploadAll: uploadAll, syncNow: syncNow, push: push, pull: pull,
    onStatus: onStatus, status: function () { return status; }, statusMessage: function () { return statusMsg; },
    pendingCount: pendingCount, config: config,
    defaults: function () { return { url: DEFAULT_URL, anonKey: DEFAULT_KEY }; }
  };
})();
