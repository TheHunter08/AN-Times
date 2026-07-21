export function getNotificationPermissionGuide(userAgent = '', standalone = false) {
  const ua = String(userAgent).toLowerCase()
  const ios = /iphone|ipad|ipod/.test(ua)
  const android = /android/.test(ua)

  if (ios) {
    return {
      platform: 'ios',
      title: standalone ? 'Permite avisos para TIMES INC' : 'Instala TIMES INC antes de activar los avisos',
      steps: standalone
        ? ['Abre Ajustes del iPhone', 'Entra en Notificaciones > TIMES INC', 'Activa “Permitir notificaciones” y vuelve a la app']
        : ['Abre esta página en Safari', 'Pulsa Compartir > Añadir a pantalla de inicio', 'Abre TIMES INC instalada y activa los avisos'],
    }
  }
  if (android) {
    return {
      platform: 'android',
      title: 'Permite avisos para TIMES INC',
      steps: ['Mantén pulsado el icono de TIMES INC', 'Entra en Información de la aplicación > Notificaciones', 'Activa los avisos y vuelve a TIMES INC'],
    }
  }
  return {
    platform: 'desktop',
    title: 'Permite avisos en el navegador',
    steps: ['Pulsa el icono de permisos junto a la dirección web', 'Cambia Notificaciones a “Permitir”', 'Recarga TIMES INC y pulsa Comprobar'],
  }
}

export function notificationGuideText(guide) {
  return guide.steps.map((step, index) => `${index + 1}. ${step}`).join(' · ')
}
