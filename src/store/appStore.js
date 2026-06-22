import { create } from 'zustand'
import { loadLocal, mergeDB, saveLocal, cloudPush, cloudFetch, cloudFetchTs, startRealtime, stopRealtime } from '../services/dataService.js'
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

  saveDB: (partial) => {
    const merged = { ...get().db, ...(partial || {}), _ts: Date.now() }
    if (merged.audit?.length > 300) merged.audit = merged.audit.slice(-300)
    saveLocal(merged)
    set({ db: merged, syncStatus: 'syncing' })
    cloudPush(merged, () => set({ syncStatus: 'synced' }), () => set({ syncStatus: 'error' }))
    return merged
  },

  fetchDB: async () => {
    const { db } = get()
    const tsResult = await cloudFetchTs()
    if (!tsResult.ok) {
      set({ syncStatus: 'error', syncError: tsResult.status })
      return
    }
    set({ syncError: null })
    if (tsResult.ts && db._ts && tsResult.ts <= db._ts) {
      set({ syncStatus: 'synced', lastSyncTime: Date.now() })
      return
    }
    const { ok, data, status } = await cloudFetch()
    if (!ok) { set({ syncStatus: 'error', syncError: status }); return }
    if (!data) { set({ syncStatus: 'synced', lastSyncTime: Date.now() }); return }
    const merged = mergeDB(INITIAL_DB, data)
    saveLocal(merged)
    set({ db: merged, syncStatus: 'synced', lastSyncTime: Date.now() })
  },

  // ── Realtime Supabase ────────────────────────────────────────────────
  initRealtime: () => {
    startRealtime(
      () => get().db,
      (incoming) => {
        const merged = mergeDB(INITIAL_DB, incoming)
        saveLocal(merged)
        set({ db: merged, syncStatus: 'synced', lastSyncTime: Date.now() })
      }
    )
  },
  stopRealtime,

  // ── Session ─────────────────────────────────────────────────────────
  session: storedSes || { user: null, isAdmin: false, isEnc: false, isJO: false },

  setSession: ses => {
    set({ session: ses })
    try { localStorage.setItem('an_times_ses', JSON.stringify(ses)) } catch {}
  },

  logout: () => {
    try { localStorage.removeItem('an_times_ses') } catch {}
    try { sessionStorage.removeItem('an_times_timer') } catch {}
    set({
      session: { user: null, isAdmin: false, isEnc: false, isJO: false },
      timer: { ws: 0, bs: 0, state: 'idle' },
      currentScreen: 'login',
      currentEmpTab: 'inicio'
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
    if (storedSes.user) return 'emp'
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
