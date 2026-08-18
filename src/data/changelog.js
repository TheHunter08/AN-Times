// Historial de cambios de la app, mostrado en Perfil → Actualizaciones.
// Entradas manuales, más reciente primero. Cada entrada va atada a la
// versión de package.json vigente en ese momento — bumpea la versión (y
// añade una entrada aquí) cuando publiques cambios que el usuario deba notar.
export const APP_CHANGELOG = [
  {
    version: '4.6.14',
    date: '2026-08-18',
    title: 'Encargados y jefes de obra vuelven a ver a todo su equipo',
    items: [
      'Cuando un encargado tenía centro de trabajo y obras asignadas a la vez, solo veía a los empleados que coincidían en las DOS cosas — alguien asignado únicamente por obra (con otro centro) o únicamente por centro (con otra obra) desaparecía de su lista, aunque fuera parte real de su equipo. Ahora basta con coincidir en cualquiera de las dos.',
      'Un jefe de obra que en algún momento fue encargado podía quedar igualmente restringido por un dato antiguo que nunca se limpió al ascenderlo. Ahora un jefe de obra nunca queda restringido, sin importar ese dato heredado.',
    ],
  },
  {
    version: '4.6.13',
    date: '2026-08-18',
    title: 'Corrige avisos incorrectos de jornadas pendientes de validar',
    items: [
      'Al arreglar el consumo de datos, el aviso de "jornadas pendientes de validar" y la comprobación de convenio (máximo 9h/día) se quedaron sin poder distinguir una jornada ya validada de una pendiente — avisaban de todas las jornadas cerradas recientes por igual, incluso las ya revisadas, y no restaban los descansos al calcular las 9h.',
      'También se corrige que una jornada cerrada hacía más de una semana sin validar dejaba de recordarse solo por su antigüedad; ahora se sigue avisando mientras siga sin validar, sin importar cuánto tiempo lleve pendiente.',
    ],
  },
  {
    version: '4.6.12',
    date: '2026-08-18',
    title: 'El recordatorio de fichaje ya no avisa a quien está de vacaciones',
    items: [
      'El aviso "¿Has fichado hoy?" (por push del servidor y también dentro de la propia app) no comprobaba si el empleado tenía vacaciones, baja médica o una ausencia aprobada cubriendo el día — así que llegaba igualmente aunque no le tocara trabajar.',
      'Ahora ambos avisos comprueban antes si el día está justificado y, si lo está, no se envía nada.',
    ],
  },
  {
    version: '4.6.11',
    date: '2026-08-18',
    title: 'Corrige la causa de fondo del consumo excesivo de datos',
    items: [
      'El arreglo anterior (4.6.10) solo paraba el pico de un día. La causa de fondo venía de antes: los avisos automáticos de fichaje, el cierre de jornadas de más de 10h y la comprobación de que la app sigue viva descargaban y volvían a subir la copia completa de todos los datos de la empresa cada 30 minutos, 48 veces al día, aunque solo necesitaran un dato pequeño (la configuración o el registro de la última ejecución).',
      'Ahora esas tres tareas usan directamente el dato pequeño que necesitan, sin tocar la copia completa — se elimina la mayor parte del consumo diario de fondo, no solo el pico puntual.',
    ],
  },
  {
    version: '4.6.10',
    date: '2026-08-18',
    title: 'Corrige un consumo excesivo de datos en Supabase',
    items: [
      'El arreglo del recordatorio de fichaje de hoy mismo traía sin darse cuenta el histórico completo de fichajes de la empresa en cada ejecución del aviso (cada 30 minutos) — llegó a consumir en un día casi toda la cuota mensual gratuita de Supabase.',
      'Ahora solo trae los fichajes abiertos y los de los últimos 7 días, que es todo lo que necesita para funcionar.',
    ],
  },
  {
    version: '4.6.9',
    date: '2026-08-18',
    title: 'El recordatorio de fichaje ya no llega si ya habías fichado',
    items: [
      'El aviso "¿Has fichado hoy?" comprobaba contra una copia antigua de los datos que no se actualiza al instante — así que a veces llegaba aunque ya hubieras iniciado la jornada, sobre todo poco después de fichar.',
      'Ahora comprueba directamente contra la tabla real de fichajes, igual que el autocierre de jornadas.',
    ],
  },
  {
    version: '4.6.8',
    date: '2026-08-16',
    title: 'Nuevo rol: Auditor de solo lectura para inspecciones',
    items: [
      'Se añade el rol "Auditor", pensado para una inspección de Trabajo y Seguridad Social: entra directo al Paquete de inspección (fichajes, incidencias, hashes de integridad) y no puede editar nada — ni fichajes, ni vacaciones, ni empleados.',
      'Se puede crear desde Empleados → Nueva persona, eligiendo el rol "Auditor (solo lectura)".',
      'Preparado también para cuando se active Auth/RLS: el auditor solo tendrá permiso de lectura en base de datos, nunca de escritura.',
    ],
  },
  {
    version: '4.6.7',
    date: '2026-08-12',
    title: 'El autocierre de jornadas de más de 10h vuelve a funcionar',
    items: [
      'El aviso automático que cierra una jornada tras 10 horas sin fichar salida comprobaba las jornadas abiertas contra una copia antigua de los datos que ya no se mantiene al día — precisamente los fichajes de empleados con cobertura débil, los que más tardan en cerrar, eran los que menos se veían reflejados ahí.',
      'Ahora comprueba directamente contra los fichajes reales del servidor, así que ninguna jornada abierta se le escapa sin importar la cobertura de quien la inició.',
    ],
  },
  {
    version: '4.6.6',
    date: '2026-08-12',
    title: 'Los fichajes con muchos días sin cobertura ya no se pierden',
    items: [
      'Un fichaje cerrado que llevaba más de 48 horas sin poder subir (varios días sin cobertura en la obra) se descartaba en silencio la próxima vez que la cola offline lo reintentaba: la app lo marcaba como sincronizado sin haber llegado nunca a Supabase.',
      'Ahora, si el dispositivo ya sabe que ese fichaje concreto está pendiente de subir, lo sube sin importar cuánto tiempo lleve esperando cobertura.',
    ],
  },
  {
    version: '4.6.5',
    date: '2026-08-12',
    title: 'Activar la cuenta ya no falla con "ese correo ya tiene una cuenta"',
    items: [
      'Un empleado que ya hubiera intentado activar su cuenta con el sistema antiguo (retirado esta semana) se quedaba con una cuenta de acceso a medio crear. Al intentarlo de nuevo con el PIN, el servidor rechazaba la activación con "Ese correo ya tiene una cuenta" y no dejaba avanzar.',
      'Ahora, si el PIN ya se verificó y el correo no pertenece a ningún otro compañero, el servidor recupera esa cuenta a medio crear en vez de bloquear la activación.',
    ],
  },
  {
    version: '4.6.4',
    date: '2026-08-12',
    title: 'La pantalla de activación ya no promete un correo que no llega',
    items: [
      'Al activar la cuenta con el PIN, el mensaje decía "Supabase enviará un enlace para verificar tu correo" — pero la cuenta se activa al instante y ese correo nunca se envía. El empleado se quedaba esperando una confirmación que no iba a llegar.',
      'Se ha corregido el texto en las dos pantallas de activación (obligatoria tras el PIN, y la de "Primera vez: vincular mi cuenta") para explicar que la cuenta queda activa al guardar la contraseña, sin ningún correo que confirmar.',
    ],
  },
  {
    version: '4.6.3',
    date: '2026-08-12',
    title: 'La recuperación de cuenta ya no se queda colgada',
    items: [
      'Al recuperar el acceso con contraseña y PIN (cuenta vinculada a un correo antiguo, o vinculada a otro perfil dado de baja), la pantalla podía quedarse en "Entrando…" sin mostrar el paso siguiente si el cierre de sesión de limpieza tardaba en responder.',
      'Ese cierre de sesión ya no bloquea el aviso: el mensaje para introducir el PIN de recuperación aparece de inmediato, y la limpieza de la sesión anterior sigue en segundo plano.',
    ],
  },
  {
    version: '4.6.2',
    date: '2026-08-12',
    title: 'Un solo paso para activar la cuenta',
    items: [
      'Había dos pantallas distintas pidiendo "activa tu cuenta": una en el inicio de sesión (verificada en el servidor) y otra, redundante, después de entrar con PIN. Podían pedir la contraseña o el PIN dos veces y dar mensajes de error distintos para el mismo problema.',
      'Ahora solo existe la del inicio de sesión. Es la más segura de las dos (comprueba el PIN en el servidor y crea la cuenta al instante, sin esperar un correo de confirmación), así que se ha quitado el paso duplicado.',
    ],
  },
  {
    version: '4.6.1',
    date: '2026-08-12',
    title: 'Menos errores al vincular la cuenta',
    items: [
      'En el paso "Vincula tu cuenta", la contraseña y el PIN se escribían siempre ocultos con puntos, sin poder comprobar lo que se había tecleado — fácil equivocarse sin darse cuenta y que saliera "PIN incorrecto" o "contraseña no válida" por un error de escritura, no por el dato en sí.',
      'Ahora hay una casilla "Mostrar lo que he escrito" para verlo en claro antes de enviarlo, y el requisito de la contraseña (mínimo 8 caracteres) se ve desde el principio, no solo cuando falla.',
    ],
  },
  {
    version: '4.6.0',
    date: '2026-08-12',
    title: 'Migración segura de cuentas, documentos y datos',
    items: [
      'La activación de cuenta es obligatoria: cada persona vincula su ficha usando su PIN, un correo propio y una contraseña personal antes de poder continuar.',
      'Las cuentas se crean o recuperan en Supabase Auth y quedan enlazadas a la ficha real del empleado, sin contraseñas compartidas ni accesos administrativos heredados.',
      'Los documentos firmados guardan el PDF con la firma incrustada y huellas de integridad; el jefe de obra puede abrir los documentos firmados que están dentro de su ámbito.',
      'Los documentos históricos incompletos se mantienen pendientes para una reparación y firma expresa, sin reutilizar silenciosamente una firma antigua.',
      'Administración identifica las firmas históricas sin PDF final y puede pedir al empleado una nueva firma desde la propia tarjeta del documento.',
      'La aplicación mantiene datos en tablas normalizadas con sincronización resistente a filas inválidas, borrados auditados y protección frente a cambios que vuelven atrás.',
      'El Centro operativo muestra activaciones, firmas, dispositivos, paridad y requisitos pendientes antes de habilitar la seguridad RLS definitiva.',
      'La transición Auth/RLS permanece protegida hasta completar siete comprobaciones diarias reales y todas las activaciones personales, evitando dejar empleados fuera.',
      'El contador de comprobaciones usa la fecha de Europe/Madrid para no perder ni duplicar días alrededor de medianoche.',
      'La pantalla Actualizaciones compara la versión instalada con la publicada en producción y muestra el identificador del despliegue para detectar cachés antiguas.',
    ],
  },
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
