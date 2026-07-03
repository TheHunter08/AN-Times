import { create } from 'zustand'
import { loadLocal, mergeDB, saveLocal, cloudPush, cloudFetch, cloudFetchTs, startRealtime, stopRealtime } from '../services/dataService.js'
import { signOut as authSignOut } from '../services/authService.js'
import { INITIAL_DB } from '../config/constants.js'

const storedSes = (() => {
  try { return JSON.parse(localStorage.getItem('an_times_ses') || 'null') } catch { return null }
})()

export const useAppStore = create((set, get) => ({
  // ── DB ──────────────────────────────────────────────────────────────
  db: loadLocal(),

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
    set(state => {
      const partial = typeof partialOrFn === 'function' ? partialOrFn(state.db) : partialOrFn
      merged = { ...state.db, ...(partial || {}), _ts: Date.now() }
      if (merged.audit?.length > 300) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
        const recent = merged.audit.filter(a => new Date(a.ts).getTime() > cutoff)
        merged.audit = recent.length >= 50 ? recent : merged.audit.slice(-300)
      }
      saveLocal(merged)
      return { db: merged, syncStatus: navigator.onLine ? 'syncing' : 'offline', offlinePending: !navigator.onLine }
    })
    cloudPush(merged,
      () => set({ syncStatus: 'synced', offlinePending: false }),
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
      if (tsResult.ts && get().db._ts && tsResult.ts <= get().db._ts) {
        set({ syncStatus: 'synced', lastSyncTime: Date.now() })
        return
      }
      const { ok, data, status } = await cloudFetch()
      if (!ok) { set({ syncStatus: 'error', syncError: status }); return }
      if (!data) { set({ syncStatus: 'synced', lastSyncTime: Date.now() }); return }
      const merged = mergeDB(get().db, data)
      // El `_ts` embebido en el JSON puede venir "viejo" (p.ej. tras un guardado
      // offline, donde se fijó al momento del guardado, no al de la sincronización
      // real). Si nos quedamos solo con ese valor, tsResult.ts (el updated_at real
      // de la fila) sigue siendo mayor en cada fetchDB() futuro y la app repite un
      // fetch+merge completo sin fin en vez de usar el atajo de la línea de arriba.
      if (tsResult.ts && tsResult.ts > merged._ts) merged._ts = tsResult.ts
      saveLocal(merged)
      set({ db: merged, syncStatus: 'synced', lastSyncTime: Date.now() })
      // Re-validate session against fresh data
      const ses = get().session
      if (ses?.user?.id) {
        const stillActive = (merged.employees || []).some(e => e.id === ses.user.id && !e.baja)
        if (!stillActive) {
          get().logout()
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
      () => { get().fetchDB() }
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
