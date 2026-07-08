import { describe, it, expect } from 'vitest'
import { encodeCentroQR, decodeCentroQR, decodeEmployeeQR } from './qr.js'

describe('encodeCentroQR / decodeCentroQR', () => {
  it('codifica y decodifica un centro simple', () => {
    const text = encodeCentroQR('Obra Principal')
    expect(text).toBe('TIMESINC:CENTRO:Obra Principal')
    expect(decodeCentroQR(text)).toBe('Obra Principal')
  })

  it('rechaza texto sin el prefijo esperado', () => {
    expect(decodeCentroQR('https://ejemplo.com')).toBeNull()
    expect(decodeCentroQR('cualquier cosa')).toBeNull()
  })

  it('rechaza el QR de empleado (formato distinto)', () => {
    const empQR = 'https://times-inc.vercel.app/?emp=abc123'
    expect(decodeCentroQR(empQR)).toBeNull()
  })

  it('recorta espacios y rechaza centro vacío', () => {
    expect(decodeCentroQR('TIMESINC:CENTRO:  Almacén  ')).toBe('Almacén')
    expect(decodeCentroQR('TIMESINC:CENTRO:')).toBeNull()
    expect(decodeCentroQR('TIMESINC:CENTRO:   ')).toBeNull()
  })

  it('no revienta con entradas no-string', () => {
    expect(decodeCentroQR(null)).toBeNull()
    expect(decodeCentroQR(undefined)).toBeNull()
    expect(decodeCentroQR(42)).toBeNull()
  })
})

describe('decodeEmployeeQR', () => {
  it('extrae el id de empleado de la URL generada por PanelEmpleados/ModalMyQR', () => {
    const url = 'https://times-inc.vercel.app/?emp=emp-123'
    expect(decodeEmployeeQR(url)).toBe('emp-123')
  })

  it('funciona con parámetros adicionales en la URL', () => {
    const url = 'https://times-inc.vercel.app/?tab=inicio&emp=emp-456'
    expect(decodeEmployeeQR(url)).toBe('emp-456')
  })

  it('decodifica ids con caracteres especiales (URL-encoded)', () => {
    const url = `https://times-inc.vercel.app/?emp=${encodeURIComponent('id con espacio')}`
    expect(decodeEmployeeQR(url)).toBe('id con espacio')
  })

  it('devuelve null si la URL no tiene el parámetro emp', () => {
    expect(decodeEmployeeQR('https://times-inc.vercel.app/?tab=inicio')).toBeNull()
  })

  it('devuelve null con texto que no es una URL válida', () => {
    expect(decodeEmployeeQR('TIMESINC:CENTRO:Obra Principal')).toBeNull()
    expect(decodeEmployeeQR('no es una url')).toBeNull()
  })

  it('no revienta con entradas no-string', () => {
    expect(decodeEmployeeQR(null)).toBeNull()
    expect(decodeEmployeeQR(undefined)).toBeNull()
  })

  it('un QR de centro nunca se confunde con un QR de empleado', () => {
    const centroQR = encodeCentroQR('Oficina Central')
    expect(decodeEmployeeQR(centroQR)).toBeNull()
  })
})
