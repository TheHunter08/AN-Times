import { describe, expect, it } from 'vitest'
import { formatObraCoords, normalizeObraCoords } from './obraGeo.js'

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

  it('genera una etiqueta GPS consistente', () => {
    expect(formatObraCoords({ lat:18.4861, lng:-69.9312 })).toBe('18.48610, -69.93120')
  })
})

