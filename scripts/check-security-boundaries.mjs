import { readFile } from 'node:fs/promises'

const serverFiles = [
  'api/backup.js',
  'api/cron-reminders.js',
  'api/migrate-to-tables.js',
  'api/patch-pins.js',
  'api/send-push-all.js',
  'api/sendpush.js',
  'api/sync-ping.js',
  'api/verify-cierre.js',
  'api/whatsapp-webhook.js',
]
const apiHandlerFiles = [...serverFiles, 'api/pin-login.js', 'api/send-whatsapp.js']

const failures = []
for (const file of serverFiles) {
  const source = await readFile(file, 'utf8')
  if (!source.includes('SB_SERVICE_KEY')) failures.push(`${file}: no contempla SB_SERVICE_KEY`)
}

for (const file of apiHandlerFiles) {
  const source = await readFile(file, 'utf8')
  if (!source.includes("from './_response.js'")) failures.push(`${file}: no importa el endurecimiento común de respuestas`)
  if (!source.includes('hardenApiResponse(res)')) failures.push(`${file}: no desactiva caché ni indexación en respuestas API`)
}

const whatsappWebhook = await readFile('api/whatsapp-webhook.js', 'utf8')
if ((whatsappWebhook.match(/_upd:\s*now/g) || []).length < 4) failures.push('whatsapp-webhook.js: alguna mutación de fichaje no refresca _upd')
for (const forbidden of ['emp: emp.name', 'saveAppData(db)', 'error: e.message']) {
  if (whatsappWebhook.includes(forbidden)) failures.push(`whatsapp-webhook.js: exposición o persistencia insegura detectada (${forbidden})`)
}

const authPolicies = await readFile('supabase/policies_auth.sql', 'utf8')
for (const required of [
  'DROP POLICY IF EXISTS "app_data_select_anon"',
  'DROP POLICY IF EXISTS "push_subs_all_anon"',
  'REVOKE EXECUTE ON FUNCTION public.apply_app_data_delta',
]) {
  if (!authPolicies.includes(required)) failures.push(`policies_auth.sql: falta ${required}`)
}

const rollback = await readFile('supabase/policies_auth_rollback.sql', 'utf8')
for (const required of [
  'CREATE POLICY "app_data_select_anon"',
  'CREATE POLICY "push_subs_all_anon"',
  'GRANT EXECUTE ON FUNCTION public.apply_app_data_delta',
]) {
  if (!rollback.includes(required)) failures.push(`policies_auth_rollback.sql: falta ${required}`)
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
if (packageJson.engines?.node !== '24.x') failures.push('package.json: Node de producción no está fijado a 24.x')

const ci = await readFile('.github/workflows/ci.yml', 'utf8')
if (!/node-version:\s*24\b/.test(ci)) failures.push('ci.yml: CI no usa la misma versión mayor de Node que producción')

const vercel = JSON.parse(await readFile('vercel.json', 'utf8'))
const globalHeaderSet = new Map(
  (vercel.headers || []).find(entry => entry.source === '/(.*)')?.headers?.map(header => [header.key, header.value]) || [],
)
for (const [key, expected] of [
  ['Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
]) {
  if (globalHeaderSet.get(key) !== expected) failures.push(`vercel.json: falta cabecera ${key}`)
}

if (failures.length) {
  throw new Error(`Límites de seguridad incompletos:\n- ${failures.join('\n- ')}`)
}

console.log(`Límites de seguridad: ${serverFiles.length} funciones servidor y rollback RLS verificados`)
