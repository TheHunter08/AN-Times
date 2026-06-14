// TIMES INC — Service Worker v3
const CACHE = 'times-v3';
const ASSETS = ['./', './index.html', './style.css', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, {cache: 'reload'}))))
      .catch(() => {}) // don't fail install if some assets miss
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first for Firebase/CDN, cache first for local assets
  const url = e.request.url;
  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (url.includes('firebase') || url.includes('fonts.googleapis') || url.includes('gstatic')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
  }
});

// ── Push notifications ──
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {title: 'TIMES INC', body: 'Nueva notificación'};
  e.waitUntil(self.registration.showNotification(data.title || 'TIMES INC', {
    body: data.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'times-notif',
    renotify: true,
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});