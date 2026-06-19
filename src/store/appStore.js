import { create } from 'zustand'
import { loadLocal, loadLocalAsync, mergeDB, saveLocal, cloudPush, cloudFetchSmart, initStorage, flushOfflineQueue } from '../services/dataService.js'
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
    const newDB = { ...get().db, ...(partial || {}), _ts: Date.now() }
    saveLocal(newDB)
    set({ db: newDB, syncStatus: 'syncing' })
    cloudPush(
      newDB,
      () => set({ syncStatus: 'synced' }),
      () => set({ syncStatus: 'error' }),
      () => { set({ syncStatus: 'error' }); get().toast('⚠️ Sin conexión — datos guardados localmente') }
    )
    return newDB
  },

  hydrateIDB: async () => {
    // Lee desde IndexedDB (más capacidad que localStorage) y actualiza el store
    const data = await loadLocalAsync()
    if (data && data._ts && data._ts > (get().db._ts || 0)) {
      set({ db: data })
    }
  },

  fetchDB: async () => {
    const { db } = get()
    const data = await cloudFetchSmart(db._ts)
    if (!data) { set({ syncStatus: 'error' }); return }
    if (data === 'no-change') { set({ syncStatus: 'synced' }); return }
    const shouldMerge = !db._ts || data._ts >= db._ts || (data.employees||[]).length !== (db.employees||[]).length
    if (shouldMerge) {
      const merged = mergeDB(INITIAL_DB, data)
      saveLocal(merged)
      set({ db: merged })
    }
    set({ syncStatus: 'synced' })
  },

  // ── Session ─────────────────────────────────────────────────────────
  session: storedSes || { user: null, isAdmin: false, isEnc: false, isJO: false },

  setSession: ses => {
    set({ session: ses })
    try { localStorage.setItem('an_times_ses', JSON.stringify(ses)) } catch {}
  },

  logout: () => {
    try { localStorage.removeItem('an_times_ses') } catch {}
    set({
      session: { user: null, isAdmin: false, isEnc: false, isJO: false },
      timer: { ws: 0, bs: 0, state: 'idle' },
      currentScreen: 'login',
      currentEmpTab: 'inicio'
    })
  },

  // ── Timer ────────────────────────────────────────────────────────────
  timer: { ws: 0, bs: 0, state: 'idle' },
  setTimer: timer => set({ timer }),
  updateTimer: partial => set(s => ({ timer: { ...s.timer, ...partial } })),

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
  activeModal: null,
  modalData: null,

  setLoading: v => set({ isLoading: v }),
  setSyncStatus: v => set({ syncStatus: v }),
  openModal: (name, data = null) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  // ── Toasts ───────────────────────────────────────────────────────────
  toasts: [],
  toast: (msg, dur = 3000) => {
    const id = Date.now() + Math.random()
    set(s => ({ toasts: [...s.toasts, { id, msg, dur }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), dur + 400)
  },

  // ── Confirm dialog (reemplaza window.confirm para mobile) ────────────
  confirmDialog: null,
  showConfirm: (msg, onConfirm) => set({ confirmDialog: { msg, onConfirm } }),
  closeConfirm: () => set({ confirmDialog: null }),
}))
