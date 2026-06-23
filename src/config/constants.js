// ── Supabase (base de datos principal) ──────────────────────────────────────
// Las credenciales anon son públicas por diseño (la seguridad es via RLS en Supabase).
// Se usan como fallback para no depender de que Vercel tenga las env vars configuradas.
const _DEFAULT_SB_URL  = 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const _DEFAULT_SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
export const SB_URL  = import.meta.env.VITE_SB_URL  || _DEFAULT_SB_URL
export const SB_ANON = import.meta.env.VITE_SB_ANON || _DEFAULT_SB_ANON

// ── Admin PIN — se genera un PIN temporal si no está configurado ──────────────
function initAdminPin() {
  if (import.meta.env.VITE_ADMIN_PIN) return import.meta.env.VITE_ADMIN_PIN
  try {
    const stored = localStorage.getItem('__admin_pin_fb__')
    if (stored) return stored
    const generated = Math.floor(1000 + Math.random() * 9000).toString()
    localStorage.setItem('__admin_pin_fb__', generated)
    localStorage.setItem('__admin_pin_fb_new__', '1')
    return generated
  } catch { return '0000' }
}
export const ADMIN_PIN = initAdminPin()

// VAPID: saneamos espacios, normalizamos a base64url y validamos
// que tenga formato correcto. Si la env var llega malformada (whitespace,
// comillas, padding incorrecto), caemos al fallback hardcoded.
const _VAPID_FALLBACK = 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'
const _sanitizeVapid = (s) => (s || '')
  .replace(/\s+/g, '')          // quita espacios/newlines/tabs
  .replace(/^["']|["']$/g, '')  // quita comillas envolventes
  .replace(/\+/g, '-')          // normaliza a base64url
  .replace(/\//g, '_')
  .replace(/=+$/, '')           // quita padding
const _isValidVapid = (s) => /^[A-Za-z0-9_-]{86,90}$/.test(s)
const _candidate = _sanitizeVapid(import.meta.env.VITE_VAPID_PUB)
export const VAPID_PUB = _isValidVapid(_candidate) ? _candidate : _VAPID_FALLBACK

export const WK = 40 * 60   // weekly minutes norm
export const WD = 8 * 60    // daily minutes norm
export const WM = 160 * 60  // monthly minutes norm
export const VPM = 2.5      // vacation days per month

// Festivos Comunidad de Madrid — 2026 + 2027
export const FESTIVOS_MADRID = {
  // 2026
  '2026-01-01': 'Año Nuevo',
  '2026-01-06': 'Reyes Magos',
  '2026-04-02': 'Jueves Santo',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-05-02': 'Comunidad de Madrid',
  '2026-05-15': 'San Isidro',
  '2026-08-15': 'Asunción de la Virgen',
  '2026-10-12': 'Fiesta Nacional de España',
  '2026-11-02': 'Todos los Santos',
  '2026-11-09': 'La Almudena',
  '2026-12-07': 'Día de la Constitución',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  // 2027
  '2027-01-01': 'Año Nuevo',
  '2027-01-06': 'Reyes Magos',
  '2027-03-25': 'Jueves Santo',
  '2027-03-26': 'Viernes Santo',
  '2027-05-01': 'Día del Trabajo',
  '2027-05-03': 'Comunidad de Madrid',
  '2027-05-14': 'San Isidro',
  '2027-08-16': 'Asunción de la Virgen',
  '2027-10-12': 'Fiesta Nacional de España',
  '2027-11-01': 'Todos los Santos',
  '2027-11-09': 'La Almudena',
  '2027-12-06': 'Día de la Constitución',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
}
// Alias para compatibilidad con importaciones existentes
export const FESTIVOS_MADRID_2026 = FESTIVOS_MADRID

export const INITIAL_DB = {
  empresas: ['Soluciones Mata'],
  obras: ['Soluciones Mata'],
  centrosTrabajo: ['Obra Principal', 'Oficina Central', 'Almacén'],
  employees: [
    { id: 'admin', name: 'Administrador', empresa: 'Soluciones Mata', pin: ADMIN_PIN, color: '#5aa9e6', initials: 'AD', startDate: '2024-01-01', email: '', isAdmin: true },
    { id: 'e1', name: 'Ismael Angeles de la Cruz', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', pin: '1111', color: '#6366f1', initials: 'IA', startDate: '2024-01-01', email: '', role: 'encargado', obrasAsignadas: ['Soluciones Mata'] },
    { id: 'e2', name: 'Franklin Lisandro Nuñez Roque', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', pin: '2222', color: '#10b981', initials: 'FL', startDate: '2024-01-01', email: '', role: 'empleado', obrasAsignadas: [] }
  ],
  records: [],
  vacaciones: [],
  medicos: [],
  ausencias: [],
  mensajes: [],
  notis: [],
  cierres: [],
  monthSnapshots: {},
  firmas: {},
  documentos: [],
  audit: [],
  correccionesFichaje: [],
  chats: [],
  notisSent: {},
  config: {},
  _ts: 0
}
