import { haversine } from './geo.js'

/**
 * Evalúa si un fichaje debe bloquearse por estar fuera de la geovalla de la
 * obra. Separado de EmployeePage.jsx para poder testear la regla sin montar
 * el componente completo.
 *
 * - Sin coordenadas de obra configuradas: nunca bloquea (no hay geovalla que
 *   comprobar).
 * - Sin GPS del dispositivo: nunca bloquea aquí — eso ya lo cubre el
 *   flag `gpsRequired` por separado (GPS obligatorio vs. geovalla son dos
 *   comprobaciones independientes).
 * - `obra.geofenceStrict` decide si superar el radio BLOQUEA el fichaje o
 *   solo lo marca con advertencia (comportamiento previo, no destructivo).
 *
 * @param {{ gps: {lat:number,lng:number}|null, obra: any }} args
 */
export function evaluateGeofence({ gps, obra }) {
  const coords = normalizeObraCoords(obra?.coords)
  if (!coords || !gps) return { checked: false, dist: null, radio: null, blocked: false }
  const dist = haversine(gps.lat, gps.lng, coords.lat, coords.lng)
  const radio = obra?.radio != null ? obra.radio : 200
  const outside = dist > radio
  return { checked: true, dist, radio, blocked: outside && !!obra?.geofenceStrict, outside }
}

export function normalizeObraCoords(value) {
  let lat
  let lng
  if (value && typeof value === 'object') {
    lat = Number(value.lat ?? value.latitude)
    lng = Number(value.lng ?? value.longitude)
  } else if (typeof value === 'string') {
    const raw = value.trim()
    // La coma separa lat/lng en el formato internacional ("18.4861,-69.9312"),
    // pero en es-ES la coma también es el separador decimal — alguien que
    // escribe a mano "18,4861,-69,9312" (decimal con coma) partía en 4 trozos
    // y la validación lo rechazaba siempre, por más veces que lo corrigiera,
    // sin ninguna pista de qué estaba "mal". Con 4 trozos se interpreta como
    // decimal-coma y se reconstruyen los 2 números; con 2, formato internacional.
    let parts = raw.split(',').map(part => part.trim()).filter(Boolean)
    if (parts.length === 4) {
      parts = [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`]
    } else if (parts.length !== 2) {
      parts = raw.split(/[;\s]+/).map(part => part.trim()).filter(Boolean)
    }
    if (parts.length !== 2) return null
    ;[lat, lng] = parts.map(Number)
  } else {
    return null
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export function formatObraCoords(value) {
  const coords = normalizeObraCoords(value)
  return coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : ''
}

