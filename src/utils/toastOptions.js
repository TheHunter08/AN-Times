const TYPE_ALIASES = {
  success: 'ok',
  error: 'err',
  warning: 'warn',
  info: '',
}

export function normalizeToastOptions(duration = 3000, type = '') {
  let resolvedDuration = duration
  let resolvedType = type

  // Algunos componentes antiguos usaban toast(mensaje, tipo). Aceptar ambas
  // firmas evita que setTimeout reciba "success"/"error" como duración y
  // elimine el aviso inmediatamente.
  if (typeof resolvedDuration === 'string') {
    if (!resolvedType) resolvedType = resolvedDuration
    resolvedDuration = 3000
  }

  const numericDuration = Number(resolvedDuration)
  return {
    duration: Number.isFinite(numericDuration) && numericDuration >= 0 ? numericDuration : 3000,
    type: TYPE_ALIASES[resolvedType] ?? resolvedType ?? '',
  }
}
