import { useSyncExternalStore } from 'react'
import { SB_URL, SB_ANON } from '../config/constants.js'

const listeners = new Set()
let snapshot = { online: true, checking: false, lastChecked: 0 }
let probeFlight = null
let failures = 0
let started = false
let retryTimer = null
let confirmTimer = null

function publish(next) {
  const merged = { ...snapshot, ...next }
  if (
    merged.online === snapshot.online &&
    merged.checking === snapshot.checking &&
    merged.lastChecked === snapshot.lastChecked
  ) return
  snapshot = merged
  listeners.forEach(listener => listener())
}

// navigator.onLine solo indica que existe una interfaz de red. En iOS puede
// quedarse en false incluso con Internet después de cambiar entre Wi-Fi y datos.
// Este probe consulta directamente el backend y solo confirma "sin cobertura"
// cuando una petición real tampoco consigue salir.
export function probeConnectivity() {
  if (probeFlight) return probeFlight
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  publish({ checking: true })

  probeFlight = fetch(`${SB_URL}/rest/v1/app_data?select=id&limit=1`, {
    method: 'GET',
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
    cache: 'no-store',
    signal: controller.signal,
  }).then(() => {
    failures = 0
    if (confirmTimer && typeof window !== 'undefined') window.clearTimeout(confirmTimer)
    confirmTimer = null
    publish({ online: true, checking: false, lastChecked: Date.now() })
    return true
  }).catch(() => {
    failures += 1
    // Exigimos dos fallos reales consecutivos incluso si navigator.onLine es
    // false: así un cambio Wi-Fi↔datos o un timeout aislado no provoca el aviso.
    const confirmedOffline = failures >= 2
    publish({
      online: confirmedOffline ? false : snapshot.online,
      checking: false,
      lastChecked: Date.now(),
    })
    if (!confirmedOffline && typeof window !== 'undefined' && !confirmTimer) {
      confirmTimer = window.setTimeout(() => {
        confirmTimer = null
        probeConnectivity()
      }, 1200)
    }
    return false
  }).finally(() => {
    clearTimeout(timeout)
    probeFlight = null
  })

  return probeFlight
}

function startMonitoring() {
  if (started || typeof window === 'undefined') return
  started = true

  const verify = () => { probeConnectivity() }
  const onOnline = () => {
    failures = 0
    publish({ online: true, checking: true })
    probeConnectivity()
  }

  // El evento offline pasa a ser una señal para verificar, no una sentencia.
  window.addEventListener('offline', verify)
  window.addEventListener('online', onOnline)
  if (navigator.onLine === false) verify()

  retryTimer = window.setInterval(() => {
    if (!snapshot.online || navigator.onLine === false) verify()
  }, 10000)
}

function subscribe(listener) {
  listeners.add(listener)
  startMonitoring()
  return () => listeners.delete(listener)
}

export function getConnectivitySnapshot() { return snapshot }

export function useConnectivity() {
  return useSyncExternalStore(subscribe, getConnectivitySnapshot, getConnectivitySnapshot)
}

export function _resetConnectivityForTests() {
  if (retryTimer && typeof window !== 'undefined') window.clearInterval(retryTimer)
  if (confirmTimer && typeof window !== 'undefined') window.clearTimeout(confirmTimer)
  retryTimer = null
  confirmTimer = null
  probeFlight = null
  failures = 0
  started = false
  snapshot = { online: true, checking: false, lastChecked: 0 }
  listeners.clear()
}
