// Service Worker for 고래영어 대시보드
// 오프라인 지원 및 캐싱 처리

const CACHE_VERSION = 'gorae-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/manifest.json',
];

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Caching essential files');
      return cache.addAll(CACHE_URLS).catch(err => {
        console.warn('[SW] Cache addAll warning:', err);
        // 일부 파일이 없을 수 있으므로 경고만 출력하고 계속 진행
      });
    })
  );
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 요청 처리 (네트워크 우선, 실패 시 캐시 사용)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API 요청은 네트워크 우선
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 성공한 응답 캐싱
          if (response.ok) {
            const cache = caches.open(CACHE_VERSION);
            cache.then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // 네트워크 실패 시 캐시에서 가져오기
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || new Response(
              JSON.stringify({
                error: '오프라인 상태입니다. 캐시된 데이터를 사용하고 있습니다.',
                success: false
              }),
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
  }

  // 기타 요청은 캐시 우선
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then(response => {
          // HTML 파일 캐싱
          if (request.method === 'GET' &&
              (request.destination === 'document' ||
               request.destination === 'style' ||
               request.destination === 'script')) {
            const cache = caches.open(CACHE_VERSION);
            cache.then(c => c.put(request, response.clone()));
          }
          return response;
        });
      })
      .catch(() => {
        // 오프라인 시 오프라인 페이지 반환
        if (request.destination === 'document') {
          return caches.match('/index.html').then(res => {
            return res || new Response(
              '<h1>오프라인 상태입니다</h1><p>인터넷 연결을 확인해주세요.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        }
        return new Response('리소스를 로드할 수 없습니다.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// 백그라운드 동기화 (선택사항)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      fetch('https://hello-world.a28008005.workers.dev/api/health')
        .then(response => console.log('[SW] Sync successful:', response.status))
        .catch(err => console.log('[SW] Sync failed:', err))
    );
  }
});

// 푸시 알림 수신 (선택사항)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.message || '고래영어에서 알림이 있습니다.',
    icon: '/img/icon-192.png',
    badge: '/img/icon-96.png',
    tag: data.tag || 'notification',
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '고래영어 대시보드', options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
