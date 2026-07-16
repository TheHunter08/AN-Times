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

// true si el modelo ya está cacheado en este dispositivo (no haría falta descargar de nuevo)
export async function isModelCached() {
  try {
    if (!('caches' in window)) return false
    const keys = await caches.keys()
    return keys.some(k => k.includes('webllm') || k.includes(MODEL_ID))
  } catch { return false }
}

// Carga (o reutiliza) el motor. onProgress recibe { progress: 0-1, text }.
export async function loadLocalModel(onProgress) {
  if (engine) return engine
  if (loadingPromise) return loadingPromise
  if (!isWebGPUSupported()) throw new Error('WebGPU no soportado en este dispositivo')

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
  const modelKeys = keys.filter(key => key.toLowerCase().includes('webllm') || key.includes(MODEL_ID))
  await Promise.all(modelKeys.map(key => caches.delete(key)))
  setLocalAIConsent(false)
  return modelKeys.length
}
