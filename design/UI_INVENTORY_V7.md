# TIMES INC V7 — inventario de interfaz activa

## Entradas reales

- `src/App.jsx`: selecciona login, empleado y administrador.
- `src/ui-v2/LoginV2.tsx` + `src/ui-v2/pages/Login.tsx`: login activo PIN/email.
- `src/pages/EmployeePage.jsx`: shell y navegación activa del empleado.
- `src/ui-v2/AppV2Admin.tsx`: composición y navegación activa del administrador.

## Empleado

- Inicio: `ui-v2/pages/EmployeeHome.tsx` (fichaje, progreso, semana, timeline).
- Jornada: `components/employee/TabJornada.jsx`.
- Vacaciones: `components/employee/TabVacaciones.jsx`.
- Calendario: `components/employee/TabCalendario.jsx`.
- Mensajes: `components/employee/TabMensajes.jsx`.
- Turnos: `components/TabTurnos.jsx`.
- Perfil: `components/employee/TabPerfil.jsx`.
- Navegación: sidebar desktop y bottom navigation móvil en `EmployeePage.jsx`.

## Modales y flujos de empleado

- Centro, QR, notificaciones, vacaciones, firma, IA, información personal,
  documentos, configuración, cierre mensual, chat y corrección en
  `src/components/employee/Modal*.jsx`.
- Flujos críticos preservados: entrada, salida, descanso, GPS, QR, firma,
  vacaciones, documentos, notificaciones, chat y modo offline.

## Administrador

- Dashboard, empleados, fichajes, planning, turnos, validación, solicitudes,
  gastos, documentos, obras, proyectos, cierre mensual, estadísticas,
  informes, anomalías, auditoría, mensajes, notificaciones y ajustes.
- Shell activo: `ui-v2/layout/AppShell.tsx`, `components/Header.tsx` y
  `components/Sidebar.tsx`.
- Datos: hooks `useDashboardData`, `useEmployeesData`, `useTimesheetsData`,
  `useRequestsData`, `useNotificationsData` (solo lectura/presentación).

## Componentes visuales existentes

- Button, Input, Search, Tabs, Badge, Avatar, Card, Modal, Table, Dropdown,
  Accordion, AreaChart, DonutChart, WeekSchedule, PunchPanel y Toast.
- Iconografía centralizada en `ui-v2/components/Icons.tsx`.

## Riesgos visuales detectados

- `globals.css`, `v5.css`, estilos inline y `ui-v2/theme.css` competían en la
  cascada; V7 centraliza tokens y añade una capa final de producción.
- `pages/AdminPage.jsx` y `pages/admin/Panel*.jsx` no son la UI activa.
- `components/employee/TabInicio.jsx` no es el inicio activo: producción usa
  `ui-v2/pages/EmployeeHome.tsx`.
- La preview `uiv2-preview.html` es solo un arnés; no sustituye la app real.
