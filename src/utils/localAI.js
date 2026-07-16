// ── IA local offline (WebLLM) ──────────────────────────────────────────────
// Modelo real ejecutándose en el propio dispositivo vía WebGPU — funciona sin
// conexión tras la primera descarga (se cachea en el navegador). Pensado para
// obras sin cobertura: una vez descargado, el chat de Times AI responde con un
// modelo generativo real, no solo reglas fijas.
//
// Requiere WebGPU (Chrome/Edge Android 121+, Chrome/Edge desktop recientes).
// Si no está disponible, la app debe seguir usando el asistente por reglas
// (aiAssistant.js) — este módulo nunca debe ser obligatorio para arrancar.

const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
const CONSENT_KEY = 'an_localai_consent'
const WIFI_ONLY_KEY = 'an_localai_wifi_only'
const ESTIMATED_MODEL_BYTES = 430 * 1024 * 1024

export const LOCAL_MODEL_INFO = {
  id: MODEL_ID,
  label: 'Qwen 2.5 · 0.5B',
  estimatedBytes: ESTIMATED_MODEL_BYTES,
}

let engine = null
let loadingPromise = null

export function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function hasLocalAIConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === '1' } catch { return false }
}

export function setLocalAIConsent(v) {
  try { localStorage.setItem(CONSENT_KEY, v ? '1' : '0') } catch {}
}

export function getLocalAIWifiOnly() {
  try { return localStorage.getItem(WIFI_ONLY_KEY) !== '0' } catch { return true }
}

export function setLocalAIWifiOnly(v) {
  try { localStorage.setItem(WIFI_ONLY_KEY, v ? '1' : '0') } catch {}
}

export function formatModelBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function modelCacheKeys(keys) {
  return keys.filter(key => key.toLowerCase().includes('webllm') || key.includes(MODEL_ID))
}

// true si el modelo ya está cacheado en este dispositivo (no haría falta descargar de nuevo)
export async function isModelCached() {
  try {
    if (!('caches' in window)) return false
    const keys = await caches.keys()
    return modelCacheKeys(keys).length > 0
  } catch { return false }
}

export async function getLocalModelStorageInfo() {
  try {
    if (!('caches' in window)) return { cached:false, bytes:0, estimated:false, cacheCount:0 }
    const keys = modelCacheKeys(await caches.keys())
    if (!keys.length) return { cached:false, bytes:0, estimated:false, cacheCount:0 }
    let headerBytes = 0
    for (const key of keys) {
      const cache = await caches.open(key)
      const requests = await cache.keys()
      for (const request of requests) {
        const response = await cache.match(request)
        const length = Number(response?.headers?.get('content-length') || 0)
        if (Number.isFinite(length) && length > 0) headerBytes += length
      }
    }
    return { cached:true, bytes:headerBytes || ESTIMATED_MODEL_BYTES, estimated:headerBytes === 0, cacheCount:keys.length }
  } catch {
    const cached = await isModelCached()
    return { cached, bytes:cached ? ESTIMATED_MODEL_BYTES : 0, estimated:cached, cacheCount:cached ? 1 : 0 }
  }
}

export function getLocalModelNetworkState() {
  if (typeof navigator === 'undefined') return { allowed:true, detectable:false, label:'Red no detectable' }
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!connection) return { allowed:true, detectable:false, label:'Red no detectable' }
  if (connection.saveData) return { allowed:false, detectable:true, label:'Ahorro de datos activo' }
  if (connection.type) {
    const wifi = connection.type === 'wifi' || connection.type === 'ethernet'
    return { allowed:wifi, detectable:true, label:wifi ? 'Wi‑Fi / cable' : 'Red móvil' }
  }
  return { allowed:true, detectable:false, label:connection.effectiveType ? `Conexión ${connection.effectiveType.toUpperCase()}` : 'Red no detectable' }
}

// Carga (o reutiliza) el motor. onProgress recibe { progress: 0-1, text }.
export async function loadLocalModel(onProgress) {
  if (engine) return engine
  if (loadingPromise) return loadingPromise
  if (!isWebGPUSupported()) throw new Error('WebGPU no soportado en este dispositivo')
  const cached = await isModelCached()
  const network = getLocalModelNetworkState()
  if (!cached && getLocalAIWifiOnly() && !network.allowed) {
    throw new Error(`Descarga pausada: ${network.label}. Desactiva "Solo Wi‑Fi" para continuar.`)
  }

  loadingPromise = (async () => {
    const webllm = await import('@mlc-ai/web-llm')
    const worker = new Worker(new URL('../workers/localAI.worker.js', import.meta.url), { type: 'module' })
    const eng = await webllm.CreateWebWorkerMLCEngine(worker, MODEL_ID, {
      initProgressCallback: (report) => {
        onProgress?.({ progress: report.progress ?? 0, text: report.text || '' })
      },
    })
    engine = eng
    return eng
  })()

  try {
    return await loadingPromise
  } catch (e) {
    loadingPromise = null
    throw e
  }
}

export function isLocalModelReady() {
  return !!engine
}

// Pregunta al modelo local. `context` es texto plano con los datos reales del
// empleado (ya calculados por aiAssistant/time.js) para que el modelo responda
// grounded en cifras reales en vez de inventarlas.
export async function askLocalModel(question, context) {
  if (!engine) throw new Error('Modelo local no cargado')
  const messages = [
    {
      role: 'system',
      content: `Eres "Times AI", el asistente de la app de fichaje laboral TIMES INC. Respondes SIEMPRE en español, de forma breve (máximo 3-4 frases), cercana y solo sobre jornada laboral, horas, vacaciones y fichajes. Usa EXCLUSIVAMENTE los datos que te doy a continuación; si no tienes el dato, dilo en vez de inventarlo. No des consejos legales ni de otros temas.\n\nDatos actuales del empleado:\n${context}`,
    },
    { role: 'user', content: question },
  ]
  const reply = await engine.chat.completions.create({ messages, temperature: 0.4, max_tokens: 220 })
  return reply.choices?.[0]?.message?.content?.trim() || '🤖 No he podido generar una respuesta, prueba a reformular la pregunta.'
}

export function unloadLocalModel() {
  try { engine?.unload?.() } catch {}
  engine = null
  loadingPromise = null
}

export async function clearLocalModelCache() {
  unloadLocalModel()
  if (!('caches' in window)) return 0
  const keys = await caches.keys()
  const modelKeys = modelCacheKeys(keys)
  await Promise.all(modelKeys.map(key => caches.delete(key)))
  setLocalAIConsent(false)
  return modelKeys.length
}
