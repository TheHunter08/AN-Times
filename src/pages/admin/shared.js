export async function callSendPushAll(titleText, bodyText, targetValue) {
  const headers = { 'Content-Type': 'application/json' }
  const secret = import.meta.env.VITE_PUSH_SECRET
  if (secret) headers['Authorization'] = `Bearer ${secret}`
  const tgt = (targetValue === 'all' || targetValue === 'activos') ? targetValue : { role: targetValue }
  const res = await fetch('/api/send-push-all', {
    method: 'POST', headers,
    body: JSON.stringify({ title: titleText, body: bodyText, url: '/', target: tgt })
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...json }
}

export function showPushToast(json, toast) {
  if (!json.ok) {
    toast('Error: ' + (json.error || json.status), 4000, 'err')
  } else if (json.sent === 0 && (json.noSub ?? 0) > 0) {
    toast(`Ningún empleado tiene push activado (${json.noSub} sin suscripción)`, 4000, 'warn')
  } else {
    const extra = [
      json.failed > 0 ? `${json.failed} fallaron` : '',
      json.noSub  > 0 ? `${json.noSub} sin push`  : '',
    ].filter(Boolean).join(' · ')
    toast(`Enviado a ${json.sent ?? 0} empleado${json.sent !== 1 ? 's' : ''}${extra ? ` · ${extra}` : ''}`, 3000, 'ok')
  }
}
