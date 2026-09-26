/* 인터넷이 끊긴 상태에서도 원생관리 화면이 열리도록 한 번 받은 파일을 보관합니다.
 * 항상 네트워크를 먼저 시도하므로, 새로 배포한 코드는 온라인일 때 바로 반영됩니다. */
var CACHE = 'gorae-staff-v1';
var SDK_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var cacheable = url.origin === self.location.origin || url.host === SDK_HOST ||
    /fonts\.(googleapis|gstatic)\.com$/.test(url.host);
  if (!cacheable) return;   // Supabase 데이터 요청은 건드리지 않습니다

  e.respondWith(
    fetch(req).then(function (res) {
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
