export function normalizeObraCoords(value) {
  let lat
  let lng
  if (value && typeof value === 'object') {
    lat = Number(value.lat ?? value.latitude)
    lng = Number(value.lng ?? value.longitude)
  } else if (typeof value === 'string') {
    const parts = value.split(',').map(part => Number(part.trim()))
    if (parts.length !== 2) return null
    ;[lat, lng] = parts
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

