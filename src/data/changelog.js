// Historial de cambios de la app, mostrado en Perfil → Actualizaciones.
// Entradas manuales, más reciente primero. Cada entrada va atada a la
// versión de package.json vigente en ese momento — bumpea la versión (y
// añade una entrada aquí) cuando publiques cambios que el usuario deba notar.
export const APP_CHANGELOG = [
  {
    version: '4.3.2',
    date: '2026-08-11',
    title: 'Distinguir empleados homónimos en más pantallas',
    items: [
      'Los selectores de empleado en "Subir documento", "Registrar gasto manual" y el filtro de Resumen añaden el centro de trabajo cuando dos empleados tienen exactamente el mismo nombre completo, en vez de mostrar dos opciones idénticas.',
    ],
  },
  {
    version: '4.3.1',
    date: '2026-08-11',
    title: 'Distinguir empleados con el mismo nombre',
    items: [
      'En la pantalla de inicio de sesión, si dos empleados comparten nombre de pila ahora se muestra también la inicial del apellido (y el centro de trabajo si aún así coinciden), en vez de mostrar solo el primer nombre para ambos.',
    ],
  },
  {
    version: '4.3.0',
    date: '2026-08-11',
    title: 'Historial de jornada por mes y scroll en Perfil',
    items: [
      'El historial de jornada ahora muestra solo los días fichados del mes en curso, en vez de una ventana fija de 30 días que mezclaba meses.',
      'Se arregló el scroll en Gastos, Denuncia y Actualizaciones dentro de Perfil, que se quedaba bloqueado en la app instalada.',
      'La versión instalada ahora avanza con cada actualización publicada, para poder comprobar de un vistazo si tienes la última.',
    ],
  },
  {
    version: '4.2.0',
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
    version: '4.2.0',
    date: '2026-08-10',
    title: 'Activación de cuenta más ágil',
    items: [
      'Ya no se repite el asistente completo a quienes ya tienen la firma guardada.',
      'Se quitó el saludo de bienvenida que aparecía repetido en Configuración.',
    ],
  },
  {
    version: '4.1.9',
    date: '2026-08-09',
    title: 'Acciones rápidas y copiloto de jornada',
    items: [
      'Nuevas acciones rápidas seguras desde la app instalada.',
      'Guía más clara para activar el perfil de forma segura.',
      'Copiloto predictivo con sugerencias sobre tu jornada laboral.',
    ],
  },
]
