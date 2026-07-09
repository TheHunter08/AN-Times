import { create } from 'zustand'
import { loadLocal, mergeDB, saveLocal, cloudPush, cloudFetch, cloudFetchTs, startRealtime, stopRealtime, recordTombstones } from '../services/dataService.js'
import { signOut as authSignOut } from '../services/authService.js'
import { INITIAL_DB } from '../config/constants.js'

const storedSes = (() => {
  try { return JSON.parse(localStorage.getItem('an_times_ses') || 'null') } catch { return null }
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
  db: loadLocal(),
  // Último updated_at conocido del servidor. SOLO se actualiza tras un fetchDB exitoso,
  // nunca por guardados locales — evita que db._ts (inflado por Date.now()) bloquee la
  // detección de cambios remotos en fetchDB y en el receptor de Realtime.
  _serverTs: 0,

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
    set(state => {
      const partial = typeof partialOrFn === 'function' ? partialOrFn(state.db) : partialOrFn
      deleted = _diffDeleted(state.db, partial)
      // Registrar tombstones ANTES de subir: si un fetchDB (sondeo/realtime) gana
      // la carrera al push de este borrado, mergeDB ya sabe ignorar el id borrado
      // en vez de resucitarlo desde el servidor (que todavía no se ha enterado).
      recordTombstones(deleted)
      merged = { ...state.db, ...(partial || {}), _ts: Date.now() }
      if (merged.audit?.length > 300) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
        const recent = merged.audit.filter(a => new Date(a.ts).getTime() > cutoff)
        merged.audit = recent.length >= 50 ? recent : merged.audit.slice(-300)
      }
      saveLocal(merged)
      // offlinePending: true si no hay red, o si ya había un guardado pendiente anterior
      // (evita que el timer cada 30s lo resetee a false en señal débil, lo que hacía
      // parpadear el banner "Modo sin cobertura" entre cada tick de guardado).
      return { db: merged, syncStatus: navigator.onLine ? 'syncing' : 'offline', offlinePending: state.offlinePending || !navigator.onLine }
    })
    cloudPush(merged, deleted,
      // cloudPush ahora fusiona con el servidor antes de subir (ver _mergeWithServer
      // en dataService.js) y devuelve ese resultado reconciliado — lo incorporamos
      // aquí para que la UI local también vea al instante cualquier dato que otro
      // dispositivo hubiera guardado mientras tanto (p. ej. un fichaje de otro
      // empleado, o un cierre de jornada hecho por un encargado).
      (reconciled) => set(state => ({
        db: reconciled ? mergeDB(state.db, reconciled) : state.db,
        syncStatus: 'synced',
        offlinePending: false
      })),
      () => set({ syncStatus: navigator.onLine ? 'error' : 'offline', offlinePending: true })
    )
    return merged
  },

  dbLoading: false,

  fetchDB: async () => {
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
      if (tsResult.ts && get()._serverTs && tsResult.ts <= get()._serverTs) {
        set({ syncStatus: 'synced', lastSyncTime: Date.now() })
        return
      }
      const { ok, data, status } = await cloudFetch()
      if (!ok) { set({ syncStatus: 'error', syncError: status }); return }
      if (!data) { set({ syncStatus: 'synced', lastSyncTime: Date.now() }); return }
      const merged = mergeDB(get().db, data)
      if (tsResult.ts && tsResult.ts > merged._ts) merged._ts = tsResult.ts
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
          const updatedSes = { ...ses, user: freshEmp }
          set({ session: updatedSes })
          try { localStorage.setItem('an_times_ses', JSON.stringify(updatedSes)) } catch {}
        }
      }
    } finally {
      set({ dbLoading: false })
    }
  },

  // ── Realtime Supabase ────────────────────────────────────────────────
  // El broadcast solo trae un aviso ("algo cambió"), no los datos — al
  // recibirlo pedimos los datos con fetchDB(), que ya sabe no descargar nada
  // si resulta que no hay nada nuevo (comprueba el timestamp primero).
  initRealtime: () => {
    startRealtime(
      () => get().db,
      () => { get().fetchDB() },
      () => get()._serverTs
    )
  },
  stopRealtime,

  // ── Session ─────────────────────────────────────────────────────────
  session: (() => {
    if (!storedSes) return { user: null, isAdmin: false, isEnc: false, isJO: false }
    if (storedSes.user) {
      const localDB = loadLocal()
      const stillActive = (localDB.employees || []).some(e => e.id === storedSes.user.id && !e.baja)
      if (!stillActive) {
        try { localStorage.removeItem('an_times_ses') } catch {}
        return { user: null, isAdmin: false, isEnc: false, isJO: false }
      }
    }
    return storedSes
  })(),

  setSession: ses => {
    set({ session: ses })
    try { localStorage.setItem('an_times_ses', JSON.stringify(ses)) } catch {}
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
    const id = Date.now() + Math.random()
    set(s => ({ toasts: [...s.toasts, { id, msg, dur, type }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), dur + 400)
  },
  toastOk:   (msg) => get().toast(msg, 3000, 'ok'),
  toastErr:  (msg) => get().toast(msg, 4000, 'err'),
  toastWarn: (msg) => get().toast(msg, 3500, 'warn'),

  // ── Confirm dialog ───────────────────────────────────────────────────
  confirmDialog: null,
  showConfirm: (msg, onConfirm) => set({ confirmDialog: { msg, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),
}))
