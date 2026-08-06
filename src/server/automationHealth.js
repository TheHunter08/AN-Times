const DEFAULT_MAX_AGE_MS = Object.freeze({
  reminders: 90 * 60 * 1000,
  autoclose: 90 * 60 * 1000,
  reports: 26 * 60 * 60 * 1000,
})

export function createAutomationRun(job, {
  status = 'ok',
  startedAt = Date.now(),
  finishedAt = Date.now(),
  checked = 0,
  processed = 0,
  delivered = 0,
  error = null,
  runId,
} = {}) {
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(finishedAt).getTime()
  return {
    job,
    runId:runId || `${job}_${Math.max(0, endMs).toString(36)}`,
    status:status === 'error' ? 'error' : 'ok',
    startedAt:new Date(startMs).toISOString(),
    finishedAt:new Date(endMs).toISOString(),
    durationMs:Number.isFinite(endMs - startMs) ? Math.max(0, endMs - startMs) : 0,
    checked:Math.max(0, Number(checked) || 0),
    processed:Math.max(0, Number(processed) || 0),
    delivered:Math.max(0, Number(delivered) || 0),
    error:error ? String(error).slice(0, 240) : null,
  }
}

export function mergeAutomationHealth(db, run) {
  return {
    ...(db || {}),
    config:{
      ...(db?.config || {}),
      automationHealth:{ ...(db?.config?.automationHealth || {}), [run.job]:run },
    },
  }
}

export function evaluateAutomationRun(run, {
  now = Date.now(),
  maxAgeMs,
} = {}) {
  if (!run?.finishedAt) return { state:'unknown', healthy:false, label:'Sin ejecuciones registradas' }
  if (run.status === 'error') return { state:'error', healthy:false, label:'La última ejecución falló' }
  const finishedAt = new Date(run.finishedAt).getTime()
  const allowedAge = maxAgeMs ?? DEFAULT_MAX_AGE_MS[run.job] ?? 26 * 60 * 60 * 1000
  if (!Number.isFinite(finishedAt) || now - finishedAt > allowedAge) {
    return { state:'stale', healthy:false, label:'Ejecución atrasada' }
  }
  return { state:'healthy', healthy:true, label:'Funcionando' }
}

export function automationHealthList(health, options) {
  return ['reminders', 'autoclose', 'reports'].map(job => {
    const run = health?.[job] || null
    return { job, run, ...evaluateAutomationRun(run, options) }
  })
}
