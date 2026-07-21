import { create } from 'zustand'
import { loadLocal, mergeDB, saveLocal, cloudPush, cloudFetch, cloudFetchTs, startRealtime, stopRealtime, recordTombstones, mergePendingDeletes, startPresence, stopPresence, startTableRealtime, stopTableRealtime, persistRecordRow, tableChangeToPatch } from '../services/dataServiceV2.js'
import { signOut as authSignOut } from '../services/authService.js'
import { INITIAL_DB } from '../config/constants.js'
import { sanitizeSession } from '../utils/sessionSecurity.js'
import { normalizeToastOptions } from '../utils/toastOptions.js'
import { pruneDbRetention } from '../utils/dbRetention.js'

const storedSes = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem('an_times_ses') || 'null')
    if (!raw) return null
    const safe = sanitizeSession(raw)
    // Migra silenciosamente sesiones antiguas que contenían la ficha completa,
    // incluido el hash del PIN, a la representación mínima.
    localStorage.setItem('an_times_ses', JSON.stringify(safe))
    return safe
  } catch { return null }
})()
const initialDb = loadLocal()

function _runtimeSession(session, db) {
  const safe = sanitizeSession(session)
  if (!safe.user?.id) return safe
  const profile = (db?.employees || []).find(employee => employee.id === safe.user.id && !employee.baja)
  return profile ? { ...safe, user: profile } : safe
}

// Detecta qué ids (o valores, en arrays de strings) desaparecieron respecto al
// estado anterior — son eliminaciones intencionadas del usuario (borrar un
// fichaje, una ausencia, un gasto…). dataService.js las necesita para poder
// BORRAR de verdad al fusionar con el servidor antes de subir: esa fusión usa
// unión por id para no perder datos que otro dispositivo hubiera guardado y
// este cliente aún no conociera, pero una unión SOLO puede añadir/actualizar,
// nunca quitar — sin esto, cualquier elemento borrado "resucitaba" en el
// siguiente guardado porque el servidor todavía lo tenía.
function _diffDeleted(before, partial) {
  if (!partial) return null
  const out = {}
  for (const key of Object.keys(partial)) {
    const b = before?.[key], a = partial[key]
    if (!Array.isArray(b) || !Array.isArray(a) || b.length === 0) continue
    const isObjArr = b[0] && typeof b[0] === 'object' && b[0].id !== undefined
    const removed = isObjArr
      ? (() => { const aIds = new Set(a.map(x => x?.id)); return b.filter(x => x?.id !== undefined && !aIds.has(x.id)).map(x => x.id) })()
      : (() => { const aSet = new Set(a); return b.filter(x => !aSet.has(x)) })()
    if (removed.length) out[key] = removed
  }
  return Object.keys(out).length ? out : null
}

export const useAppStore = create((set, get) => ({
  // ── DB ──────────────────────────────────────────────────────────────
  db: initialDb,
  // Último updated_at conocido del servidor. SOLO se actualiza tras un fetchDB exitoso,
  // nunca por guardados locales — evita que db._ts (inflado por Date.now()) bloquee la
  // detección de cambios remotos en fetchDB y en el receptor de Realtime.
  _serverTs: Number(initialDb?._serverTs) || 0,

  setDB: db => set({ db }),

  updateDB: updater => {
    const newDB = updater(get().db)
    set({ db: newDB })
    return newDB
  },

  saveDB: (partialOrFn) => {
    // Usar updater de Zustand para leer siempre el estado más reciente,
    // evitando sobrescrituras cuando dos saves se encadenan rápido o llega un sync de realtime
    let merged
    let deleted
    let syncHint
    let priorityRecords = []
    set(state => {
      const partial = typeof partialOrFn === 'function' ? partialOrFn(state.db) : partialOrFn
      const changedKeys = Object.keys(partial || {}).filter(key => key !== '_ts' && key !== '_serverTs')
      if (Array.isArray(partial?.records)) {
        const previous = new Map((state.db.records || []).map(record => [record.id, record]))
        priorityRecords = partial.records.filter(record => {
          const old = previous.get(record?.id)
          return record?.id && (!old || (old !== record && JSON.stringify(old) !== JSON.stringify(record)))
        })
      }
      syncHint = { changedKeys, recordIds: priorityRecords.map(record => record.id) }
      deleted = _diffDeleted(state.db, partial)
      merged = { ...state.db, ...(partial || {}), _ts: Date.now() }
      const retained = pruneDbRetention(merged)
      merged = retained.db
      deleted = mergePendingDeletes(deleted, retained.deleted)
      // Incluye los tombstones de la retencion automatica: asi las filas
      // antiguas tampoco resucitan desde app_entities ni consumen cuota.
      recordTombstones(deleted)
      saveLocal(merged)
      // offlinePending: true si no hay red, o si ya había un guardado pendiente anterior
      // (evita que el timer cada 30s lo resetee a false en señal débil, lo que hacía
      // parpadear el banner "Modo sin cobertura" entre cada tick de guardado).
      return { db: merged, syncStatus: navigator.onLine ? 'syncing' : 'offline', offlinePending: state.offlinePending || !navigator.onLine }
    })
    // El fichaje concreto viaja directamente a la tabla normalizada para que
    // Realtime lo publique sin esperar a la reconciliación del blob completo.
    // No se espera esta promesa: la UI y el guardado local ya son inmediatos y
    // cloudPush mantiene la cola offline como respaldo si la red falla.
    for (const record of priorityRecords) persistRecordRow(record).catch(() => {})
    cloudPush(merged, deleted,
      // cloudPush ahora fusiona con el servidor antes de subir (ver _mergeWithServer
      // en dataService.js) y devuelve ese resultado reconciliado — lo incorporamos
      // aquí para que la UI local también vea al instante cualquier dato que otro
      // dispositivo hubiera guardado mientras tanto (p. ej. un fichaje de otro
      // empleado, o un cierre de jornada hecho por un encargado).
      (reconciled, meta) => {
        // Detectar registros que el servidor tenía en versión más nueva que
        // la que acabamos de subir — otro usuario modificó el mismo fichaje
        // mientras nosotros guardábamos. Emitir evento para mostrar aviso.
        if (reconciled?.records) {
          const localMap = new Map((merged.records || []).map(r => [r.id, r._upd]))
          const changed = (reconciled.records || []).filter(r => {
            const localUpd = localMap.get(r.id)
            return localUpd !== undefined && r._upd && r._upd !== localUpd
          })
          if (changed.length) {
            window.dispatchEvent(new CustomEvent('times-conflict', { detail: { count: changed.length } }))
          }
        }
        set(state => ({
          db: reconciled ? mergeDB(state.db, reconciled) : state.db,
          syncStatus: meta?.pending ? 'syncing' : 'synced',
          offlinePending: !!meta?.pending
        }))
      },
      () => set({ syncStatus: navigator.onLine ? 'error' : 'offline', offlinePending: true }),
      syncHint
    )
    return merged
  },

  dbLoading: false,

  dbRefreshPending: false,

  fetchDB: async (options = {}) => {
    const forceTables = options?.forceTables === true
    // Broadcast, postgres_changes y el sondeo de seguridad pueden coincidir.
    // Una sola descarga es suficiente; la siguiente notificacion o sondeo
    // recuperara cualquier cambio que llegue mientras esta sigue en curso.
    if (get().dbLoading) {
      // Un postgres_changes puede llegar mientras otra descarga sigue activa.
      // No se pierde: al terminar se repite una lectura forzada de tablas.
      if (forceTables) set({ dbRefreshPending: true })
      return
    }
    const { db } = get()
    set({ dbLoading: true })
    try {
      const tsResult = await cloudFetchTs()
      if (!tsResult.ok) {
        set({ syncStatus: 'error', syncError: tsResult.status })
        return
      }
      set({ syncError: null })
      // Comparar contra _serverTs (no db._ts): db._ts puede estar inflado por
      // Date.now() de guardados locales del encargado, haciendo que tsResult.ts
      // (updated_at del servidor) parezca "más viejo" y se salte la descarga.
      if (!forceTables && tsResult.ts && get()._serverTs && tsResult.ts <= get()._serverTs) {
        set({ syncStatus: 'synced', lastSyncTime: Date.now() })
        return
      }
      const { ok, data, status } = await cloudFetch(get()._serverTs)
      if (!ok) { set({ syncStatus: 'error', syncError: status }); return }
      if (!data) { set({ syncStatus: 'synced', lastSyncTime: Date.now() }); return }
      const merged = mergeDB(get().db, data)
      if (tsResult.ts && tsResult.ts > merged._ts) merged._ts = tsResult.ts
      if (tsResult.ts) merged._serverTs = tsResult.ts
      saveLocal(merged)
      // Actualizar _serverTs con el updated_at real del servidor para que la
      // próxima comparación use un valor que no esté inflado por guardados locales.
      set({ db: merged, _serverTs: tsResult.ts || Date.now(), syncStatus: 'synced', lastSyncTime: Date.now() })
      // Re-validate session against fresh data y refrescar user con datos actualizados
      // (e.g. obrasAsignadas cambiadas por el admin sin que el encargado haya vuelto a logearse)
      const ses = get().session
      if (ses?.user?.id) {
        const freshEmp = (merged.employees || []).find(e => e.id === ses.user.id)
        if (!freshEmp || freshEmp.baja) {
          get().logout()
        } else {
          const persistedSes = sanitizeSession({ ...ses, user: freshEmp })
          set({ session: { ...persistedSes, user: freshEmp } })
          try { localStorage.setItem('an_times_ses', JSON.stringify(persistedSes)) } catch {}
        }
      }
    } finally {
      set({ dbLoading: false })
      if (get().dbRefreshPending) {
        set({ dbRefreshPending: false })
        queueMicrotask(() => get().fetchDB({ forceTables: true }))
      }
    }
  },

  // ── Realtime Supabase ────────────────────────────────────────────────
  // El broadcast solo trae un aviso. postgres_changes incorpora la fila completa;
  // el fetch queda como respaldo si ese evento de tabla no llega.
  realtimeStatus: 'idle',
  _lastTableRealtimeAt: 0,
  initRealtime: () => {
    startRealtime(
      () => get().db,
      (event) => {
        if (event?.reason === 'reconnect') { get().fetchDB(); return }
        // Normally postgres_changes has already supplied the full row. Wait a
        // moment and only use the HTTP fetch as a fallback when no table event
        // arrived (publication/channel unavailable).
        setTimeout(() => {
          if (Date.now() - get()._lastTableRealtimeAt > 1500) get().fetchDB()
        }, 650)
      },
      () => get()._serverTs,
      (status) => set({ realtimeStatus: status })
    )
  },
  stopRealtime,

  // ── postgres_changes Realtime ────────────────────────────────────────
  initTableRealtime: () => {
    // postgres_changes ya incluye la fila completa: se incorpora localmente sin
    // gastar una nueva lectura HTTP de todas las tablas.
    startTableRealtime((changes) => {
      set({ _lastTableRealtimeAt: Date.now() })
      let merged = get().db
      let needsFallback = false
      for (const change of (changes || [])) {
        const patch = tableChangeToPatch(change.table, change.payload)
        if (!patch) { needsFallback = true; continue }
        merged = mergeDB(merged, patch)
      }
      if (merged !== get().db) {
        saveLocal(merged)
        set({ db: merged, syncStatus: 'synced', lastSyncTime: Date.now() })
        const ses = get().session
        if (ses?.user?.id) {
          const freshEmp = (merged.employees || []).find(e => e.id === ses.user.id)
          if (!freshEmp || freshEmp.baja) get().logout()
          else {
            const persistedSes = sanitizeSession({ ...ses, user: freshEmp })
            set({ session: { ...persistedSes, user: freshEmp } })
            try { localStorage.setItem('an_times_ses', JSON.stringify(persistedSes)) } catch {}
          }
        }
      }
      // Keep the safe HTTP fallback for exceptional incomplete DELETE payloads.
      if (needsFallback) get().fetchDB({ forceTables: true })
    })
  },
  stopTableRealtime,

  // ── Presencia ────────────────────────────────────────────────────────
  // Número de sesiones activas en este momento (admins + empleados).
  // Solo se muestra en el panel de admin.
  onlineCount: 0,
  initPresence: () => {
    const { session } = get()
    const userId = session?.user?.id || 'admin'
    startPresence(userId, (count) => set({ onlineCount: count }))
  },
  stopPresence,

  // ── Session ─────────────────────────────────────────────────────────
  session: (() => {
    if (!storedSes) return { user: null, isAdmin: false, isEnc: false, isJO: false }
    const localDB = loadLocal()
    if (storedSes.user) {
      const stillActive = (localDB.employees || []).some(e => e.id === storedSes.user.id && !e.baja)
      if (!stillActive) {
        try { localStorage.removeItem('an_times_ses') } catch {}
        return { user: null, isAdmin: false, isEnc: false, isJO: false }
      }
    }
    return _runtimeSession(storedSes, localDB)
  })(),

  setSession: ses => {
    const safe = sanitizeSession(ses)
    set({ session: ses?.user ? { ...safe, user: ses.user } : safe })
    try { localStorage.setItem('an_times_ses', JSON.stringify(safe)) } catch {}
  },

  logout: () => {
    authSignOut().catch(() => {})
    try { localStorage.removeItem('an_times_ses') } catch {}
    try { sessionStorage.removeItem('an_times_timer') } catch {}
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
    set({
      session: { user: null, isAdmin: false, isEnc: false, isJO: false },
      timer: { ws: 0, bs: 0, state: 'idle' },
      currentScreen: 'login',
      currentEmpTab: 'inicio',
      activeModal: null,
      modalData: null,
    })
  },

  // ── Timer ────────────────────────────────────────────────────────────
  timer: (() => {
    try {
      const raw = sessionStorage.getItem('an_times_timer')
      if (raw) return JSON.parse(raw)
    } catch {}
    return { ws: 0, bs: 0, state: 'idle' }
  })(),
  setTimer: timer => {
    try { sessionStorage.setItem('an_times_timer', JSON.stringify(timer)) } catch {}
    set({ timer })
  },
  updateTimer: partial => {
    set(s => {
      const timer = { ...s.timer, ...partial }
      try { sessionStorage.setItem('an_times_timer', JSON.stringify(timer)) } catch {}
      return { timer }
    })
  },

  // ── Navigation ───────────────────────────────────────────────────────
  currentScreen: (() => {
    if (!storedSes) return 'login'
    if (storedSes.isAdmin && !storedSes.user) return 'admin'
    if (storedSes.user) {
      const localDB = loadLocal()
      const ok = (localDB.employees || []).some(e => e.id === storedSes.user.id && !e.baja)
      if (!ok) return 'login'
      if (storedSes.isAdmin) return 'admin'
      return 'emp'
    }
    return 'login'
  })(),
  currentEmpTab: 'inicio',
  currentAdminPage: 'dashboard',
  navHistory: [],

  setScreen: (screen, noHistory) => {
    const prev = get().currentScreen
    if (!noHistory && prev !== screen) {
      set(s => ({ navHistory: [...s.navHistory, prev] }))
    }
    set({ currentScreen: screen })
  },

  goBack: () => {
    const { navHistory } = get()
    if (!navHistory.length) return
    const prev = navHistory[navHistory.length - 1]
    set(s => ({ currentScreen: prev, navHistory: s.navHistory.slice(0, -1) }))
  },

  setEmpTab: tab => set({ currentEmpTab: tab }),
  setAdminPage: page => set({ currentAdminPage: page }),

  // ── UI State ─────────────────────────────────────────────────────────
  isLoading: true,
  syncStatus: 'idle',
  syncError: null,
  lastSyncTime: null,
  offlinePending: false,   // hay datos locales pendientes de subir
  activeModal: null,
  modalData: null,

  setLoading: v => set({ isLoading: v }),
  setSyncStatus: v => set({ syncStatus: v }),
  openModal: (name, data = null) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  // ── Toasts ───────────────────────────────────────────────────────────
  toasts: [],
  toast: (msg, dur = 3000, type = '') => {
    const normalized = normalizeToastOptions(dur, type)
    const id = Date.now() + Math.random()
    set(s => ({ toasts: [...s.toasts, { id, msg, dur:normalized.duration, type:normalized.type }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), normalized.duration + 400)
  },
  toastOk:   (msg) => get().toast(msg, 3000, 'ok'),
  toastErr:  (msg) => get().toast(msg, 4000, 'err'),
  toastWarn: (msg) => get().toast(msg, 3500, 'warn'),

  // ── Confirm dialog ───────────────────────────────────────────────────
  confirmDialog: null,
  showConfirm: (msg, onConfirm) => set({ confirmDialog: { msg, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),
}))
