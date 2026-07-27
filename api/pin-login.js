// Endpoint retirado.
//
// Las versiones anteriores firmaban JWT HS256 con el Legacy JWT Secret de
// Supabase. Ese mecanismo dependía de una clave heredada, creaba identidades
// que no eran sesiones de Supabase Auth y podía mezclar dos valores distintos
// en Authorization. Se conserva la ruta con respuesta 410 para que clientes
// antiguos fallen de forma controlada y continúen usando el login PIN local.
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  return res.status(410).json({
    error:'La sesión JWT personalizada por PIN está retirada',
    code:'PIN_JWT_RETIRED',
  })
}
