# AGENTS — Times INC

Control horario laboral (PWA). Contexto para un agente que retoma el proyecto sin
historial de conversación previo. `README.md` está **desactualizado** (describe una
versión antigua basada en Firebase) — no te fíes de él, usa este archivo.

## Regla de alcance (hereda de CLAUDE.md)

> Implement UI only. Preserve backend, Supabase, auth and business logic.

En la práctica: cambios visuales/UX son terreno libre. Tocar la capa de datos
(`src/services/*`, `src/store/appStore.js`, esquema de Supabase) solo cuando el
usuario reporta un bug de comportamiento visible (p. ej. "los datos vuelven al
estado anterior") — eso sí es "preservar" la lógica: arreglarla cuando está rota,
no rediseñarla.

## Stack real

- React 18 + Vite, PWA vía `vite-plugin-pwa` (`injectManifest`, service worker en
  `src/pwa/sw.js`).
- Mezcla JSX (UI clásica) + TSX (`ui-v2`). Zustand para estado global.
- **Supabase** (Postgres + Realtime), no Firebase pese a lo que diga `README.md`.
- Dev: `npm run dev`, o los presets `.claude/launch.json` ("Times INC" / "Times INC
  v5 Preview"). Build: `npx vite build`. `npx tsc --noEmit` reporta decenas de
  errores preexistentes en `ui-v2/*.tsx` no relacionados con tus cambios — usa
  `vite build` como fuente de verdad de "compila", no tsc.

## Dos capas de UI conviviendo

1. **UI clásica** (`src/pages/EmployeePage.jsx`, activa) — pantalla de empleado.
   Estilos: `src/styles/globals.css` (variables base) + `src/styles/v5.css`
   (capa de override, carga DESPUÉS de globals.css, usa selectores por ID
   `#sEmp`/`#sAdmin`/`#sLogin` + `!important` para ganar especificidad).
2. **`ui-v2/`** (`src/ui-v2/AppV2Admin.tsx`) — panel admin, es lo único que se
   renderiza para `currentScreen === 'admin'`. `src/pages/AdminPage.jsx` y
   `src/pages/admin/Panel*.jsx` son **código muerto** (no importados desde
   ningún sitio) — no perder tiempo depurándolos pensando que están vivos.

### Sistema de temas (gotcha importante)

- `ui-v2/design-system/colors.ts` exporta un objeto `colors` cuyos valores son
  `var(--uiv2-*)` (no hex fijos) — backed por `ui-v2/design-system/theme.css`,
  que define el set oscuro (`:root`) y el claro (`:root[data-theme="light"]`).
  Así los ~80 archivos que hacen `colors.bg[600]` reaccionan al tema sin tocar
  cada uno.
- Toggle: `document.documentElement` recibe `data-theme="light"` (ausente =
  oscuro). Se cambia con `toggleTheme()` en `src/utils/userConfig.js`,
  persistido en `localStorage['theme']`.
- **Trampa real ya pisada**: `v5.css` carga después de `globals.css` y usa
  `!important` con selectores de ID. Si añades una regla `[data-theme="light"]`
  en `globals.css` SIN `!important`, una regla oscura con `!important` en
  `v5.css` la gana igual y el elemento nunca cambia de tema. Comprueba
  siempre si existe una contraparte en `v5.css` antes de asumir que tu regla
  de tema claro funciona.

### Decisiones de diseño ya zanjadas (no las relitigues)

- Fondo con degradado azul→negro + quitar el toggle claro/oscuro: **probado y
  rechazado explícitamente** por el usuario ("es mejor el negro", "que vuelva
  modo black y blanco") — revertido. Estado actual: fondo negro plano, toggle
  claro/oscuro presente y debe seguir funcionando.
- Color de marca: violeta (`--primary: #7C3AED`) dominante, azul (`--accent:
  #3B82F6`) secundario, en la UI clásica (`globals.css`/`v5.css`) — revertido
  a esto tras un intento de invertirlo. **Inconsistencia pendiente conocida**:
  `ui-v2/design-system/theme.css` NUNCA se revirtió y sigue con azul
  (`#3B82F6`) como `--uiv2-primary-base` — el panel admin (ui-v2) y la UI
  clásica tienen marcas de color distintas ahora mismo. No armonizar sin
  confirmar con el usuario qué color quiere en cuál.
- El saludo ("Buenas noches, Nombre") debe aparecer **solo** en el cuerpo
  (cabecera de `EmployeeHome.tsx`), nunca en el topbar — hubo duplicado, ya
  corregido.

## Capa de datos — la parte más delicada

- `src/store/appStore.js`: Zustand. `db` es el blob completo de la app
  (`records`, `employees`, `vacaciones`, `gastos`, `cierres`, `obras`, ...).
  **`saveDB(partialOrFn)` es la única forma de mutar `db`** — calcula qué se
  borró (tombstones), aplica el cambio local al instante (optimista), y lanza
  `cloudPush()` en segundo plano.
- `src/services/dataService.js` (V1, blob JSON) + `dataServiceV2.js` (V2,
  reexporta casi todo de V1 pero sobreescribe `cloudFetch`/`cloudPush` para
  además escribir en tablas reales de Supabase).

### Gotcha #1 — `_upd` es obligatorio en cada mutación

Cualquier mutación de `records`/`vacaciones`/`gastos` debe incluir
`_upd: new Date().toISOString()`. `_mergeRecords` / `_unionById` (en
`dataService.js`) usan `_upd` para decidir qué versión "gana" al fusionar con
datos del servidor (llegan por realtime o polling). Sin `_upd`, un cambio
local recién hecho puede ser pisado en silencio por el próximo fetch — así se
manifestó un bug real ("las horas validadas por el admin volvían a pendiente").

### Gotcha #2 — un upsert por lotes puede perder cambios válidos

`_syncToTables` (`dataServiceV2.js`) sube varias filas en un único
`.upsert()`. Si UNA fila tiene datos inválidos (p. ej. FK a un empleado
borrado), Postgres rechaza el lote **entero** y se pierden en silencio los
demás cambios del mismo lote, aunque fueran válidos. Ya se arregló con un
helper `_upsertResilient()` que reintenta fila a fila si el lote falla —
replica ese patrón en cualquier escritura por lotes nueva.

### Gotcha #3 — filtro de "recencia" de 48h en `records`

`_syncToTables` solo re-sincroniza fichajes abiertos o con `_upd` de menos de
48h (asume que los históricos no cambian). Si tu código edita un fichaje
cerrado antiguo, tiene que refrescar `_upd` a "ahora" o el cambio nunca
llegará a Supabase.

## Supabase

- `supabase/schema.sql` — esquema de tablas reales (V2).
- `supabase/policies.sql` — políticas activas actualmente: permisivas con
  anon key (Fase 1, misma seguridad que el blob).
- `supabase/policies_auth.sql` — políticas basadas en Supabase Auth, **no
  activadas todavía** (requiere poblar `auth_id` primero). No asumir que están
  en efecto.
- `supabase/rls.sql`, `supabase/realtime.sql` — RLS de la tabla blob legacy y
  configuración de replication para postgres_changes.

## Limpieza pendiente (no tocar sin que lo pidan)

Hay varios directorios `.claude/worktrees/*` en el repo (worktrees de sesiones
anteriores de Claude Code) que probablemente puedan borrarse, pero no se han
tocado — confirmar con el usuario antes de eliminarlos.
