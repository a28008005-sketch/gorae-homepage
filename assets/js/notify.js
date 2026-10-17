/* ===== 등하원 카톡 알림 =====
 * 출결 태블릿에서 등원·하원을 누르면 학부모님께 카카오 알림톡을 보냅니다.
 * 실제 발송은 문지기 워커(worker/worker.js 의 /api/notify/*)가 솔라피로 합니다.
 * 솔라피 열쇠는 워커에만 있고, 이 파일은 "누구에게 무엇을" 만 넘깁니다.
 *
 *  - 켜고 끄기: 설정 · 백업 → 등하원 카톡 알림 (academy.notifyIn / notifyOut)
 *  - 인터넷이 잠깐 끊기면 태블릿에 담아 두었다가 다시 보냅니다. 30분이 지난 알림은 늦어서 버립니다.
 *  - 결과는 그날 출결 기록의 notifyIn / notifyOut 에 남아 [출결 · 일일학습] 화면에 보입니다.
 */
var Notify = (function () {

  var QUEUE_KEY = 'gorae-notify-queue';
  var MAX_AGE_MS = 30 * 60000;
  var busy = false;

  function enabled(kind) {
    var ac = Store.get().academy;
    return kind === 'out' ? !!ac.notifyOut : !!ac.notifyIn;
  }
  function field(kind) { return kind === 'out' ? 'notifyOut' : 'notifyIn'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function load() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function keep(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }

  /** 출결 기록에 발송 결과를 남깁니다. state: sending / sent / failed / skipped */
  function mark(item, state, msg) {
    var p = {};
    p[field(item.kind)] = { state: state, msg: msg || '', at: hm() };
    Store.setAttendance(item.sid, item.date, p);
  }

  /**
   * 등원·하원 직후 부릅니다. 보내기로 했으면 true.
   * @param {object} s     학생
   * @param {string} kind  'in' | 'out'
   */
  function queue(s, kind, date, time) {
    if (!enabled(kind)) return false;
    var item = { sid: s.id, date: date, kind: kind, name: s.name, to: s.parentPhone || '', time: time, at: Date.now() };
    if (!String(item.to).replace(/\D/g, '')) { mark(item, 'skipped', '학부모 연락처 없음'); return false; }
    var rec = Store.attendanceFor(s.id, date);
    item.key = (rec && rec.id) || (s.id + '-' + date);
    var q = load();
    q.push(item);
    keep(q);
    mark(item, 'sending');
    flush();
    return true;
  }

  function post(path, body) {
    return fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) {
          var e = new Error(res.status === 401 ? '로그인이 풀렸습니다' : (j.error || ('서버 오류 ' + res.status)));
          e.server = true;
          throw e;
        }
        return j;
      });
    });
  }

  /** 담아 둔 알림을 하나씩 보냅니다. 인터넷이 안 되면 다음에 다시 시도합니다. */
  function flush() {
    if (busy) return Promise.resolve();
    var q = load();
    if (!q.length) return Promise.resolve();
    var item = q[0];
    if (Date.now() - item.at > MAX_AGE_MS) {
      keep(q.slice(1));
      mark(item, 'failed', '30분 넘게 보내지 못해 취소');
      return flush();
    }
    busy = true;
    return post('/api/notify/attendance', {
      kind: item.kind, to: item.to, name: item.name, time: item.time, key: item.key
    }).then(function (j) {
      busy = false;
      keep(load().slice(1));
      mark(item, 'sent', j.error ? ('일부 실패: ' + j.error) : '');
      return flush();
    }, function (e) {
      busy = false;
      if (!e.server) return;            // 인터넷 문제 — 그대로 두었다가 다시 보냅니다
      keep(load().slice(1));
      mark(item, 'failed', e.message);
      return flush();
    });
  }

  /** 워커에 무엇이 설정됐는지 (설정 화면용) */
  function status() {
    return fetch('/api/notify/status', { credentials: 'same-origin', cache: 'no-store' }).then(function (res) {
      if (res.status === 401) throw new Error('staff.whalejinju.kr 에 로그인한 화면에서만 확인할 수 있습니다.');
      if (!res.ok) throw new Error('알림 창구가 아직 워커에 없습니다. (worker.js 를 새로 붙여 넣어 주세요)');
      return res.json();
    }).catch(function (e) {
      if (e instanceof TypeError) throw new Error('워커에 닿지 않습니다. staff.whalejinju.kr 주소로 열었는지 확인해 주세요.');
      throw e;
    });
  }

  function test(to, kind) {
    return post('/api/notify/test', { to: to, kind: kind === 'out' ? 'out' : 'in' });
  }

  /** 출결 화면에 붙일 작은 표시 */
  function badge(n, label) {
    if (!n || !n.state) return '';
    var txt = { sending: '보내는 중', sent: '보냄', failed: '실패', skipped: '안 보냄' }[n.state] || '';
    var cls = n.state === 'sent' ? 'ok' : (n.state === 'sending' ? '' : 'bad');
    return ' <span class="att-notify ' + cls + '" title="' + U.esc((n.at ? n.at + ' ' : '') + (n.msg || '')) + '">' +
      '카톡 ' + U.esc(label) + ' ' + txt + '</span>';
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { flush(); });
    setInterval(function () { flush(); }, 60000);
    document.addEventListener('DOMContentLoaded', function () { setTimeout(flush, 3000); });
  }

  return { queue: queue, flush: flush, status: status, test: test, enabled: enabled, badge: badge, pending: function () { return load().length; } };
})();
