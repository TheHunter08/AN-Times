// Resuelve la ficha del empleado autenticado (por Supabase Auth) que está
// pidiendo enviar un push desde el navegador — usado por api/sendpush.js
// para decidir con actorCanNotify() a quién puede notificar.
// Vive fuera de api/ (igual que accountActivation.js) porque Vercel trata
// cualquier .js dentro de esa carpeta como una función desplegable — un
// archivo de test ahí se publicaría como endpoint real.
const cleanEnv = s => (s || '').replace(/^﻿/, '').trim()
const SB_URL     = cleanEnv(process.env.VITE_SB_URL)
const SB_ANON    = cleanEnv(process.env.VITE_SB_ANON)
const SB_SERVICE = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_KEY)

export async function authenticatedBrowserActor(token) {
  if (!token || !SB_URL || !SB_ANON || !SB_SERVICE) return null
  const authResponse = await fetch(`${SB_URL}/auth/v1/user`, {
    headers:{ apikey:SB_ANON, Authorization:`Bearer ${token}` },
  })
  if (!authResponse.ok) return null
  const authUser = await authResponse.json().catch(() => null)
  if (!authUser?.id) return null
  const profileResponse = await fetch(
    `${SB_URL}/rest/v1/employees?auth_id=eq.${encodeURIComponent(authUser.id)}&baja=eq.false&select=id,role,company_id,data&limit=1`,
    { headers:{ apikey:SB_SERVICE, Authorization:`Bearer ${SB_SERVICE}` } },
  )
  if (!profileResponse.ok) return null
  const row = (await profileResponse.json().catch(() => []))?.[0] || null
  if (!row) return null
  // Igual que accountActivation.js/cron-reminders.js: una ficha de
  // responsable (admin/jefe_obra/jefe_centro/encargado) dada de alta antes
  // de que `role` existiera como columna propia puede tener el rol real
  // solo en `data`, con la columna vacía o en 'empleado' — sin este
  // fallback, actorCanNotify la trataría como empleado normal y le negaría
  // enviar avisos a su equipo.
  const resolvedRole = row.role || row.data?.role || (row.data?.isAdmin === true ? 'admin' : row.role)
  return { ...row, role:resolvedRole }
}
