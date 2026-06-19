/**
 * IndexedDB wrapper para TIMES INC.
 * Almacén principal: kv → clave 'db' con el objeto completo.
 * Cola offline:     pendingPush → snapshots pendientes de enviar a Firebase.
 *
 * Ventaja vs localStorage: sin límite práctico de tamaño, async,
 * no bloquea el hilo principal, sobrevive a "Borrar caché del sitio".
 */

const DB_NAME    = 'times-inc-idb'
const DB_VERSION = 1
const STORE_KV   = 'kv'
const STORE_PUSH = 'pendingPush'
const KEY_DB     = 'db'

let _idb = null

function openIDB() {
  if (_idb) return Promise.resolve(_idb)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_KV))   db.createObjectStore(STORE_KV)
      if (!db.objectStoreNames.contains(STORE_PUSH)) {
        const s = db.createObjectStore(STORE_PUSH, { keyPath: 'id', autoIncrement: true })
        s.createIndex('ts', 'ts')
      }
    }
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb) }
    req.onerror   = e => reject(e.target.error)
  })
}

// ─── Almacén principal (KV) ────────────────────────────────────────────────────

export async function idbLoad() {
  try {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_KV, 'readonly')
      const req = tx.objectStore(STORE_KV).get(KEY_DB)
      req.onsuccess = e => resolve(e.target.result ?? null)
      req.onerror   = e => reject(e.target.error)
    })
  } catch { return null }
}

export async function idbSave(data) {
  try {
    const db = await openIDB()
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_KV, 'readwrite')
      const req = tx.objectStore(STORE_KV).put(data, KEY_DB)
      req.onsuccess = () => resolve()
      req.onerror   = e => reject(e.target.error)
    })
  } catch {}
}

// ─── Cola offline (pendingPush) ────────────────────────────────────────────────

export async function idbQueuePush(snapshot) {
  try {
    const db = await openIDB()
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_PUSH, 'readwrite')
      const req = tx.objectStore(STORE_PUSH).add({ ts: Date.now(), snapshot })
      req.onsuccess = () => resolve()
      req.onerror   = e => reject(e.target.error)
    })
  } catch {}
}

export async function idbGetPendingPushes() {
  try {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_PUSH, 'readonly')
      const req = tx.objectStore(STORE_PUSH).getAll()
      req.onsuccess = e => resolve(e.target.result ?? [])
      req.onerror   = e => reject(e.target.error)
    })
  } catch { return [] }
}

export async function idbClearPendingPushes() {
  try {
    const db = await openIDB()
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_PUSH, 'readwrite')
      const req = tx.objectStore(STORE_PUSH).clear()
      req.onsuccess = () => resolve()
      req.onerror   = e => reject(e.target.error)
    })
  } catch {}
}

// ─── Migración desde localStorage ─────────────────────────────────────────────

export async function migrateFromLocalStorage(mergeDB, INITIAL_DB) {
  try {
    const existing = await idbLoad()
    if (existing) return // Ya migrado
    const raw = localStorage.getItem('an_times_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    await idbSave(mergeDB(INITIAL_DB, parsed))
  } catch {}
}
