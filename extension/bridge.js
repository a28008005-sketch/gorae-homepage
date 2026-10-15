/* 고래영어 성적 연동 — 원생관리 화면 쪽 다리
 *
 * 확장 프로그램이 chrome.storage.local 의 pendingGrades 에 맡겨 둔 성적을
 * 원생관리 화면(staff.whalejinju.kr)에 window.postMessage 로 넘겨 줍니다.
 * 원생관리 화면이 '받았다(gorae-grades-ack)' 고 대답하면 맡겨 둔 것을 지웁니다.
 *
 * 서버를 거치지 않고 같은 컴퓨터 안에서만 오가므로 CORS 문제가 생기지 않습니다.
 * 로그인 화면 때문에 처음에 못 받으면, 로그인 뒤 화면이 다시 열릴 때 다시 넘겨 줍니다.
 */
(function () {
  'use strict';
  if (window.__goraeBridge) return;
  window.__goraeBridge = true;

  var delivering = false;

  function deliver() {
    if (delivering) return;
    chrome.storage.local.get('pendingGrades', function (got) {
      var p = got && got.pendingGrades;
      if (!p || !p.rows || !p.rows.length) return;
      delivering = true;
      var done = false;
      var tries = 0;

      function onAck(e) {
        if (e.source !== window || !e.data || e.data.type !== 'gorae-grades-ack' || e.data.id !== p.id) return;
        done = true;
        delivering = false;
        window.removeEventListener('message', onAck);
        chrome.storage.local.remove('pendingGrades');
        chrome.runtime.sendMessage({ type: 'GORAE_DELIVERED', id: p.id, count: e.data.count }).catch(function () {});
      }
      window.addEventListener('message', onAck);

      // 원생관리 화면이 아직 다 뜨지 않았을 수 있어 1초마다 최대 20번 보냅니다.
      (function post() {
        if (done) return;
        if (tries++ >= 20) {
          delivering = false;
          window.removeEventListener('message', onAck);
          chrome.runtime.sendMessage({ type: 'GORAE_DELIVER_WAITING', id: p.id }).catch(function () {});
          return;
        }
        window.postMessage({
          type: 'gorae-grades-import', id: p.id, rows: p.rows, pageUrl: p.pageUrl || ''
        }, location.origin);
        setTimeout(post, 1000);
      })();
    });
  }

  deliver();
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'GORAE_DELIVER') deliver();
  });
})();
