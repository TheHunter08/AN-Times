import { createClient } from '@supabase/supabase-js'
import { SB_URL, SB_ANON, INITIAL_DB } from '../config/constants.js'

// ── Cliente Supabase ──────────────────────────────────────────────────────────
export const supabase = (SB_URL && SB_ANON)
  ? createClient(SB_URL, SB_ANON)
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

// ── _unionById helper ─────────────────────────────────────────────────────────
// Merges two arrays by `id` field (union). Base items come first, incoming
// overwrites by id, new incoming items are appended. If incoming is empty but
// base has items, base is preserved (prevents silent data loss on concurrent writes).
function _unionById(base, incoming) {
  const b = Array.isArray(base) ? base : []
  const i = Array.isArray(incoming) ? incoming : []

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
  for (const item of i) map.set(item.id, item)
  return [...map.values()]
}

// ── _mergeRecords ──────────────────────────────────────────────────────────────
// Igual que _unionById, pero para `records` no basta con "incoming gana": si el
// empleado cerró jornada o marcó descanso en modo oficina (offline) y el pull de
// reconexión llega antes de que el push offline confirme, el remoto (viejo) pisaría
// el cierre/descanso local. Por eso comparamos `_upd` y nos quedamos con el más nuevo.
function _mergeRecords(base, incoming) {
  const b = Array.isArray(base) ? base : []
  const i = Array.isArray(incoming) ? incoming : []
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
  const incomingEmps = (incoming.employees?.length > 0) ? incoming.employees : base.employees
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
    records:             _mergeRecords(base.records, (incoming.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime()))),
    vacaciones:          _unionById(base.vacaciones,          incoming.vacaciones),
    medicos:             _unionById(base.medicos,             incoming.medicos),
    ausencias:           _unionById(base.ausencias,           incoming.ausencias),
    mensajes:            _unionById(base.mensajes,            incoming.mensajes),
    notis:               _unionById(base.notis,               incoming.notis),
    cierres:             _unionById(base.cierres,             incoming.cierres),
    monthSnapshots:      incoming.monthSnapshots       || {},
    firmas:              incoming.firmas               || {},
    documentos:          _unionById(base.documentos,          incoming.documentos),
    audit:               _unionById(base.audit,               incoming.audit),
    correccionesFichaje: _unionById(base.correccionesFichaje, incoming.correccionesFichaje),
    chats:               _unionById(base.chats,               incoming.chats),
    gastos:              _unionById(base.gastos,              incoming.gastos),
    denuncias:           _unionById(base.denuncias,           incoming.denuncias),
    wellbeing:           _unionById(base.wellbeing,           incoming.wellbeing),
    turnos:              _unionById(base.turnos,              incoming.turnos),
    partesTrabajo:       _unionById(base.partesTrabajo,       incoming.partesTrabajo),
    anomalias_vistas:    _unionById(base.anomalias_vistas,    incoming.anomalias_vistas),
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
function _mergeForPush(serverData, localPayload) {
  if (!serverData) return localPayload
  const s = serverData, l = localPayload
  return {
    ...l,
    empresas:            _unionById(s.empresas,            l.empresas),
    obras:               _unionById(s.obras,               l.obras),
    centrosTrabajo:      _unionById(s.centrosTrabajo,      l.centrosTrabajo),
    employees:           _unionById(s.employees,           l.employees),
    records:             _mergeRecords(s.records, (l.records || []).filter(r => r?.inicio && !isNaN(new Date(r.inicio).getTime()))),
    vacaciones:          _unionById(s.vacaciones,          l.vacaciones),
    medicos:             _unionById(s.medicos,             l.medicos),
    ausencias:           _unionById(s.ausencias,           l.ausencias),
    mensajes:            _unionById(s.mensajes,            l.mensajes),
    notis:               _unionById(s.notis,               l.notis),
    cierres:             _unionById(s.cierres,             l.cierres),
    monthSnapshots:      { ...(s.monthSnapshots || {}), ...(l.monthSnapshots || {}) },
    firmas:              { ...(s.firmas || {}), ...(l.firmas || {}) },
    documentos:          _unionById(s.documentos,          l.documentos),
    audit:               _unionById(s.audit,               l.audit),
    correccionesFichaje: _unionById(s.correccionesFichaje, l.correccionesFichaje),
    chats:               _unionById(s.chats,               l.chats),
    gastos:              _unionById(s.gastos,              l.gastos),
    denuncias:           _unionById(s.denuncias,           l.denuncias),
    wellbeing:           _unionById(s.wellbeing,           l.wellbeing),
    turnos:              _unionById(s.turnos,              l.turnos),
    partesTrabajo:       _unionById(s.partesTrabajo,       l.partesTrabajo),
    anomalias_vistas:    _unionById(s.anomalias_vistas,    l.anomalias_vistas),
    notisSent:           { ...(s.notisSent || {}), ...(l.notisSent || {}) },
    pinLockouts:         { ...(s.pinLockouts || {}), ...(l.pinLockouts || {}) },
    config:              { ...(s.config || {}), ...(l.config || {}) },
  }
}

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
    return { ok: true, ts: Math.max(hotTs, coldTs) }
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

async function _storeForBgSync(data) {
  try {
    await _idbSet('pending', data)
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
}

// Antes de escribir, trae la verdad actual del servidor y fusiona el pendiente
// local sobre ella (ver _mergeForPush). Sin esto, cada guardado sobrescribe la
// fila entera con la foto local — si otro dispositivo (otro empleado, un
// encargado) guardó algo mientras tanto que este cliente todavía no había
// descargado, ese cambio se borraba en silencio (p. ej. un fichaje offline
// recién subido, o un cierre de jornada hecho por un encargado).
async function _mergeWithServer(localPayload) {
  try {
    const { ok, data } = await cloudFetch()
    if (!ok || !data) return localPayload
    return _mergeForPush(data, localPayload)
  } catch (e) {
    console.warn('[_mergeWithServer] fetch falló, se sube solo lo local:', e)
    return localPayload
  }
}

async function _bgSyncFallback() {
  try {
    // Si hay un push normal en vuelo, esperar a que aterrice y reintentar.
    // Sin el retry, si _onlineListenerPending ya fue limpiado y el push falla,
    // el IDB queda varado porque el listener 'online' no vuelve a dispararse.
    if (_pushFlight) { setTimeout(_bgSyncFallback, 2000); return }
    const data = await _idbGet('pending')
    if (!data || !supabase) { _bgSyncRetries = 0; return }
    // Guard de timestamp: si localStorage ya tiene datos más nuevos que el IDB
    // (ocurre cuando el timer guardó con éxito justo antes del evento online),
    // limpiar IDB y salir — ya está sincronizado.
    try {
      const local = JSON.parse(localStorage.getItem('an_times_v1') || 'null')
      if (local?._ts && data._ts && local._ts > data._ts) { await _idbDel('pending'); _bgSyncRetries = 0; return }
    } catch {}
    const merged = await _mergeWithServer(data)
    await _upsertHotCold(merged)
    saveLocal(merged)
    await _idbDel('pending')
    _bgSyncRetries = 0
    window.dispatchEvent(new CustomEvent('times-synced'))
  } catch (e) {
    console.error('[_bgSyncFallback] error:', e)
    // Reintentar hasta 3 veces (5s, 10s, 15s) antes de mostrar el toast de error.
    // Cubre el caso donde Supabase tarda en responder justo al reconectar y el
    // listener 'online' ya fue eliminado (no volvería a dispararse tras el fallo).
    if (_bgSyncRetries < 3) {
      _bgSyncRetries++
      setTimeout(_bgSyncFallback, _bgSyncRetries * 5000)
    } else {
      _bgSyncRetries = 0
      window.dispatchEvent(new CustomEvent('times-save-failed'))
    }
  }
}

function _clearBgSync() { _idbDel('pending') }

function _drainQueue() {
  if (_pushFlight || _pushQueue.length === 0) return
  const entry = _pushQueue.shift()
  const freshDb = entry.db || JSON.parse(localStorage.getItem('an_times_v1') || 'null')
  if (!freshDb) return
  _doCloudPush(freshDb, entry.onSuccess, entry.onError)
}

function _doCloudPush(db, onSuccess, onError) {
  _pushFlight = true
  const payload = { ...db, _ts: Date.now() }
  saveLocal(payload)

  // Sin red: guardar en IDB inmediatamente para background sync (no reintentar)
  if (!navigator.onLine) {
    _pushFlight = false
    onError?.()
    _storeForBgSync(payload)
    return
  }

  _mergeWithServer(payload)
    .then(merged => _upsertHotCold(merged).then(() => merged))
    .then((merged) => {
      _pushFlight = false
      _saveRetry = 0
      _onlineListenerPending = false
      _clearBgSync()
      saveLocal(merged)
      onSuccess?.(merged)
      _broadcastUpdate(merged._ts)
      _drainQueue()
    })
    .catch((e) => {
      console.error('[cloudPush] error:', e)
      _pushFlight = false
      onError?.()
      // Guardar en IDB desde el primer fallo: si el usuario cierra la app
      // durante los reintentos, el SW Background Sync puede completar la
      // sincronización sin necesidad de que la app esté abierta.
      _storeForBgSync(payload)
      if (_saveRetry < 5) {
        _saveRetry++
        _pushQueue.unshift({ db: null, onSuccess, onError })
        // Backoff exponencial: 1s, 2s, 4s, 8s, 16s (máx 30s)
        const delay = Math.min(1000 * Math.pow(2, _saveRetry - 1), 30000)
        setTimeout(() => _drainQueue(), delay)
      } else {
        _saveRetry = 0
        window.dispatchEvent(new CustomEvent('times-save-failed'))
      }
    })
}

export function cloudPush(db, onSuccess, onError) {
  if (!supabase) { onError?.(); return }
  if (_pushFlight) {
    _pushQueue.push({ db, onSuccess, onError })
    return
  }
  _doCloudPush(db, onSuccess, onError)
}

export function scheduleSave(db, onSuccess, onError, delay = 0) {
  saveLocal(db)
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => cloudPush(db, onSuccess, onError), delay)
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

export function startRealtime(currentGetDB, onUpdate) {
  if (!supabase) return
  stopRealtime()
  _realtimeChannel = supabase
    .channel('app_data_rt', { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'updated' }, ({ payload }) => {
      const remoteTs = payload?.ts
      const local = currentGetDB()
      if (remoteTs != null && local._ts != null && remoteTs <= local._ts) return
      _realtimeRetry = 0
      onUpdate?.()
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _realtimeRetry = 0
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Reconexión exponencial: máx 60s. CLOSED ocurre cuando Android suspende la red.
        clearTimeout(_realtimeTimer)
        const delay = Math.min(3000 * Math.pow(2, _realtimeRetry), 60000)
        _realtimeRetry++
        _realtimeTimer = setTimeout(() => startRealtime(currentGetDB, onUpdate), delay)
      }
    })
}

export function stopRealtime() {
  clearTimeout(_realtimeTimer)
  if (_realtimeChannel) { supabase?.removeChannel(_realtimeChannel); _realtimeChannel = null }
  _realtimeRetry = 0
}

// Aviso ligero de que app_data cambió — lo llama _doCloudPush tras guardar con
// éxito. Si el canal no está suscrito (realtime no arrancado en esta pestaña,
// o desconectado), no pasa nada grave: el sondeo de seguridad en App.jsx
// (fetchDB periódico) acaba trayendo el cambio de todas formas.
function _broadcastUpdate(ts) {
  // send() es async — un try/catch no basta, hay que atrapar el rechazo de la promesa
  try { _realtimeChannel?.send({ type: 'broadcast', event: 'updated', payload: { ts } })?.catch(() => {}) } catch {}
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
    const TTL = 5 * 60 * 1000
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
