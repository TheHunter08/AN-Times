import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

// Mapa en vivo de Control: geovallas de las obras + un pin por cada empleado
// que está fichando ahora mismo con GPS capturado. Usa Leaflet + tiles de
// OpenStreetMap (sin coste, sin API key) — nada de esto se auto-actualiza vía
// polling: como esta vista solo se monta cuando el admin la abre, y los datos
// (db) ya llegan en vivo vía Supabase Realtime, basta con reaccionar a props.
export function MapaObra({ obras, liveEmps }) {
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const LRef = useRef(null)

  // Init del mapa una sola vez
  useEffect(() => {
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !mapElRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(mapElRef.current, { zoomControl: true, attributionControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)
      map.setView([40.4168, -3.7038], 6) // España por defecto hasta que haya datos reales
      mapRef.current = map
      // Forzar recálculo de tamaño (el contenedor puede montarse con display:none un instante)
      setTimeout(() => map.invalidateSize(), 50)
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Redibuja geovallas + pines cuando cambian los datos
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    layersRef.current.forEach(l => map.removeLayer(l))
    layersRef.current = []

    const bounds = []

    obras.filter(o => o.coords).forEach(o => {
      const circle = L.circle([o.coords.lat, o.coords.lng], {
        radius: o.radio != null ? o.radio : 200,
        color: '#6366f1', weight: 2, fillColor: '#6366f1', fillOpacity: .08,
      }).addTo(map).bindTooltip(o.nombre, { permanent: false })
      layersRef.current.push(circle)
      bounds.push([o.coords.lat, o.coords.lng])
    })

    liveEmps.forEach(e => {
      if (!e.lat || !e.lng) return
      const color = e.enDescanso ? '#f59e0b' : '#10b981'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #0D0D14;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;font-family:inherit">${e.initials}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      })
      const marker = L.marker([e.lat, e.lng], { icon }).addTo(map)
        .bindTooltip(`${e.name}${e.enDescanso ? ' (en pausa)' : ''}`, { permanent: false })
      layersRef.current.push(marker)
      bounds.push([e.lat, e.lng])
    })

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
    }
  }, [obras, liveEmps])

  return (
    <div style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--border)', height: 420, position: 'relative' }}>
      <div ref={mapElRef} style={{ width: '100%', height: '100%', background: '#1a1a2e' }} />
      {!obras.some(o => o.coords) && !liveEmps.some(e => e.lat) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,13,20,.85)', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', maxWidth: 260 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Sin datos de ubicación todavía</div>
            <div style={{ fontSize: 11, color: 'var(--text4)' }}>Configura la geovalla de una obra en Obras, o espera a que un empleado fiche con GPS activado.</div>
          </div>
        </div>
      )}
    </div>
  )
}
