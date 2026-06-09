// TIMES INC Service Worker v1.0
// Habilita notificaciones push en segundo plano

const CACHE='times-inc-v1';
const OFFLINE_FILES=['/'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(clients.claim());
});

// Manejo de notificaciones push (Firebase Cloud Messaging futuro)
self.addEventListener('push',e=>{
  if(!e.data)return;
  try{
    const data=e.data.json();
    e.waitUntil(self.registration.showNotification(data.title||'TIMES INC',{
      body:data.body||'',
      icon:data.icon||'/icon.png',
      badge:'/icon.png',
      tag:data.tag||'times-inc',
      requireInteraction:false,
      data:{url:data.url||'/'}
    }));
  }catch(err){
    e.waitUntil(self.registration.showNotification('TIMES INC',{body:e.data.text()}));
  }
});

// Al hacer clic en la notificación, abrir/enfocar la app
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const url=e.notification.data&&e.notification.data.url||'/';
    for(const c of cs){if(c.url.includes(self.location.origin)&&'focus' in c)return c.focus();}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});

// Fetch: network-first, fallback to cache
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||caches.match('/')))
  );
});
