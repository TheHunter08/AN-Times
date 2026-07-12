import { createClient } from '@supabase/supabase-js'
import { SB_URL, SB_ANON, INITIAL_DB } from '../config/constants.js'

// Timeout explícito en cada petición a Supabase. Sin esto, el navegador puede
// dejar una petición "colgada" en señal débil durante un minuto o más antes de
// fallar — y como un guardado encadena varias peticiones seguidas (comprobar
// timestamp, bajar datos, subir), el conjunto se sentía congelado en vez de
// simplemente lento. El SW ya limita las lecturas (GET) a 8s con fallback a
// caché, pero las escrituras (POST del upsert) no pasan por esa ruta — sin
// timeout propio, esas sí podían quedarse colgadas indefinidamente. Con esto,
// cualquier petición individual falla rápido y entra en el mismo camino de
// reintento/cola offline que ya existe, en vez de bloquear la UI.
const _FETCH_TIMEOUT_MS = 6000
function _timeoutFetch(url, options = {}) {
  if (options.signal) return fetch(url, options)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), _FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// ── Cliente Supabase ──────────────────────────────────────────────────────────
export const supabase = (SB_URL && SB_ANON)
  ? createClient(SB_URL, SB_ANON, { global: { fetch: _timeoutFetch } })
  : null

const TABLE      = 'app_data'
const PUSH_TABLE = 'push_subs'
const ROW_ID     = 1
// Fila 2 ya se usa para archivo mensual (ver archive-records.js). Fila 3: datos
// "fríos" — solo los lee un panel dedicado cada uno, nunca dashboards, badges
// globales ni los scripts de cron/webhook — así que separarlos de la fila
// principal aligera lo que se descarga en cada sincronización normal y en
// cada consulta de los cron jobs (que ni siquiera necesitan tocar esta fila).
const COLD_ROW_ID = 3
const COLD_KEYS = ['gastos', 'denuncias', 'wellbeing', 'anomalias_vistas']

function _splitHotCold(db) {
  const cold = {}
  const hot = { ...db }
  for (const k of COLD_KEYS) { cold[k] = db[k]; delete hot[k] }
  return { hot, cold }
}

// ── Local storage ─────────────────────────────────────────────────────────────
export function loadLocal() {
  let raw = null
  try { raw = localStorage.getItem('an_times_v1') } catch { return { ...INITIAL_DB } }
  if (!raw) return { ...INITIAL_DB }
  try {
    return mergeDB(INITIAL_DB, JSON.parse(raw))
  } catch (err) {
    // Datos locales corruptos: log + limpiar para no quedar bloqueados al arrancar
    console.error('[loadLocal] corrupt localStorage, resetting:', err)
    try { localStorage.removeItem('an_times_v1') } catch {}
    return { ...INITIAL_DB }
  }
}

export function saveLocal(db) {
  try { localStorage.setItem('an_times_v1', JSON.stringify(db)) } catch (e) { console.error('[saveLocal] error:', e) }
}

// ── Tombstones ─────────────────────────────────────────────────────────────────
// _diffDeleted (appStore.js) calcula, en cada saveDB, qué ids se borraron a
// propósito en ESE guardado concreto — y _mergeForPush ya usa eso para no
// resucitarlos al fusionar con el servidor ANTES de subir. Pero eso solo
// protege la subida: mergeDB() (usado al DESCARGAR, en fetchDB) es una unión
// pura por id sin ese contexto, así que si un fetchDB (sondeo, realtime, o
// simplemente reabrir la app) llegaba ANTES de que el push del borrado
// aterrizara en el servidor, el registro seguía existiendo en el servidor y
// la unión lo volvía a meter en local — el borrado "no se quedaba pegado"
// hasta que, por azar, un push posterior ganara la carrera. Aquí se guarda
// un registro de "esto se borró a propósito, ignóralo si vuelve a aparecer"
// con caducidad (por si el id se reutilizase alguna vez, aunque los ids son
// aleatorios y eso no debería pasar), consultado tanto al descargar como al
// subir — cubre ambas direcciones del mismo problema.
const _TOMBSTONE_KEY = 'an_times_tombstones'
const _TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000
let _tombstones = (() => {
  try { return JSON.parse(localStorage.getItem(_TOMBSTONE_KEY) || '{}') } catch { return {} }
})()

function _pruneTombstones() {
  const now = Date.now()
  for (const key of Object.keys(_tombstones)) {
    for (const id of Object.keys(_tombstones[key])) {
      if (_tombstones[key][id] < now) delete _tombstones[key][id]
    }
    if (!Object.keys(_tombstones[key]).length) delete _tombstones[key]
  }
}

// Llamado desde appStore.js justo tras calcular `deleted` en cada saveDB.
export function recordTombstones(deleted) {
  if (!deleted) return
  _pruneTombstones()
  const now = Date.now()
  for (const key of Object.keys(deleted)) {
    if (!_tombstones[key]) _tombstones[key] = {}
    for (const id of deleted[key]) _tombstones[key][id] = now + _TOMBSTONE_TTL_MS
  }
  try { localStorage.setItem(_TOMBSTONE_KEY, JSON.stringify(_tombstones)) } catch {}
}

function _applyTombstones(arr, tKey) {
  const ids = tKey && _tombstones[tKey]
  if (!ids || !arr.length) return arr
  const now = Date.now()
  return arr.filter(item => {
    const id = item && typeof item === 'object' ? item.id : item
    const exp = ids[id]
    return !(exp && exp > now)
  })
}

// ── _unionById helper ─────────────────────────────────────────────────────────
// Merges two arrays by `id` field (union). Base items come first, incoming
// overwrites by id, new incoming items are appended. If incoming is empty but
// base has items, base is preserved (prevents silent data loss on concurrent writes).
function _unionById(base, incoming, tKey) {
  let b = Array.isArray(base) ? base : []
  let i = Array.isArray(incoming) ? incoming : []
  if (tKey) { b = _applyTombstones(b, tKey); i = _applyTombstones(i, tKey) }

  // If incoming is empty, keep base (don't replace with empty array)
  if (i.length === 0) return b

  // If base is empty, just return incoming
  if (b.length === 0) return i

  // Fallback para arrays de valores simples (ej. anomalias_vistas: IDs sueltos,
  // no objetos) — antes esto devolvía `incoming` tal cual, descartando lo que
  // hubiera solo en `base` (p.ej. una anomalía marcada como vista offline que
  // aún no había llegado al remoto se "desmarcaba" sola en el siguiente merge).
  if ((b.length > 0 && (b[0] === null || typeof b[0] !== 'object')) ||
      (i.length > 0 && (i[0] === null || typeof i[0] !== 'object'))) {
    return [...new Set([...b, ...i])]
  }

  const map = new Map()
  for (const item of b) map.set(item.id, item)
  for (const item of i) {
    const cur = map.get(item.id)
    if (!cur) { map.set(item.id, item); continue }
    // Si el item local está soft-deleted y el servidor aún no lo sabe, no resucitarlo
    if (cur?.deleted && !item.deleted) continue
    // Si ambos lados llevan _upd, el más reciente gana — protege una edición
    // local recién hecha (aprobar/rechazar vacaciones o gastos, editar un
    // empleado) de ser pisada por un fetch que trae la versión vieja del
    // servidor porque el push local aún no ha aterrizado. Si algún lado no
    // tiene _upd, se mantiene el comportamiento previo (incoming siempre gana).
    if (cur._upd && item._upd && Date.parse(item._upd) < Date.parse(cur._upd)) continue
    map.set(item.id, item)
  }
  return [...map.values()]
}

// ── _mergeRecords ──────────────────────────────────────────────────────────────
// Igual que _unionById, pero para `records` no basta con "incoming gana": si el
// empleado cerró jornada o marcó descanso en modo oficina (offline) y el pull de
// reconexión llega antes de que el push offline confirme, el remoto (viejo) pisaría
// el cierre/descanso local. Por eso comparamos `_upd` y nos quedamos con el más nuevo.
function _mergeRecords(base, incoming, tKey) {
  let b = Array.isArray(base) ? base : []
  let i = Array.isArray(incoming) ? incoming : []
  if (tKey) { b = _applyTombstones(b, tKey); i = _applyTombstones(i, tKey) }
  if (i.length === 0) return b
  if (b.length === 0) return i
  const map = new Map()
  for (const item of b) map.set(item.id, item)
  for (const item of i) {
    const cur = map.get(item.id)
    if (!cur) { map.set(item.id, item); continue }
    const curTs  = cur._upd  ? Date.parse(cur._upd)  : 0
    const itemTs = item._upd ? Date.parse(item._upd) : 0
    if (itemTs >= curTs) map.set(item.id, item)
  }
  return [...map.values()]
}

// ── mergeDB ───────────────────────────────────────────────────────────────────
export function mergeDB(base, incoming) {
  if (!incoming) return { ...base }
  const adm = base.employees?.find(e => e.isAdmin) || {
    id: 'admin', name: 'Administrador', empresa: base.empresas[0] || '',
    pin: '', color: '#5aa9e6', initials: 'AD',
    startDate: '2024-01-01', email: '', isAdmin: true
  }
  // Bug fix #7: no sobrescribir employees locales con array vacío (Supabase reset / rate-limit)
  const _rawIncomingEmps = (incoming.employees?.length > 0) ? incoming.employees : base.employees
  // Preservar campos que no existen en Supabase (onboardingDone, horasSemanales, etc.)
  const _baseEmpMap = new Map((base.employees || []).map(e => [e.id, e]))
  // Campos que la tabla Supabase employees NO almacena (solo en blob o local):
  const _LOCAL_ONLY_FIELDS = ['empresa','color','initials','startDate','fechaAlta',
    'accentColor','horasSemanales','permisos','dept','pin','pinLen']
  const incomingEmps = _rawIncomingEmps.map(e => {
    const b = _baseEmpMap.get(e.id)
    if (!b) return e
    const extras = {}
    // Preservar campos que el servidor no tiene (V2 solo guarda columnas de la tabla)
    for (const key of _LOCAL_ONLY_FIELDS) {
      if (b[key] != null && e[key] == null) extras[key] = b[key]
    }
    // onboardingDone: solo puede ir de false→true, nunca al revés
    if (b.onboardingDone && !e.onboardingDone) extras.onboardingDone = true
    return Object.keys(extras).length ? { ...e, ...extras } : e
  })
  // Bug fix #8: union de notisSent — cleanup entries older than 90 days
  const _mergedNotis = { ...(base.notisSent || {}), ...(incoming.notisSent || {}) }
  const _cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
  const mergedNotisSent = Object.fromEntries(
    Object.entries(_mergedNotis).filter(([, v]) => { const t = Date.parse(v); return isNaN(t) || t > _cutoff })
  )
  return {
    empresas:            (incoming.empresas?.length)       ? incoming.empresas       : base.empresas,
    obras:               (incoming.obras?.length)          ? incoming.obras          : base.obras,
    centrosTrabajo:      (incoming.centrosTrabajo?.length) ? incoming.centrosTrabajo : base.centrosTrabajo,
    employees:           incomingEmps.some(e => e.isAdmin) ? incomingEmps            : [...incomingEmps, adm],
    records:             _mergeRecords(base.records, (incoming.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime())), 'records'),
    vacaciones:          _unionById(base.vacaciones,          incoming.vacaciones,          'vacaciones'),
    medicos:             _unionById(base.medicos,             incoming.medicos,             'medicos'),
    ausencias:           _unionById(base.ausencias,           incoming.ausencias,           'ausencias'),
    mensajes:            _unionById(base.mensajes,            incoming.mensajes,            'mensajes'),
    notis:               _unionById(base.notis,               incoming.notis,               'notis'),
    cierres:             (() => {
      const merged  = _unionById(base.cierres, incoming.cierres, 'cierres')
      const baseMap = new Map((base.cierres || []).map(c => [c.id, c]))
      // records_snapshot, empName, dias, generadoPor no están en la tabla Supabase —
      // si la fila vino de V2 sin esos campos, recuperarlos del blob local.
      return merged.map(c => {
        const b = baseMap.get(c.id)
        if (!b) return c
        const fix = {}
        if (!c.records_snapshot && b.records_snapshot) fix.records_snapshot = b.records_snapshot
        if (!c.firma          && b.firma)          fix.firma          = b.firma
        if (!c.firmaEmp       && b.firma)          fix.firmaEmp       = b.firma
        if (!c.empName        && b.empName)        fix.empName        = b.empName
        if (!c.dias           && b.dias)           fix.dias           = b.dias
        if (!c.generadoPor    && b.generadoPor)    fix.generadoPor    = b.generadoPor
        if (!c.generadoAt     && b.generadoAt)     fix.generadoAt     = b.generadoAt
        return Object.keys(fix).length ? { ...c, ...fix } : c
      })
    })(),
    monthSnapshots:      incoming.monthSnapshots       || {},
    firmas:              incoming.firmas               || {},
    documentos:          _unionById(base.documentos,          incoming.documentos,          'documentos'),
    audit:               _unionById(base.audit,               incoming.audit,               'audit'),
    correccionesFichaje: _unionById(base.correccionesFichaje, incoming.correccionesFichaje, 'correccionesFichaje'),
    chats:               _unionById(base.chats,               incoming.chats,               'chats'),
    gastos:              _unionById(base.gastos,              incoming.gastos,              'gastos'),
    denuncias:           _unionById(base.denuncias,           incoming.denuncias,           'denuncias'),
    wellbeing:           _unionById(base.wellbeing,           incoming.wellbeing,           'wellbeing'),
    turnos:              _unionById(base.turnos,              incoming.turnos,              'turnos'),
    partesTrabajo:       _unionById(base.partesTrabajo,       incoming.partesTrabajo,       'partesTrabajo'),
    anomalias_vistas:    _unionById(base.anomalias_vistas,    incoming.anomalias_vistas,    'anomalias_vistas'),
    notisSent:           mergedNotisSent,
    pinLockouts:         { ...(incoming.pinLockouts || {}), ...(base.pinLockouts || {}) },
    config:              { ...(base.config || {}), ...(incoming.config || {}) },
    _ts:                 incoming._ts                  || 0
  }
}

// ── Merge seguro para el guardado (push) ──────────────────────────────────────
// mergeDB() está pensado para "bajar del servidor y fusionar con lo local": para
// listas como employees/obras/empresas usa "si incoming trae algo, ese gana
// entero" — correcto al descargar (el servidor manda), pero al SUBIR sería al
// revés: si lo tratamos como incoming=local, cualquier elemento que el servidor
// tuviera y este cliente aún no hubiera descargado (un fichaje offline de otro
// empleado, un cierre de jornada de un encargado) se borraría sin más. Aquí
// usamos unión por id en todos los campos — nunca se pierde nada de ninguno de
// los dos lados, solo se resuelve por id qué versión concreta gana.
//
// Una unión, por diseño, solo puede añadir/actualizar — nunca "quitar" nada,
// así que un elemento borrado localmente "resucitaría" porque el servidor
// todavía lo tiene. `deleted` (calculado en appStore.js al comparar el estado
// antes/después de cada saveDB) son los ids que el usuario borró a propósito
// en este guardado — se eliminan del resultado ya fusionado, explícitamente.
function _mergeForPush(serverData, localPayload, deleted) {
  if (!serverData) return localPayload
  const s = serverData, l = localPayload
  const out = {
    ...l,
    empresas:            _unionById(s.empresas,            l.empresas),
    obras:               _unionById(s.obras,               l.obras),
    centrosTrabajo:      _unionById(s.centrosTrabajo,      l.centrosTrabajo),
    employees:           _unionById(s.employees,           l.employees,           'employees'),
    records:             _mergeRecords(s.records, (l.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime())), 'records'),
    vacaciones:          _unionById(s.vacaciones,          l.vacaciones,          'vacaciones'),
    medicos:             _unionById(s.medicos,             l.medicos,             'medicos'),
    ausencias:           _unionById(s.ausencias,           l.ausencias,           'ausencias'),
    mensajes:            _unionById(s.mensajes,            l.mensajes,            'mensajes'),
    notis:               _unionById(s.notis,               l.notis,               'notis'),
    cierres:             _unionById(s.cierres,             l.cierres,             'cierres'),
    monthSnapshots:      { ...(s.monthSnapshots || {}), ...(l.monthSnapshots || {}) },
    firmas:              { ...(s.firmas || {}), ...(l.firmas || {}) },
    documentos:          _unionById(s.documentos,          l.documentos,          'documentos'),
    audit:               _unionById(s.audit,               l.audit,               'audit'),
    correccionesFichaje: _unionById(s.correccionesFichaje, l.correccionesFichaje, 'correccionesFichaje'),
    chats:               _unionById(s.chats,               l.chats,               'chats'),
    gastos:              _unionById(s.gastos,              l.gastos,              'gastos'),
    denuncias:           _unionById(s.denuncias,           l.denuncias,           'denuncias'),
    wellbeing:           _unionById(s.wellbeing,           l.wellbeing,           'wellbeing'),
    turnos:              _unionById(s.turnos,              l.turnos,              'turnos'),
    partesTrabajo:       _unionById(s.partesTrabajo,       l.partesTrabajo,       'partesTrabajo'),
    anomalias_vistas:    _unionById(s.anomalias_vistas,    l.anomalias_vistas,    'anomalias_vistas'),
    notisSent:           { ...(s.notisSent || {}), ...(l.notisSent || {}) },
    pinLockouts:         { ...(s.pinLockouts || {}), ...(l.pinLockouts || {}) },
    config:              { ...(s.config || {}), ...(l.config || {}) },
  }
  if (deleted) {
    for (const key of Object.keys(deleted)) {
      if (!Array.isArray(out[key])) continue
      const delSet = new Set(deleted[key])
      out[key] = out[key].filter(item => !delSet.has(item && typeof item === 'object' ? item.id : item))
    }
  }
  return out
}

// Último updated_at de servidor que este cliente ha visto con certeza (por un
// fetch propio o por su propio push). Deja que _mergeWithServer se salte la
// descarga completa cuando sabe que nadie más ha escrito desde entonces — en
// señal débil, cada round-trip de más se nota muchísimo en cuánto tarda en
// verse sincronizado el modo sin conexión.
let _lastKnownServerTs = 0
function _noteServerTs(ts) { if (ts && ts > _lastKnownServerTs) _lastKnownServerTs = ts }

// ── Supabase fetch (descarga datos completos) ─────────────────────────────────
// Trae la fila principal (hot) y la fría (gastos/denuncias/wellbeing/anomalias_vistas)
// y las fusiona en un único objeto — el resto de la app sigue viendo un `db`
// normal, sin enterarse de que ahora vive repartido en dos filas.
export async function cloudFetch() {
  if (!supabase) return { ok: false, data: null, status: 'no_config' }
  try {
    const [hotRes, coldRes] = await Promise.all([
      supabase.from(TABLE).select('data, updated_at').eq('id', ROW_ID).maybeSingle(),
      supabase.from(TABLE).select('data, updated_at').eq('id', COLD_ROW_ID).maybeSingle(),
    ])
    if (hotRes.error) return { ok: false, data: null, status: hotRes.error.code || 'sb_error' }
    // La fila fría puede no existir todavía (primera vez) — no es un error, solo "sin datos fríos".
    const hotData = hotRes.data?.data || null
    const coldData = coldRes.error ? null : (coldRes.data?.data || null)
    if (!hotData) return { ok: true, data: null, updatedAt: null }
    const merged = { ...hotData, ...coldData }
    const updatedAts = [hotRes.data?.updated_at, coldRes.data?.updated_at].filter(Boolean)
    const latestUpdatedAt = updatedAts.sort().slice(-1)[0] || hotRes.data?.updated_at || null
    _noteServerTs(latestUpdatedAt ? new Date(latestUpdatedAt).getTime() : 0)
    return { ok: true, data: merged, updatedAt: latestUpdatedAt }
  } catch (e) {
    console.error('[cloudFetch] error:', e)
    return { ok: false, data: null, status: 'red' }
  }
}

// ── Supabase fetch ligero: solo updated_at (~50 bytes por fila) ──────────────
// Devuelve el más reciente de los dos — si cualquiera de las dos filas cambió,
// hace falta un fetch completo.
export async function cloudFetchTs() {
  if (!supabase) return { ok: false, ts: null, status: 'no_config' }
  try {
    const [hotRes, coldRes] = await Promise.all([
      supabase.from(TABLE).select('updated_at').eq('id', ROW_ID).maybeSingle(),
      supabase.from(TABLE).select('updated_at').eq('id', COLD_ROW_ID).maybeSingle(),
    ])
    if (hotRes.error) return { ok: false, ts: null, status: hotRes.error.code || 'sb_error' }
    const hotTs = hotRes.data?.updated_at ? new Date(hotRes.data.updated_at).getTime() : 0
    const coldTs = (!coldRes.error && coldRes.data?.updated_at) ? new Date(coldRes.data.updated_at).getTime() : 0
    const ts = Math.max(hotTs, coldTs)
    _noteServerTs(ts)
    return { ok: true, ts }
  } catch (e) {
    console.error('[cloudFetchTs] error:', e)
    return { ok: false, ts: null, status: 'red' }
  }
}

// ── Supabase push (guarda datos) ──────────────────────────────────────────────
let _pushFlight = false
let _pushQueue  = []     // cola FIFO: nunca se pierden saves consecutivos
let _saveRetry  = 0
let _saveTimer  = null

// ── IndexedDB helpers para Background Sync ────────────────────────────────────
const _IDB_NAME = 'times-inc-sync'
const _IDB_STORE = 'q'

function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB_STORE)
    req.onsuccess = () => res(req.result)
    req.onerror   = () => rej(req.error)
  })
}

async function _idbSet(key, val) {
  const db = await _idbOpen()
  return new Promise((res, rej) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite')
    const r  = tx.objectStore(_IDB_STORE).put(val, key)
    r.onsuccess = res; r.onerror = () => rej(r.error)
  })
}

async function _idbGet(key) {
  try {
    const db = await _idbOpen()
    return new Promise((res, rej) => {
      const tx = db.transaction(_IDB_STORE, 'readonly')
      const r  = tx.objectStore(_IDB_STORE).get(key)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
  } catch { return undefined }
}

async function _idbDel(key) {
  try {
    const db = await _idbOpen()
    return new Promise((res, rej) => {
      const tx = db.transaction(_IDB_STORE, 'readwrite')
      const r  = tx.objectStore(_IDB_STORE).delete(key)
      r.onsuccess = res; r.onerror = () => rej(r.error)
    })
  } catch {}
}

// Guard para no acumular múltiples listeners 'online' en navegadores sin
// Background Sync API (el timer guarda cada 30s, _storeForBgSync se llama
// en cada guardado offline — sin el guard se añaden hasta 20+ listeners).
let _onlineListenerPending = false
let _bgSyncRetries = 0

async function _storeForBgSync(data, deleted) {
  try {
    // Se envuelve junto con `deleted` (ids borrados a propósito en este guardado)
    // para que, cuando por fin se sincronice offline, sw.js/_bgSyncFallback puedan
    // aplicar la eliminación real en vez de que la unión con el servidor la resucite.
    await _idbSet('pending', { payload: data, deleted: deleted || null })
    // Badge rojo en el icono de la app: avisa al usuario de que hay datos pendientes.
    // Se borra en _bgSyncFallback y en _bgSync del SW cuando la subida tiene éxito.
    try { navigator.setAppBadge?.(1) } catch {}
    // Fast-path: listener 'online' para cuando la app está abierta.
    // Background Sync API solo dispara cuando el navegador decide reconectar en
    // background (puede tardar, o solo ocurrir al cerrar la app). El listener
    // 'online' cubre el caso habitual: el usuario recupera cobertura con la app abierta.
    // Guard _onlineListenerPending evita acumular múltiples listeners en guardados repetidos.
    if (!_onlineListenerPending) {
      _onlineListenerPending = true
      const onOnline = async () => {
        _onlineListenerPending = false
        window.removeEventListener('online', onOnline)
        await _bgSyncFallback()
      }
      window.addEventListener('online', onOnline)
    }
    // Slow-path: Background Sync para cuando la app está cerrada.
    // Si el listener 'online' ya sincronizó, el SW encuentra IDB vacía y sale sin hacer nada.
    const sw = await navigator.serviceWorker?.ready
    if (sw && 'sync' in sw) {
      try { await sw.sync.register('sync-data') } catch {}
    }
  } catch (e) { console.error('[_storeForBgSync] error:', e) }
}

// Intenta guardar hot+cold en filas separadas. Si la fila fría falla (RLS o
// la fila no existe todavía en la BD), reintenta metiendo todo el payload en
// la fila caliente para no perder datos — la sincronización principal no se
// bloquea por un problema en la fila secundaria.
async function _upsertHotCold(payload) {
  const { hot, cold } = _splitHotCold(payload)
  const nowIso = new Date().toISOString()
  const [hotRes, coldRes] = await Promise.all([
    supabase.from(TABLE).upsert({ id: ROW_ID, data: hot, updated_at: nowIso }),
    supabase.from(TABLE).upsert({ id: COLD_ROW_ID, data: cold, updated_at: nowIso }),
  ])
  if (hotRes.error) throw hotRes.error
  if (coldRes.error) {
    console.warn('[cloudPush] cold row failed, fallback to full payload in hot row:', coldRes.error?.message)
    const { error: fbErr } = await supabase.from(TABLE).upsert({ id: ROW_ID, data: payload, updated_at: nowIso })
    if (fbErr) throw fbErr
  }
  // Tras un push con éxito, ya sabemos con certeza cuál es el updated_at del
  // servidor (lo acabamos de fijar nosotros) — así el próximo guardado puede
  // saltarse la descarga completa si nadie más ha escrito desde entonces.
  _noteServerTs(new Date(nowIso).getTime())
}

// Antes de escribir, trae la verdad actual del servidor y fusiona el pendiente
// local sobre ella (ver _mergeForPush). Sin esto, cada guardado sobrescribe la
// fila entera con la foto local — si otro dispositivo (otro empleado, un
// encargado) guardó algo mientras tanto que este cliente todavía no había
// descargado, ese cambio se borraba en silencio (p. ej. un fichaje offline
// recién subido, o un cierre de jornada hecho por un encargado).
//
// Optimización: si ya sabemos (por un fetch o push propio reciente) que nadie
// más ha escrito desde entonces, nos ahorramos la descarga completa y subimos
// directo — en señal débil, cada round-trip de más se nota mucho en cuánto
// tarda en verse sincronizado el modo sin conexión al recuperar cobertura.
async function _mergeWithServer(localPayload, deleted) {
  try {
    // Capturar ANTES de llamar — cloudFetchTs() actualiza _lastKnownServerTs
    // por su cuenta, así que comparar contra el valor ya actualizado
    // convertiría este chequeo en un siempre-verdadero inútil.
    const knownBefore = _lastKnownServerTs
    const tsResult = await cloudFetchTs()
    if (tsResult.ok && tsResult.ts && tsResult.ts <= knownBefore) return localPayload
    const { ok, data } = await cloudFetch()
    if (!ok || !data) return localPayload
    return _mergeForPush(data, localPayload, deleted)
  } catch (e) {
    console.warn('[_mergeWithServer] fetch falló, se sube solo lo local:', e)
    return localPayload
  }
}

// true solo mientras hay una petición de red realmente en vuelo (no durante la
// espera del backoff entre reintentos) — evita que el sondeo rápido de
// App.jsx (cada 8s mientras offlinePending) dispare una subida en paralelo
// justo cuando ya hay una en curso: en señal débil, dos intentos compitiendo
// a la vez por el mismo ancho de banda hace más probable que AMBOS fallen
// por timeout, alargando aún más la sincronización.
let _bgSyncFallbackFlight = false

async function _bgSyncFallback() {
  if (_bgSyncFallbackFlight) return
  // Si hay un push normal en vuelo, esperar a que aterrice y reintentar
  // (esto no cuenta como "en vuelo" propio, así que no toma el flag).
  if (_pushFlight) { setTimeout(_bgSyncFallback, 2000); return }
  _bgSyncFallbackFlight = true
  try {
    const stored = await _idbGet('pending')
    if (!stored || !supabase) { _bgSyncRetries = 0; return }
    const { payload: data, deleted } = stored
    // NO se comprueba navigator.onLine aquí: en iOS es conocidamente poco fiable
    // (puede quedarse pegado en `false` tras un cambio de red WiFi↔datos, o no
    // reflejar nunca una señal débil real) — confiar en él para decidir si
    // siquiera INTENTAR la petición dejaba fichajes en cola para siempre en
    // esos dispositivos, sin que ningún intento real llegara a lanzarse.
    // Se intenta directamente: si de verdad no hay red, la petición falla rápido
    // (o al timeout de 6s de _timeoutFetch) y cae en el catch de abajo, que ya
    // reintenta con backoff — mismo resultado, sin el falso negativo de iOS.
    // NOTA: el timestamp guard que había aquí (local._ts > data._ts → exit) se eliminó.
    // fetchDB() actualiza localStorage._ts al updated_at del servidor cuando baja datos
    // (aunque el fichaje offline aún no esté en Supabase). Eso hacía que el guard
    // interpretara "ya sincronizado" cuando en realidad solo habían llegado datos del admin.
    // La fuente de verdad correcta es IDB: si existe 'pending', hay que subirlo.
    const merged = await _mergeWithServer(data, deleted)
    await _upsertHotCold(merged)
    merged._ts = Date.now()
    saveLocal(merged)
    _broadcastUpdate(merged._ts)
    await _idbDel('pending')
    try { navigator.clearAppBadge?.() } catch {}
    _updateLastSync()
    _bgSyncRetries = 0
    window.dispatchEvent(new CustomEvent('times-synced'))
  } catch (e) {
    console.error('[_bgSyncFallback] error:', e)
    // Reintentar hasta 3 veces (5s, 10s, 15s) antes de mostrar el toast de error.
    // Cubre el caso donde Supabase tarda en responder justo al reconectar y el
    // listener 'online' ya fue eliminado (no volvería a dispararse tras el fallo).
    // El sondeo de App.jsx (cada 8s) es ahora el reintento principal — esta
    // cadena interna es solo una red de seguridad adicional.
    if (_bgSyncRetries < 3) {
      _bgSyncRetries++
      setTimeout(_bgSyncFallback, _bgSyncRetries * 5000)
    } else {
      _bgSyncRetries = 0
      window.dispatchEvent(new CustomEvent('times-save-failed'))
    }
  } finally {
    _bgSyncFallbackFlight = false
  }
}

function _clearBgSync() { _idbDel('pending') }

function _drainQueue() {
  if (_pushFlight || _pushQueue.length === 0) return
  const entry = _pushQueue.shift()
  const freshDb = entry.db || JSON.parse(localStorage.getItem('an_times_v1') || 'null')
  if (!freshDb) return
  _doCloudPush(freshDb, entry.deleted, entry.onSuccess, entry.onError)
}

function _doCloudPush(db, deleted, onSuccess, onError) {
  _pushFlight = true
  const payload = { ...db, _ts: Date.now() }
  saveLocal(payload)

  // NO se comprueba navigator.onLine aquí — ver el mismo razonamiento en
  // _bgSyncFallback: en iOS puede quedarse pegado en `false` con red real
  // disponible (señal débil, cambio WiFi↔datos), y confiar en él para saltar
  // el intento de red directamente a la cola offline dejaba fichajes sin
  // subir nunca en esos dispositivos — ni la app en primer plano lo
  // reintentaba (todo pasaba a depender de Background Sync, que iOS no
  // soporta) hasta que el usuario cerraba y reabría la app.
  _mergeWithServer(payload, deleted)
    .then(merged => _upsertHotCold(merged).then(() => merged))
    .then((merged) => {
      _pushFlight = false
      _saveRetry = 0
      _onlineListenerPending = false
      _clearBgSync()
      saveLocal(merged)
      onSuccess?.(merged)
      _broadcastUpdate(merged._ts)
      _updateLastSync()
      _drainQueue()
    })
    .catch((e) => {
      console.error('[cloudPush] error:', e)
      _pushFlight = false
      onError?.()
      // Guardar en IDB desde el primer fallo: si el usuario cierra la app
      // durante los reintentos, el SW Background Sync puede completar la
      // sincronización sin necesidad de que la app esté abierta.
      _storeForBgSync(payload, deleted)
      // Solo 2 reintentos en primer plano (antes 5): el dato YA está a salvo en
      // IDB desde la línea de arriba, así que insistir aquí solo añade tiempo de
      // espera en pantalla sin más seguridad — en señal débil es mejor rendirse
      // rápido y dejar que la cola de fondo (background sync / listener 'online')
      // termine el trabajo sin bloquear al usuario.
      if (_saveRetry < 2) {
        _saveRetry++
        _pushQueue.unshift({ db: null, deleted, onSuccess, onError })
        // Backoff: 1s, 2s
        const delay = Math.min(1000 * Math.pow(2, _saveRetry - 1), 30000)
        setTimeout(() => _drainQueue(), delay)
      } else {
        _saveRetry = 0
        window.dispatchEvent(new CustomEvent('times-save-failed'))
      }
    })
}

export function cloudPush(db, deleted, onSuccess, onError) {
  if (!supabase) { onError?.(); return }
  if (_pushFlight) {
    // Do not retain a stale snapshot while another push is in flight. At
    // drain time the latest optimistic local DB is the source of truth; only
    // the tombstones/callback from this queued mutation need to be preserved.
    _pushQueue.push({ db: null, deleted, onSuccess, onError })
    return
  }
  _doCloudPush(db, deleted, onSuccess, onError)
}

export function scheduleSave(db, deleted, onSuccess, onError, delay = 0) {
  saveLocal(db)
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => cloudPush(db, deleted, onSuccess, onError), delay)
}

// ── Supabase Realtime con auto-reconexión ────────────────────────────────────
// IMPORTANTE: usa 'broadcast' (mensaje ligero, unos bytes) en vez de
// 'postgres_changes'. postgres_changes reenvía la FILA COMPLETA (el JSON de
// toda la app) a cada cliente conectado en cada guardado — con varios
// empleados con la app abierta a la vez, cada fichaje se multiplicaba por N
// clientes y disparaba el consumo de ancho de banda de salida de Supabase.
// Con broadcast, cada cliente solo recibe "algo cambió a las X" y decide si
// le hace falta descargar algo con el mismo chequeo de timestamp que ya
// usaba fetchDB() — el dato completo solo viaja una vez, hacia quien lo pide.
let _realtimeChannel = null
let _realtimeRetry   = 0
let _realtimeTimer   = null

export function startRealtime(currentGetDB, onUpdate, getServerTs, onStatusChange) {
  if (!supabase) return
  stopRealtime()
  _realtimeChannel = supabase
    .channel('app_data_rt', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'updated' }, ({ payload }) => {
      const remoteTs = payload?.ts
      // Usar _serverTs (no local._ts): local._ts puede estar inflado por Date.now()
      // de guardados locales del encargado, haciendo que broadcasts de empleados
      // parezcan "ya conocidos" aunque el encargado nunca haya descargado esos datos.
      const refTs = getServerTs ? getServerTs() : currentGetDB()._ts
      if (remoteTs != null && refTs != null && refTs > 0 && remoteTs < refTs) return
      _realtimeRetry = 0
      onUpdate?.()
    })
    .subscribe((status) => {
      onStatusChange?.(status)
      if (status === 'SUBSCRIBED') {
        // Si veníamos de un error/cierre, hacer fetch al reconectar para recuperar
        // cualquier cambio que llegó mientras el canal estaba caído.
        if (_realtimeRetry > 0) onUpdate?.()
        _realtimeRetry = 0
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Reconexión exponencial: máx 15s (antes 60s). CLOSED ocurre cuando Android suspende la red.
        clearTimeout(_realtimeTimer)
        const delay = Math.min(3000 * Math.pow(2, _realtimeRetry), 15000)
        _realtimeRetry++
        _realtimeTimer = setTimeout(() => startRealtime(currentGetDB, onUpdate, getServerTs, onStatusChange), delay)
      }
    })
}

export function stopRealtime() {
  clearTimeout(_realtimeTimer)
  if (_realtimeChannel) { supabase?.removeChannel(_realtimeChannel); _realtimeChannel = null }
  _realtimeRetry = 0
}

// ── Presencia en tiempo real ────────────────────────────────────────────────
// Canal ligero de presencia Supabase: cada usuario trackea su userId y
// onCount() recibe el total de sesiones activas en este momento.
let _presenceChannel = null

export function startPresence(userId, onCount) {
  if (!supabase || !userId) return
  if (_presenceChannel) { supabase.removeChannel(_presenceChannel); _presenceChannel = null }
  _presenceChannel = supabase.channel('app_presence')
  _presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = _presenceChannel.presenceState()
      onCount?.(Object.keys(state).length)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await _presenceChannel.track({ userId, at: new Date().toISOString() }).catch(() => {})
      }
    })
}

export function stopPresence() {
  if (_presenceChannel) { supabase?.removeChannel(_presenceChannel); _presenceChannel = null }
}

// Aviso ligero de que app_data cambió — lo llama _doCloudPush tras guardar con
// éxito. Si el canal no está suscrito (realtime no arrancado en esta pestaña,
// o desconectado), no pasa nada grave: el sondeo de seguridad en App.jsx
// (fetchDB periódico) acaba trayendo el cambio de todas formas.
function _broadcastUpdate(ts) {
  // send() es async — un try/catch no basta, hay que atrapar el rechazo de la promesa
  try { _realtimeChannel?.send({ type: 'broadcast', event: 'updated', payload: { ts } })?.catch(() => {}) } catch {}
}

// Exportado para que App.jsx pueda notificar a otros clientes tras un BG_SYNC_DONE del SW
export function broadcastSync(ts) { _broadcastUpdate(ts) }

// ── Heartbeat para background sync iOS ──────────────────────────────────────
// Actualiza push_subs.last_online mientras el empleado tiene la app abierta y online.
// El cron /api/sync-ping compara last_online con last_sync para detectar dispositivos
// que podrían tener datos offline pendientes y les envía un push de wake-up.
export async function sendHeartbeat() {
  if (!navigator.onLine || !supabase) return
  try {
    const userId = await _idbGet('push_user_id')
    if (!userId) return
    supabase.from('push_subs')
      .update({ last_online: new Date().toISOString() })
      .eq('user_id', userId)
      .then(() => {}).catch(() => {})
  } catch {}
}

// Marca last_sync tras una subida exitosa. El cron no enviará push mientras
// last_sync sea reciente, evitando pings innecesarios. Exportado para que
// App.jsx lo llame al recibir BG_SYNC_DONE del SW (app en primer plano).
export async function _updateLastSync() {
  if (!supabase) return
  try {
    const userId = await _idbGet('push_user_id')
    if (!userId) return
    supabase.from('push_subs')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .then(() => {}).catch(() => {})
  } catch {}
}

// Exportado para que App.jsx lo llame en arranque, reconexión y BG_SYNC_FAILED.
// NO guarda aquí si !navigator.onLine: _bgSyncFallback lo maneja con retry
// (si quitamos el guard aquí pero no allá, nunca llegaría al retry interno).
export function uploadPendingIfAny() {
  if (!supabase) return
  _bgSyncFallback().catch(() => {})
}

// ── Push notifications ────────────────────────────────────────────────────────
const VAPID_KEY_STORAGE = 'an_times_vapid_key'

export async function pushSubscribe(userId, vapidPub) {
  if (!supabase) return { ok: false, reason: 'no_supabase' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[PUSH] Navegador sin soporte para Web Push')
    return { ok: false, reason: 'no_support' }
  }
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'permission_denied', hint: 'Activa las notificaciones en la configuración del navegador para este sitio.' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission_not_granted', hint: 'Necesitas conceder permiso de notificaciones cuando el navegador lo solicite.' }
  }
  try {
    const reg = await navigator.serviceWorker.ready
    // Sanea cualquier whitespace/quotes y normaliza base64url ANTES de atob,
    // si no atob lanza "The string contains invalid characters" en iOS.
    const b64ToUint8 = raw => {
      const b = String(raw || '')
        .replace(/\s+/g, '')
        .replace(/^["']|["']$/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
      const p = '='.repeat((4 - b.length % 4) % 4)
      const s = atob(b + p)
      return Uint8Array.from([...s].map(c => c.charCodeAt(0)))
    }
    const buf2b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

    // Si la clave VAPID cambió (o nunca se guardó), la suscripción existente es inválida → forzar re-suscripción
    const storedKey = localStorage.getItem(VAPID_KEY_STORAGE)
    if (storedKey !== vapidPub) {
      const old = await reg.pushManager.getSubscription()
      if (old) { try { await old.unsubscribe() } catch {} }
    }

    // Helper: intentar subscribe con reintento limpio (force unsubscribe + retry)
    const doSubscribe = async () => {
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(vapidPub)
      })
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      try {
        sub = await doSubscribe()
      } catch (err) {
        console.error('[PUSH] subscribe() falló (intento 1):', err.name, err.message)
        // iOS suele tener suscripciones zombi tras cambios de VAPID/permission.
        // Reintento: limpia cualquier estado residual y vuelve a suscribir.
        try {
          const stale = await reg.pushManager.getSubscription()
          if (stale) { try { await stale.unsubscribe() } catch {} }
          await new Promise(r => setTimeout(r, 400))
          sub = await doSubscribe()
          console.log('[PUSH] subscribe() OK tras reintento')
        } catch (err2) {
          console.error('[PUSH] subscribe() falló (intento 2):', err2.name, err2.message)
          const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
          let hint = err2.message || err2.name || 'desconocido'
          if (isIOS && !isPWA) hint = 'Instala la PWA en pantalla de inicio (Safari → Compartir → Añadir)'
          else if (err2.name === 'NotAllowedError') hint = 'Permiso de notificaciones denegado o restringido por iOS'
          else if (err2.name === 'AbortError') hint = 'No se pudo contactar con el servicio push (red o iOS)'
          else if (err2.name === 'InvalidAccessError') hint = 'Clave VAPID inválida'
          return { ok: false, reason: 'subscribe_failed', error: hint, errName: err2.name }
        }
      }
    }
    localStorage.setItem(VAPID_KEY_STORAGE, vapidPub)
    // Guardar userId en IDB para que el SW lo use en pushsubscriptionchange
    _idbSet('push_user_id', userId).catch(() => {})
    const key  = sub.getKey('p256dh')
    const auth = sub.getKey('auth')
    if (!key || !auth) {
      console.error('[PUSH] Suscripción sin claves p256dh/auth')
      return { ok: false, reason: 'no_keys' }
    }
    const { error } = await supabase.from(PUSH_TABLE).upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: buf2b64(key),
      auth:   buf2b64(auth),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    if (error) {
      console.error('[PUSH] upsert Supabase falló:', error)
      return { ok: false, reason: 'db_failed', error: error.message }
    }
    return { ok: true, endpoint: sub.endpoint }
  } catch(e) {
    console.error('[PUSH] excepción inesperada:', e)
    return { ok: false, reason: 'exception', error: e.message }
  }
}

// Dedupe persistente per-device: bloquea el mismo (to|tag|title|body) durante 5 min.
// Evita que la misma smart-noti se reenvíe en checks consecutivos del bucle 60s.
function _pushDedupHit(to, tag, title, body) {
  try {
    const key = '__pushdedup__'
    // 30s: suficiente para evitar dobles envíos del mismo trigger, pero no
    // silencia notificaciones distintas que lleguen seguidas (p.ej. dos gastos
    // aprobados al mismo empleado en el mismo minuto).
    const TTL = 30 * 1000
    const now = Date.now()
    const raw = localStorage.getItem(key)
    const map = raw ? JSON.parse(raw) : {}
    const fp = `${to}|${tag}|${title}|${body}`
    if (map[fp] && now - map[fp] < TTL) return true
    map[fp] = now
    for (const k in map) { if (now - map[k] > TTL) delete map[k] }
    localStorage.setItem(key, JSON.stringify(map))
    return false
  } catch { return false }
}

// Cola persistente para pushes que fallan por falta de conexión del propio
// emisor (admin/JO offline al fichar/asignar). Sin esto el push se perdía en
// silencio (solo console.error) y el destinatario nunca se enteraba.
const PUSH_QUEUE_KEY = '__pushqueue__'
const PUSH_QUEUE_MAX = 30

function _enqueueFailedPush(item) {
  try {
    const raw = localStorage.getItem(PUSH_QUEUE_KEY)
    const queue = raw ? JSON.parse(raw) : []
    queue.push({ ...item, ts: Date.now() })
    while (queue.length > PUSH_QUEUE_MAX) queue.shift()
    localStorage.setItem(PUSH_QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

// Envío real, sin pasar por el dedupe (usado tanto por el envío normal como
// por los reintentos de la cola — un reintento NUNCA debe poder "deduplicarse"
// contra su propio intento fallido original).
async function _doSendPush(to, title, body, tag, safeUrl) {
  const payload = { to, title, body, tag, url: safeUrl }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _enqueueFailedPush(payload)
    return { ok: false, queued: true }
  }
  try {
    const headers = { 'Content-Type': 'application/json' }
    const res = await fetch('/api/sendpush', { method: 'POST', headers, body: JSON.stringify({ userId: to, title, body, tag, url: safeUrl }) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[PUSH] sendpush error', res.status, text)
      _enqueueFailedPush(payload)
      return { ok: false, status: res.status, error: text }
    }
    return await res.json().catch(() => ({ ok: true }))
  } catch(e) {
    console.error('[PUSH] queuePush fetch error', e)
    _enqueueFailedPush(payload)
    return { ok: false, status: 'network', error: e.message }
  }
}

export async function queuePush(to, title, body, tag = 'times', url = '/') {
  if (_pushDedupHit(to, tag, title, body)) {
    return { ok: true, deduped: true }
  }
  const safeUrl = (typeof url === 'string' && url.startsWith('/')) ? url : '/'
  return _doSendPush(to, title, body, tag, safeUrl)
}

// Reintenta los pushes que fallaron por conexión. Se llama al recuperar
// internet (evento 'online') y al arrancar la app. Bypasa el dedupe: el intento
// original ya quedó registrado en el mapa de dedupe aunque fallara, así que
// pasar por queuePush() aquí lo marcaría como "duplicado" y se perdería para siempre.
export async function flushPushQueue() {
  let queue
  try {
    const raw = localStorage.getItem(PUSH_QUEUE_KEY)
    queue = raw ? JSON.parse(raw) : []
  } catch { return }
  if (!queue.length) return
  localStorage.removeItem(PUSH_QUEUE_KEY)
  for (const item of queue) {
    // Descarta reintentos con más de 24h: la notificación ya no es relevante.
    if (Date.now() - (item.ts || 0) > 24 * 60 * 60 * 1000) continue
    await _doSendPush(item.to, item.title, item.body, item.tag, item.url)
  }
}

export function auditLog(db, action, detail, user) {
  try {
    const entry = {
      id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      action, detail,
      ts: new Date().toISOString(),
      user: user || 'system'
    }
    return { ...db, audit: [...(db.audit || []), entry] }
  } catch { return db }
}
