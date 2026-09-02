/* ===== 클라우드 연결 (Supabase) =====
 * 여러 선생님이 각자 기기에서 같은 기록을 보도록 하는 저장소입니다.
 * 화면 코드는 이 파일을 직접 부르지 않습니다. 동기화(sync.js)만 사용합니다.
 *
 * 전송 계층(transport)은 갈아끼울 수 있게 분리해 두었습니다.
 * 실제 서비스에서는 Supabase 를 쓰고, 테스트에서는 가짜 전송 계층을 넣습니다.
 */
var Cloud = (function () {

  var transport = null;
  var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  /** 테스트·대체 구현용 */
  function setTransport(t) { transport = t; }
  function getTransport() { return transport; }

  /* ---------- Supabase 전송 계층 ---------- */
  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-supabase-sdk]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('SDK 로드 실패')); });
        return;
      }
      var el = document.createElement('script');
      el.src = CDN;
      el.setAttribute('data-supabase-sdk', '1');
      el.onload = function () { resolve(); };
      el.onerror = function () {
        reject(new Error('Supabase 연결 파일을 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.'));
      };
      document.head.appendChild(el);
    });
  }

  /**
   * @param {string} url      Supabase 프로젝트 URL
   * @param {string} anonKey  공개(anon) 키 — 브라우저에 노출되어도 되는 키입니다.
   *                          service_role 키는 절대 여기에 넣으면 안 됩니다.
   */
  function supabaseTransport(url, anonKey) {
    var client = null;
    var TABLE = 'records';

    function need() {
      if (!client) throw new Error('클라우드에 아직 연결되지 않았습니다.');
      return client;
    }

    return {
      name: 'supabase',

      connect: function () {
        return loadSdk().then(function () {
          client = window.supabase.createClient(url, anonKey, {
            auth: { persistSession: true, autoRefreshToken: true }
          });
          return client.auth.getSession().then(function (res) {
            return (res.data && res.data.session) ? res.data.session.user : null;
          });
        });
      },

      signIn: function (email, password) {
        return need().auth.signInWithPassword({ email: email, password: password })
          .then(function (res) {
            if (res.error) throw new Error(translateAuthError(res.error.message));
            return res.data.user;
          });
      },

      signOut: function () {
        return need().auth.signOut();
      },

      /** since 이후에 바뀐 레코드만 받아옵니다. */
      fetchSince: function (since) {
        var q = need().from(TABLE).select('kind,id,data,updated_at,deleted');
        // gte 로 겹쳐 받습니다. 같은 밀리초에 쓰인 레코드를 놓치지 않기 위해서이고,
        // 병합은 멱등이라 중복으로 받아도 문제가 없습니다.
        if (since) q = q.gte('updated_at', since);
        return q.then(function (res) {
          if (res.error) throw new Error(res.error.message);
          return (res.data || []).map(function (r) {
            return { kind: r.kind, id: r.id, data: r.data, updatedAt: r.updated_at, deleted: !!r.deleted };
          });
        });
      },

      upsert: function (rows) {
        if (!rows.length) return Promise.resolve();
        // updated_at 은 서버 트리거가 찍습니다. 선생님들 기기의 시계가
        // 서로 조금씩 다르더라도 순서가 뒤집히지 않도록 하기 위해서입니다.
        var payload = rows.map(function (r) {
          return { kind: r.kind, id: r.id, data: r.data, deleted: !!r.deleted };
        });
        return need().from(TABLE).upsert(payload, { onConflict: 'kind,id' })
          .then(function (res) {
            if (res.error) throw new Error(res.error.message);
          });
      }
    };
  }

  /** Supabase 인증 오류를 학원에서 알아볼 수 있는 말로 바꿉니다. */
  function translateAuthError(msg) {
    var m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 아직 끝나지 않은 계정입니다.';
    if (/rate limit|too many/i.test(m)) return '로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
    return m;
  }

  return {
    setTransport: setTransport,
    getTransport: getTransport,
    supabaseTransport: supabaseTransport,
    translateAuthError: translateAuthError
  };
})();
