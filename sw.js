// TIMES INC — Service Worker v2.0
// Notificaciones push al móvil aunque la app esté cerrada

const CACHE = 'times-inc-v2';
let _pushUser = null; // {empId, dbUrl}
let _pollTimer = null;
let _lastSeenNotiId = null;

// ── Instalación ──────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  // Recuperar usuario del caché si existe
  restoreUserFromCache();
  // Empezar polling si ya había usuario registrado
  if(_pushUser) startPolling();
});

// ── Mensajes desde la app ─────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SET_USER') {
    _pushUser = { empId: data.empId, dbUrl: data.dbUrl };
    // Guardar en cache para persistir entre reinicios del SW
    saveUserToCache(_pushUser);
    startPolling();
    event.source && event.source.postMessage({ type: 'ACK', message: 'Push registrado para ' + data.empId });
  }

  if (data.type === 'CLEAR_USER') {
    _pushUser = null;
    stopPolling();
    clearUserCache();
  }

  if (data.type === 'MARK_SEEN') {
    _lastSeenNotiId = data.lastId;
  }
});

// ── Polling de notificaciones ─────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  if (!_pushUser) return;
  // Primera comprobación a los 5 segundos
  setTimeout(checkNotifications, 5000);
  // Luego cada 90 segundos
  _pollTimer = setInterval(checkNotifications, 90000);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

async function checkNotifications() {
  if (!_pushUser || !_pushUser.dbUrl || !_pushUser.empId) return;

  try {
    const url = _pushUser.dbUrl + '.json?orderBy="target"&equalTo="emp:' + _pushUser.empId + '"';
    // Firebase REST API con shallow=true para rendimiento
    const res = await fetch(_pushUser.dbUrl + '/notis.json', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) return;
    const notisObj = await res.json();
    if (!notisObj) return;

    const target = 'emp:' + _pushUser.empId;
    const notis = Object.values(notisObj)
      .filter(n => n.target === target && !n.leido && n.push)
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

    if (!notis.length) return;

    // Solo mostrar las nuevas (posteriores a la última vista)
    const nuevas = _lastSeenNotiId
      ? notis.filter(n => n.id > _lastSeenNotiId && n.fecha > (_lastSeenTs || ''))
      : notis.slice(-3); // Máximo 3 al inicio para no spamear

    for (const n of nuevas) {
      await showPushNotification(n.titulo || 'TIMES INC', n.texto || '', n.tipo || 'info');
      _lastSeenNotiId = n.id;
      _lastSeenTs = n.fecha;
    }

    // ¿Hay clientes activos? Si los hay, enviarles el mensaje también
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.length > 0 && nuevas.length > 0) {
      nuevas.forEach(n => {
        allClients.forEach(client => client.postMessage({
          type: 'NOTIFICATION',
          title: n.titulo,
          body: n.texto,
          notiType: n.tipo
        }));
      });
    }
  } catch (err) {
    // Falla silenciosamente — no interrumpir el SW
  }
}

async function showPushNotification(title, body, tipo) {
  const iconMap = { vac: '/icon.png', med: '/icon.png', nom: '/icon.png', msg: '/icon.png' };
  await self.registration.showNotification('TIMES INC · ' + title, {
    body: body,
    icon: iconMap[tipo] || '/icon.png',
    badge: '/icon.png',
    tag: 'times-inc-' + tipo + '-' + Date.now(),
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url: '/' }
  });
}

// ── Click en notificación ────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Fetch: network-first (sin interceptar Firebase para no bloquear) ─────────
self.addEventListener('fetch', e => {
  // No interceptar llamadas a Firebase (evitar el bug de conexión)
  if (e.request.url.includes('firebasedatabase.app')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(r => r || new Response('', { status: 408 }))
    )
  );
});

// ── Persistencia del usuario en Cache API ────────────────────────────────────
async function saveUserToCache(user) {
  try {
    const cache = await caches.open(CACHE);
    const resp = new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
    await cache.put('/_sw_user', resp);
  } catch (ex) {}
}

async function restoreUserFromCache() {
  try {
    const cache = await caches.open(CACHE);
    const resp = await cache.match('/_sw_user');
    if (resp) {
      _pushUser = await resp.json();
    }
  } catch (ex) {}
}

async function clearUserCache() {
  try {
    const cache = await caches.open(CACHE);
    await cache.delete('/_sw_user');
  } catch (ex) {}
}
