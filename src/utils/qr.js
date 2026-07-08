// Formato del QR de fichaje: un prefijo propio evita que cualquier QR
// aleatorio del mundo (carteles, productos, etc.) se interprete como un
// centro de trabajo válido.
const QR_PREFIX = 'TIMESINC:CENTRO:'

export function encodeCentroQR(centro) {
  return `${QR_PREFIX}${centro}`
}

export function decodeCentroQR(text) {
  if (typeof text !== 'string' || !text.startsWith(QR_PREFIX)) return null
  const centro = text.slice(QR_PREFIX.length).trim()
  return centro || null
}

// El QR de empleado ya existía (PanelEmpleados.jsx lo genera para consulta
// rápida) y codifica una URL con `?emp=<id>` — lo reutilizamos aquí como
// credencial escaneable en vez de inventar un segundo formato.
export function decodeEmployeeQR(text) {
  if (typeof text !== 'string') return null
  try {
    const url = new URL(text)
    // Solo aceptar QRs del mismo origen para evitar que un QR de terceros
    // con ?emp= en su URL se trate como credencial de empleado válida.
    if (url.origin !== window.location.origin) return null
    return url.searchParams.get('emp') || null
  } catch {
    return null
  }
}
