import { describe, expect, it } from 'vitest'
import { evaluateGeofence, formatObraCoords, normalizeObraCoords } from './obraGeo.js'

describe('coordenadas de obra', () => {
  it('normaliza el formato escrito en el formulario', () => {
    expect(normalizeObraCoords('18.4861, -69.9312')).toEqual({ lat:18.4861, lng:-69.9312 })
  })

  it('mantiene objetos modernos y objetos legacy latitude/longitude', () => {
    expect(normalizeObraCoords({ lat:40.4, lng:-3.7 })).toEqual({ lat:40.4, lng:-3.7 })
    expect(normalizeObraCoords({ latitude:40.4, longitude:-3.7 })).toEqual({ lat:40.4, lng:-3.7 })
  })

  it('rechaza coordenadas incompletas o fuera de rango', () => {
    expect(normalizeObraCoords('91, 20')).toBeNull()
    expect(normalizeObraCoords('40.4')).toBeNull()
    expect(normalizeObraCoords(null)).toBeNull()
  })

  it('acepta coma decimal (formato es-ES) en vez de solo punto', () => {
    expect(normalizeObraCoords('18,4861,-69,9312')).toEqual({ lat:18.4861, lng:-69.9312 })
    expect(normalizeObraCoords('-18,4861,-69,9312')).toEqual({ lat:-18.4861, lng:-69.9312 })
  })

  it('acepta espacio o punto y coma como separador entre lat y lng', () => {
    expect(normalizeObraCoords('18.4861 -69.9312')).toEqual({ lat:18.4861, lng:-69.9312 })
    expect(normalizeObraCoords('18.4861;-69.9312')).toEqual({ lat:18.4861, lng:-69.9312 })
  })

  it('genera una etiqueta GPS consistente', () => {
    expect(formatObraCoords({ lat:18.4861, lng:-69.9312 })).toBe('18.48610, -69.93120')
  })
})

describe('evaluateGeofence', () => {
  const obraCentro = { coords: { lat: 18.4861, lng: -69.9312 }, radio: 200 }

  it('sin coordenadas de obra, nunca bloquea ni marca fuera de rango', () => {
    const result = evaluateGeofence({ gps: { lat: 18.5, lng: -70 }, obra: { coords: null } })
    expect(result).toEqual({ checked: false, dist: null, radio: null, blocked: false })
  })

  it('sin GPS del dispositivo, nunca bloquea (lo cubre gpsRequired aparte)', () => {
    const result = evaluateGeofence({ gps: null, obra: obraCentro })
    expect(result).toEqual({ checked: false, dist: null, radio: null, blocked: false })
  })

  it('dentro del radio: no bloquea aunque geofenceStrict esté activo', () => {
    const result = evaluateGeofence({ gps: { lat: 18.4861, lng: -69.9312 }, obra: { ...obraCentro, geofenceStrict: true } })
    expect(result.outside).toBe(false)
    expect(result.blocked).toBe(false)
  })

  it('fuera del radio sin geofenceStrict: marca "outside" pero no bloquea (solo advertencia)', () => {
    const lejos = { lat: 19.0, lng: -70.5 } // muy lejos del centro
    const result = evaluateGeofence({ gps: lejos, obra: obraCentro })
    expect(result.checked).toBe(true)
    expect(result.outside).toBe(true)
    expect(result.blocked).toBe(false)
  })

  it('fuera del radio con geofenceStrict activo: bloquea', () => {
    const lejos = { lat: 19.0, lng: -70.5 }
    const result = evaluateGeofence({ gps: lejos, obra: { ...obraCentro, geofenceStrict: true } })
    expect(result.outside).toBe(true)
    expect(result.blocked).toBe(true)
    expect(result.dist).toBeGreaterThan(result.radio)
  })

  it('usa 200m como radio por defecto si la obra no define uno', () => {
    const cerca = { lat: 18.487, lng: -69.9313 } // ~110m del centro
    const result = evaluateGeofence({ gps: cerca, obra: { coords: obraCentro.coords, geofenceStrict: true } })
    expect(result.radio).toBe(200)
    expect(result.blocked).toBe(false)
  })
})

