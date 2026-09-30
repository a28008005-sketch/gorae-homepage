/* 인터넷이 끊긴 상태에서도 원생관리 화면이 열리도록 한 번 받은 파일을 보관합니다.
 * 항상 네트워크를 먼저 시도하므로, 새로 배포한 코드는 온라인일 때 바로 반영됩니다.
 * 학원 화면 파일(js·css)은 브라우저 캐시(GitHub Pages 10분)를 믿지 않고 매번 새 버전인지 확인합니다.
 * 이게 없으면 배포 뒤 최대 10분 동안 예전 화면이 계속 보입니다.
 * 열어 둔 탭의 새로고침까지 확실히 반영되도록 index.html 의 파일 주소에는 ?v=버전 을 붙입니다 (tools/stamp.js). */
var CACHE = 'gorae-staff-v3';
var SDK_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  // 예전 보관함은 정리합니다.
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('gorae-staff-') === 0; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var cacheable = url.origin === self.location.origin || url.host === SDK_HOST ||
    /fonts\.(googleapis|gstatic)\.com$/.test(url.host);
  if (!cacheable) return;   // Supabase 데이터 요청은 건드리지 않습니다
  // 숙제 영상·자료실 파일(/hw…)은 크기가 커서 보관하지 않고 그대로 보냅니다.
  if (url.origin === self.location.origin && /^\/hw(\/|$)/.test(url.pathname)) return;

  // 학원 화면 파일은 브라우저 캐시를 믿지 않고 매번 서버에 '바뀌었나요?' 를 묻습니다(바뀌지 않았으면 가볍게 끝남).
  // 화면 이동(navigate)은 로그인 이동 처리 때문에 요청을 그대로 두고 캐시만 건너뜁니다.
  var net;
  if (url.origin !== self.location.origin) {
    net = fetch(req);
  } else if (req.mode === 'navigate') {
    net = fetch(req, { cache: 'no-cache' }).catch(function () { return fetch(req); });
  } else {
    net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  }

  e.respondWith(
    net.then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: url.origin === self.location.origin }).then(function (hit) {
        if (hit) return hit;
        if (req.mode !== 'navigate') return Response.error();
        return caches.match('./').then(function (home) {
          return home || caches.match('./index.html');
        }).then(function (home) { return home || Response.error(); });
      });
    })
  );
});
