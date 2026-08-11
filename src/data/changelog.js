// Historial de cambios de la app, mostrado en Perfil → Actualizaciones.
// Entradas manuales, más reciente primero. Cada entrada va atada a la
// versión de package.json vigente en ese momento — bumpea la versión (y
// añade una entrada aquí) cuando publiques cambios que el usuario deba notar.
export const APP_CHANGELOG = [
  {
    version: '4.5.1',
    date: '2026-08-11',
    title: 'La app ya no se queda atascada en una versión vieja',
    items: [
      'Si un dispositivo tenía cambios sin sincronizar, la actualización esperaba a que terminaran de subirse antes de instalarse — sin límite de tiempo. Si esa sincronización nunca se completaba, el dispositivo se quedaba congelado en la versión antigua para siempre, sin ningún aviso.',
      'Ahora, pasados 3 minutos de espera, la actualización se instala de todas formas. Los cambios pendientes no se pierden: se guardan en el propio dispositivo y se siguen reintentando después de actualizar.',
    ],
  },
  {
    version: '4.5.0',
    date: '2026-08-11',
    title: 'Vinculación de cuenta automática y obligatoria',
    items: [
      'El asistente obligatorio de bienvenida añade el paso "Cuenta": tras guardar tu correo, se te pide una contraseña y tu PIN de fichaje para crear y vincular tu cuenta de acceso en el momento, sin tener que cerrar sesión y repetirlo desde el login.',
      'Nadie puede usar la app sin completar este paso — se suma a correo, notificaciones y firma como requisito obligatorio, igual que los demás.',
      'El PIN sigue siendo obligatorio como prueba de identidad: solo quien conoce tu PIN puede vincular tu cuenta, para que nadie pueda suplantarte usando solo tu correo.',
    ],
  },
  {
    version: '4.4.0',
    date: '2026-08-11',
    title: 'Ficha del empleado, buscador de login y huella/Face ID',
    items: [
      'El campo "Obra" en Información personal mostraba el nombre de la empresa en vez de la obra asignada — ya muestra la obra real.',
      'En el inicio de sesión, el buscador de empleado no dejaba borrar lo escrito con retroceso — se capturaba como borrado de PIN por error.',
      'Se restaura desde Configuración la opción para activar el acceso con huella o Face ID, que existía por dentro pero no tenía botón en ningún sitio.',
    ],
  },
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
