// Limpieza de compatibilidad para versiones antiguas que llegaron a guardar
// un JWT personalizado del login por PIN. El flujo actual no crea, solicita,
// almacena ni inyecta tokens: el PIN mantiene únicamente la sesión local.
const STORAGE_KEY = 'an_times_pin_jwt'
const IDB_NAME = 'times-inc-sync'
const IDB_STORE = 'q'
const IDB_KEY = 'pin_auth_token'

async function deleteLegacyIndexedDbToken() {
  if (typeof indexedDB === 'undefined') return
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite')
    transaction.objectStore(IDB_STORE).delete(IDB_KEY)
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export function clearPinToken() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  deleteLegacyIndexedDbToken().catch(() => {})
}
