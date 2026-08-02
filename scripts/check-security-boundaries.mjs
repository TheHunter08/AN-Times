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

const failures = []
for (const file of serverFiles) {
  const source = await readFile(file, 'utf8')
  if (!source.includes('SB_SERVICE_KEY')) failures.push(`${file}: no contempla SB_SERVICE_KEY`)
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

if (failures.length) {
  throw new Error(`Límites de seguridad incompletos:\n- ${failures.join('\n- ')}`)
}

console.log(`Límites de seguridad: ${serverFiles.length} funciones servidor y rollback RLS verificados`)
