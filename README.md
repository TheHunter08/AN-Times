# TIMES INC — Control horario laboral

PWA de control horario y gestión de equipos construida con React 18, Vite,
Zustand y Supabase. Incluye fichaje offline, sincronización en tiempo real,
vacaciones, gastos, turnos, documentos y firmas, cierres mensuales, informes,
notificaciones push y panel operativo por roles.

## Desarrollo

Requiere Node.js 24.

```bash
npm ci
npm run dev
```

La configuración local parte de `.env.example`. No se debe versionar ningún
archivo `.env` con credenciales reales.

## Verificación

```bash
npm run verify:deploy
npm run test:e2e
npm run verify:backup-restore
```

`verify:deploy` ejecuta TypeScript, build de producción, pruebas unitarias y
control de tamaño del bundle/PWA. El build de Vercel usa el mismo comando.
La suite E2E cubre escritorio, Android, una emulación WebKit de iPhone y un
arranque PWA realmente offline. `verify:backup-restore` descarga la copia más
reciente del bucket privado y materializa un plan de recuperación en memoria,
sin escribir en producción.

## Arquitectura activa

- `src/App.jsx`: sesión, PWA, sincronización y navegación profunda.
- `src/pages/EmployeePage.jsx` y `src/ui-v2/pages/Employee*.tsx`: portal del empleado.
- `src/ui-v2/AppV2Admin.tsx`: panel de administración activo.
- `src/store/appStore.js`: estado global y único punto de mutación de `db`.
- `src/services/dataServiceV2.js`: sincronización Supabase con respaldo del blob.
- `src/pwa/sw.js`: caché offline, push y sincronización en segundo plano.
- `api/`: automatizaciones y endpoints desplegados como funciones de Vercel.
- `supabase/`: esquema, migraciones y políticas de seguridad.

La aplicación está en migración gradual de `app_data` a tablas normalizadas.
No se deben activar las políticas Auth de `supabase/policies_auth.sql` hasta que
el Centro operativo indique que la vinculación y la paridad sostenida están listas.

## Acceso

- Empleados: PIN local seguro o cuenta Supabase Auth por email y contraseña.
- Administración: cuenta Auth autorizada mediante el perfil o
  `db.config.adminEmails`.
- El acceso PIN funciona offline y no crea una sesión JWT de Supabase.

## Producción

La rama `main` se despliega en Vercel y ejecuta `npm run verify:deploy` antes de
publicar. Las variables obligatorias y opcionales están documentadas en
`.env.example`. El procedimiento de migración y operación está en
`docs/OPERATIONS-ROLLOUT.md`.

Aplicación: [times-inc.vercel.app](https://times-inc.vercel.app)

El endpoint público `/api/health` solo expone estado técnico redactado (sin
credenciales ni datos personales). Devuelve HTTP 503 si Supabase no responde,
la estructura principal no es restaurable o una automatización está atrasada;
el workflow operativo lo comprueba cada 30 minutos.

## Instalar como PWA

- iOS/iPadOS: Safari → Compartir → Añadir a pantalla de inicio.
- Android: Chrome → Instalar aplicación.
- Escritorio compatible: usar el icono de instalación del navegador.

Una vez instalada, el menú del icono ofrece accesos directos a Jornada,
Vacaciones, Mensajes y Pendientes.
