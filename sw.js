// TIMES INC — Service Worker v6 — network-first total para HTML
const CACHE = 'times-v6';
const STATIC = ['./icon.svg', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC.map(a => new Request(a, {cache: 'reload'})))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.startsWith('http')) return;

  // Firebase / fonts — siempre red, sin cache
  if (url.includes('firebaseio') || url.includes('googleapis') || url.includes('gstatic')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // HTML / navegación — SIEMPRE red sin cache (nunca servir versión vieja)
  if (e.request.mode === 'navigate' || url.includes('index.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(new Request(url, {cache: 'no-store', headers: {'Cache-Control': 'no-cache'}}))
        .catch(() => caches.match(e.request)) // fallback offline
    );
    return;
  }

  // Iconos y manifest — cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }))
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {title: 'TIMES INC', body: ''};
  e.waitUntil(self.registration.showNotification(d.title || 'TIMES INC', {
    body: d.body || '', icon: './icon.svg', badge: './icon.svg',
    tag: d.tag || 'times', renotify: true
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
