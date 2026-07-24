import { create } from 'zustand'
import { loadLocal, mergeDB, saveLocal, cloudPush, cloudFetch, cloudFetchTs, startRealtime, stopRealtime, recordTombstones, mergePendingDeletes, startPresence, stopPresence, startTableRealtime, stopTableRealtime, persistRecordRow, tableChangeToPatch, detachPushUser } from '../services/dataServiceV2.js'
import { signOut as authSignOut } from '../services/authService.js'
import { INITIAL_DB } from '../config/constants.js'
import { sanitizeSession } from '../utils/sessionSecurity.js'
import { normalizeToastOptions } from '../utils/toastOptions.js'
import { pruneDbRetention } from '../utils/dbRetention.js'
import { buildSyncHint, withForcedSyncIds } from '../services/tableSyncPlan.js'
import { clearPinToken } from '../utils/pinAuthToken.js'

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

// isAdmin/isEnc/isJO NUNCA deben venir de lo que ya traía el objeto de sesión
// (persistido en localStorage, editable desde devtools, o simplemente una
// copia en memoria desactualizada) — se recalculan siempre a partir del rol
// real del empleado en la BD, la única fuente de verdad de permisos. Sin
// esto, un empleado normal podía poner isAdmin:true en su propia sesión
// guardada y entrar directo al panel de administración completo.
function _roleFlagsFromProfile(profile) {
  // Mismo criterio que doLogin en LoginV2.tsx: un jefe de obra cuenta como
  // isAdmin también (decisión de negocio existente, no algo nuevo de este
  // fix) — omitirlo aquí habría revertido a un JO a la pantalla de empleado
  // en el siguiente fetch/realtime tras iniciar sesión.
  const role = profile?.role
  return {
    isAdmin: role === 'admin' || role === 'jefe_obra' || !!profile?.isAdmin,
    isEnc: role === 'encargado' || !!profile?.isEnc,
    isJO: role === 'jefe_obra' || !!profile?.isJO,
  }
}

function _runtimeSession(session, db) {
  const safe = sanitizeSession(session)
  if (!safe.user?.id) return safe
  const profile = (db?.employees || []).find(employee => employee.id === safe.user.id && !employee.baja)
  return profile ? { ...safe, user: profile, ..._roleFlagsFromProfile(profile) } : safe
}

// Calculado una sola vez al arrancar y reutilizado tanto por `session` como
// por `currentScreen` — antes cada uno repetía su propia versión de "¿es
// admin?" leyendo storedSes.isAdmin directamente, sin pasar por
// _runtimeSession, así que currentScreen podía mandar a la pantalla de
// admin a una sesión cuyo rol real ya no lo era.
const initialSession = (() => {
  if (!storedSes) return { user: null, isAdmin: false, isEnc: false, isJO: false }
  if (storedSes.user) {
    const stillActive = (initialDb.employees || []).some(e => e.id === storedSes.user.id && !e.baja)
    if (!stillActive) {
      try { localStorage.removeItem('an_times_ses') } catch {}
      return { user: null, isAdmin: false, isEnc: false, isJO: false }
    }
  }
  return _runtimeSession(storedSes, initialDb)
})()

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

  saveDB: (partialOrFn, options = {}) => {
    // Usar updater de Zustand para leer siempre el estado más reciente,
    // evitando sobrescrituras cuando dos saves se encadenan rápido o llega un sync de realtime
    let merged
    let deleted
    let syncHint
    let priorityRecords = []
    let skipNetwork = false
    set(state => {
      const partial = typeof partialOrFn === 'function' ? partialOrFn(state.db) : partialOrFn
      syncHint = withForcedSyncIds(buildSyncHint(state.db, partial), options.forceSyncIds)
      // Una escritura crítica puede haber llegado por Realtime antes de que
      // este updater se ejecute. En ese caso `before` y `partial` ya parecen
      // iguales y el diff automático no incluiría el registro en el blob.
      // Los ids forzados mantienen tabla y blob coherentes aun en esa carrera.
      if (Array.isArray(partial?.records)) {
        const changedRecordIds = new Set(syncHint.recordIds)
        priorityRecords = partial.records.filter(record => record?.id && changedRecordIds.has(String(record.id)))
      }
      deleted = mergePendingDeletes(_diffDeleted(state.db, partial), options.deleted)
      merged = { ...state.db, ...(partial || {}), _ts: Date.now() }
      const retained = pruneDbRetention(merged)
      merged = retained.db
      deleted = mergePendingDeletes(deleted, retained.deleted)
      if (retained.deleted) {
        const retentionKeys = Object.keys(retained.deleted)
        syncHint.changedKeys = [...new Set([...syncHint.changedKeys, ...retentionKeys])]
        for (const key of retentionKeys) syncHint.entityIds[key] ||= []
      }
      // Incluye los tombstones de la retencion automatica: asi las filas
      // antiguas tampoco resucitan desde app_entities ni consumen cuota.
      recordTombstones(deleted)
      saveLocal(merged)
      skipNetwork = !syncHint?.changedKeys?.length && !deleted
      if (skipNetwork) return { db:merged }
      // offlinePending: true si no hay red, o si ya había un guardado pendiente anterior
      // (evita que el timer cada 30s lo resetee a false en señal débil, lo que hacía
      // parpadear el banner "Modo sin cobertura" entre cada tick de guardado).
      return { db: merged, syncStatus: navigator.onLine ? 'syncing' : 'offline', offlinePending: state.offlinePending || !navigator.onLine }
    })
    // No generar tráfico ni reescribir el blob cuando un formulario entrega el
    // mismo valor que ya estaba guardado.
    if (skipNetwork) return merged
    // El fichaje concreto viaja directamente a la tabla normalizada para que
    // Realtime lo publique sin esperar a la reconciliación del blob completo.
    // No se espera esta promesa: la UI y el guardado local ya son inmediatos y
    // cloudPush mantiene la cola offline como respaldo si la red falla.
    if (!options.skipPriorityPersist) {
      for (const record of priorityRecords) persistRecordRow(record).catch(() => {})
    }
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
          // isAdmin/isEnc/isJO recalculados desde freshEmp.role (no desde `ses`,
          // que puede llevar el rol con el que se inició sesión) — si un admin
          // cambia el rol de este empleado, el cambio aplica en cuanto sincroniza.
          const persistedSes = sanitizeSession({ ...ses, user: freshEmp, ..._roleFlagsFromProfile(freshEmp) })
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
            const persistedSes = sanitizeSession({ ...ses, user: freshEmp, ..._roleFlagsFromProfile(freshEmp) })
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
  session: initialSession,

  setSession: ses => {
    const safe = sanitizeSession(ses)
    // Igual que _runtimeSession: el rol se recalcula desde el empleado real,
    // nunca desde lo que trajera `ses` (aunque en el login normal ya venga
    // bien formado, esto cierra cualquier ruta futura que llame setSession
    // con un objeto construido a mano).
    const roleFlags = ses?.user?.id ? _roleFlagsFromProfile(ses.user) : {}
    const withRole = { ...safe, ...roleFlags }
    set({ session: ses?.user ? { ...withRole, user: ses.user } : withRole })
    try { localStorage.setItem('an_times_ses', JSON.stringify(withRole)) } catch {}
  },

  logout: () => {
    const userId = get().session?.user?.id
    if (userId) detachPushUser(userId).catch(() => {})
    authSignOut().catch(() => {})
    // Sesión de Supabase asociada a un login por PIN (ver api/pin-login.js) —
    // un dispositivo compartido no debe conservar la identidad del empleado
    // que acaba de cerrar sesión para las peticiones del siguiente.
    clearPinToken()
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
    // initialSession ya viene con isAdmin recalculado desde el perfil real
    // (_roleFlagsFromProfile) — nunca desde storedSes.isAdmin directamente.
    // Mismo criterio que doLogin en LoginV2.tsx: solo isAdmin (que ya
    // incluye jefe_obra) manda directo a 'admin'; un encargado (isEnc) o un
    // empleado normal arrancan siempre en 'emp', igual que al iniciar sesión
    // — pueden pasar a 'admin' voluntariamente con el botón del panel.
    return initialSession.isAdmin ? 'admin' : (initialSession.user ? 'emp' : 'login')
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
