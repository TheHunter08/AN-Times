// Historial de cambios de la app, mostrado en Perfil → Actualizaciones.
// Entradas manuales, más reciente primero. Añade una entrada nueva arriba
// cuando publiques cambios que el usuario debería notar.
export const APP_CHANGELOG = [
  {
    date: '2026-08-11',
    title: 'Racha mensual y menos avisos vacíos',
    items: [
      'La racha de días fichados se reinicia cada mes en vez de acumularse sin límite.',
      'Menos notificaciones vacías repetidas por la sincronización en segundo plano.',
      'El aviso de requisitos obligatorios ya no parpadea al iniciar sesión.',
      'Ahora se pide un correo personal para activar la cuenta.',
      'La sincronización ya no borra tu firma guardada si el servidor tarda en responder.',
    ],
  },
  {
    date: '2026-08-10',
    title: 'Activación de cuenta más ágil',
    items: [
      'Ya no se repite el asistente completo a quienes ya tienen la firma guardada.',
      'Se quitó el saludo de bienvenida que aparecía repetido en Configuración.',
    ],
  },
  {
    date: '2026-08-09',
    title: 'Acciones rápidas y copiloto de jornada',
    items: [
      'Nuevas acciones rápidas seguras desde la app instalada.',
      'Guía más clara para activar el perfil de forma segura.',
      'Copiloto predictivo con sugerencias sobre tu jornada laboral.',
    ],
  },
]
