// Servicio unificado de notificaciones push.
// - En iOS/Android (Capacitor): usa PushNotifications nativo via FCM/APNs
// - En PWA/web: usa la API Notification + service worker existente
//
// Uso:
//   import { requestPushPermission, onPushReceived, onPushTapped } from './nativeNotifications'
//   const token = await requestPushPermission()

let _isNative = false
let _PushNotifications = null

async function loadCapacitor() {
  if (_PushNotifications !== null) return _PushNotifications
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const mod = await import('@capacitor/push-notifications')
      _PushNotifications = mod.PushNotifications
      _isNative = true
    }
  } catch {
    // No estamos en Capacitor — modo web
  }
  _PushNotifications = _PushNotifications || false
  return _PushNotifications
}

// Devuelve true si corre en iOS/Android via Capacitor
export async function isNativePlatform() {
  await loadCapacitor()
  return _isNative
}

// Solicita permiso y devuelve el token de registro FCM/APNs (nativo)
// o el endpoint de web push (PWA). Devuelve null si denegado.
export async function requestPushPermission() {
  const Push = await loadCapacitor()

  if (Push) {
    // ── NATIVO (Capacitor) ──────────────────────────────────────────────────
    const { receive } = await Push.checkPermissions()
    let perm = receive

    if (perm === 'prompt' || perm === 'prompt-with-rationale') {
      const result = await Push.requestPermissions()
      perm = result.receive
    }
    if (perm !== 'granted') return null

    return new Promise((resolve) => {
      Push.addListener('registration', (token) => {
        resolve(token.value)
      })
      Push.addListener('registrationError', () => {
        resolve(null)
      })
      Push.register()
    })
  }

  // ── WEB / PWA ──────────────────────────────────────────────────────────────
  if (!('Notification' in window)) return null
  const perm = await Notification.requestPermission()
  return perm === 'granted' ? 'web' : null
}

// Registra un listener para notificaciones recibidas en primer plano (nativo)
export async function onPushReceived(callback) {
  const Push = await loadCapacitor()
  if (!Push) return () => {}
  const handle = await Push.addListener('pushNotificationReceived', (notification) => {
    callback({
      title: notification.title,
      body: notification.body,
      data: notification.data,
    })
  })
  return () => handle.remove()
}

// Registra un listener para cuando el usuario toca una notificación (nativo)
export async function onPushTapped(callback) {
  const Push = await loadCapacitor()
  if (!Push) return () => {}
  const handle = await Push.addListener('pushNotificationActionPerformed', (action) => {
    callback({
      title: action.notification.title,
      body: action.notification.body,
      data: action.notification.data,
      url: action.notification.data?.url,
    })
  })
  return () => handle.remove()
}

// Muestra una notificación local inmediata (no requiere push del servidor)
export async function showLocalNotification(title, body, data = {}) {
  const Push = await loadCapacitor()
  if (Push) {
    // En Capacitor 5+ las notificaciones locales van por @capacitor/local-notifications
    // Por ahora delegamos al canal de push normal
    return
  }
  // Web: usar Notification API directamente si hay permiso
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.svg', data, tag: data.tag || 'times' })
  }
}
