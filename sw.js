// TIMES INC — Service Worker v5
const CACHE = 'times-v5';
const STATIC = ['./icon.svg', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC.map(a => new Request(a, {cache: 'reload'}))))
      .catch(() => {})
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
  const url = e.request.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // Firebase, fonts y CDN → siempre red
  if (url.includes('firebase') || url.includes('fonts.googleapis') || url.includes('gstatic')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // index.html y raíz → network-first (siempre versión más reciente)
  if (url.endsWith('/') || url.includes('index.html') || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(new Request(e.request, {cache: 'no-store'}))
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto (iconos, manifest) → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// Forzar activación inmediata cuando la página lo pide
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
