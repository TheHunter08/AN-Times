import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, needsRehash, isPinHashed } from './pinSecurity.js'

// El formato nuevo lleva las iteraciones explícitas ("pbkdf2:salt:hash:iter");
// los hashes antiguos ("pbkdf2:salt:hash") se verifican con 100k y se marcan
// para re-hash al iniciar sesión.
describe('pinSecurity: formato PBKDF2 con iteraciones explícitas', () => {
  it('hashPin genera el formato nuevo de 4 partes y verifyPin lo acepta', async () => {
    const hash = await hashPin('1234', 'emp-1')
    expect(hash.split(':').length).toBe(4)
    expect(isPinHashed(hash)).toBe(true)
    expect(needsRehash(hash)).toBe(false)
    expect(await verifyPin('1234', hash, 'emp-1')).toBe(true)
    expect(await verifyPin('9999', hash, 'emp-1')).toBe(false)
  })

  it('el userId participa en la derivación (mismo PIN, distinto empleado → no valida)', async () => {
    const hash = await hashPin('1234', 'emp-1')
    expect(await verifyPin('1234', hash, 'emp-2')).toBe(false)
  })

  it('un hash legacy de 3 partes (100k) sigue verificando y se marca para re-hash', async () => {
    // Derivar manualmente con 100k reproduciendo el formato antiguo
    const salt = 'aabbccddeeff00112233445566778899'
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode('4321'), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt + 'emp-9'), iterations: 100_000, hash: 'SHA-256' },
      keyMaterial, 256
    )
    const hex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
    const legacy = `pbkdf2:${salt}:${hex}`
    expect(needsRehash(legacy)).toBe(true)
    expect(await verifyPin('4321', legacy, 'emp-9')).toBe(true)
    expect(await verifyPin('0000', legacy, 'emp-9')).toBe(false)
  })

  it('needsRehash detecta texto plano y SHA-256 legacy', () => {
    expect(needsRehash('1234')).toBe(true)
    expect(needsRehash('a'.repeat(64))).toBe(true)
  })
})
