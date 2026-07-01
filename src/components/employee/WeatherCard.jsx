import { useState, useEffect } from 'react'

export function WeatherCard() {
  const [wx, setWx] = useState(null)
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    try { const c = sessionStorage.getItem('wx_v1'); if (c) { const d = JSON.parse(c); if (Date.now() - d.ts < 30*60*1000) { setWx(d); return } } } catch {}
    if (!navigator.geolocation) { setDenied(true); return }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weather_code`)
        .then(r => r.json()).then(d => {
          const w = { ...d.current, ts: Date.now() }
          setWx(w)
          try { sessionStorage.setItem('wx_v1', JSON.stringify(w)) } catch {}
        }).catch(() => {})
    }, () => setDenied(true), { timeout: 5000 })
  }, [])
  if (denied) return (
    <div className="v3-weather-pill" style={{ opacity:.55, cursor:'pointer' }} onClick={() => navigator.geolocation?.getCurrentPosition(() => {}, () => {})}>
      <span>📍</span><span className="v3-weather-desc">Activa ubicación</span>
    </div>
  )
  if (!wx) return null
  const c = wx.weather_code ?? 0
  const icon = c === 0 ? '☀️' : c <= 2 ? '⛅' : c <= 3 ? '☁️' : c <= 49 ? '🌫️' : c <= 69 ? '🌧️' : c <= 79 ? '🌨️' : c <= 99 ? '⛈️' : '🌤️'
  const desc = c === 0 ? 'Despejado' : c <= 2 ? 'Poco nublado' : c <= 3 ? 'Nublado' : c <= 49 ? 'Niebla' : c <= 69 ? 'Lluvia' : c <= 79 ? 'Nieve' : c <= 99 ? 'Tormenta' : 'Variable'
  return (
    <div className="v3-weather-pill">
      <span>{icon}</span>
      <span className="v3-weather-temp">{Math.round(wx.temperature_2m)}°C</span>
      <span className="v3-weather-desc">{desc}</span>
    </div>
  )
}
