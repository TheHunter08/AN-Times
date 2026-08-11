// ── Supabase (base de datos principal) ──────────────────────────────────────
// Las credenciales anon son públicas por diseño (la seguridad es via RLS en Supabase).
// Se usan como fallback para no depender de que Vercel tenga las env vars configuradas.
const _DEFAULT_SB_URL  = 'https://eyyhlcvpyiorpdnvqsll.supabase.co'
const _DEFAULT_SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eWhsY3ZweWlvcnBkbnZxc2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTc5MzIsImV4cCI6MjA5NzU3MzkzMn0.UTQnmQGtTehAhfz93uw3KpXOVjR5IC97HKt1SOrg51I'
export const SB_URL  = import.meta.env.VITE_SB_URL  || _DEFAULT_SB_URL
export const SB_ANON = import.meta.env.VITE_SB_ANON || _DEFAULT_SB_ANON

// Limpia restos del sistema de PIN de admin legacy (migramos a email+pass Supabase)
try {
  localStorage.removeItem('__admin_pin_fb__')
  localStorage.removeItem('__admin_pin_fb_new__')
  localStorage.removeItem('__admin_pin_hash__')
  localStorage.removeItem('__admin_pin_len__')
} catch {}

// VAPID: saneamos espacios, normalizamos a base64url y validamos
// que tenga formato correcto. Si la env var llega malformada (whitespace,
// comillas, padding incorrecto), caemos al fallback hardcoded.
const _VAPID_FALLBACK = 'BDUAj_e2GIAI_La_suiybArrHJteFKm6_GbR3ni8t0y9NEgc71yNHFqoL1JX6e4Wf8Iu9OTUy1rt2CrESWp8o_8'
const _sanitizeVapid = (s) => (s || '')
  .replace(/\s+/g, '')          // quita espacios/newlines/tabs
  .replace(/^["']|["']$/g, '')  // quita comillas envolventes
  .replace(/\+/g, '-')          // normaliza a base64url
  .replace(/\//g, '_')
  .replace(/=+$/, '')           // quita padding
const _isValidVapid = (s) => /^[A-Za-z0-9_-]{86,90}$/.test(s)
const _candidate = _sanitizeVapid(import.meta.env.VITE_VAPID_PUB)
export const VAPID_PUB = _isValidVapid(_candidate) ? _candidate : _VAPID_FALLBACK

export { WK, WD } from './workRules.js'
export const VPM = 2.5      // vacation days per month

// Bucket privado de Supabase Storage para los PDFs de cierre firmados.
// Antes se guardaban en base64 dentro de la columna JSONB `cierres.data`,
// lo que infla ~33% el tamaño y consume la cuota gratuita de BASE DE DATOS
// (500 MB) en vez de la de Storage (1 GB, separada). Hay que crear este
// bucket manualmente una vez en el dashboard de Supabase (privado, sin
// acceso público) antes de que la subida funcione.
export const CIERRE_PDF_BUCKET = 'cierres-pdf'

// Mismo razonamiento que CIERRE_PDF_BUCKET: los documentos de empleados
// (contratos, nóminas, certificados) admiten hasta 8 MB por archivo y se
// guardaban en base64 dentro de la columna JSONB de app_entities — con
// varios documentos por empleado, este es el mayor riesgo real de agotar
// los 500 MB gratuitos de base de datos, más que los PDFs de cierre.
export const DOCUMENTOS_BUCKET = 'documentos-empleado'

// Mismo razonamiento que CIERRE_PDF_BUCKET/DOCUMENTOS_BUCKET: las fotos de
// tickets de gastos se guardaban en base64 dentro del gasto, dentro del
// blob único de app_data — con un gasto por empleado con foto siendo algo
// habitual (no ocasional, como un contrato), este era uno de los mayores
// focos de crecimiento continuo de la cuota de base de datos.
export const GASTOS_BUCKET = 'gastos-fotos'

export { FESTIVOS_MADRID, FESTIVOS_MADRID_2026 } from './holidays.js'

export const INITIAL_DB = {
  empresas: [],
  obras: [],
  centrosTrabajo: [],
  employees: [],
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
  gastos: [],
  denuncias: [],
  wellbeing: [],
  turnos: [],
  partesTrabajo: [],
  legalAcknowledgements: [],
  anomalias_vistas: [],
  notisSent: {},
  pinLockouts: {},
  config: {},
  _ts: 0
}
