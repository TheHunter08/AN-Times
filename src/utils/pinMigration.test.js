import { describe, expect, it } from 'vitest'
import { hashPin, needsRehash, verifyPin } from './pinSecurity.js'
import { planPlaintextPinUpgrade } from './pinMigration.js'

describe('migración segura de PIN en texto plano', () => {
  it('genera un hash moderno sin cambiar el PIN efectivo', async () => {
    const plan = await planPlaintextPinUpgrade('emp-1', ['4821'])
    expect(plan).toMatchObject({ upgrade:true, conflict:false, pinLen:4 })
    expect(needsRehash(plan.targetPin)).toBe(false)
    await expect(verifyPin('4821', plan.targetPin, 'emp-1')).resolves.toBe(true)
  })

  it('reutiliza un hash moderno equivalente presente en otra copia', async () => {
    const modern = await hashPin('4821', 'emp-1')
    const plan = await planPlaintextPinUpgrade('emp-1', ['4821', modern])
    expect(plan.targetPin).toBe(modern)
  })

  it('se detiene si las copias no representan el mismo PIN', async () => {
    const modern = await hashPin('9999', 'emp-1')
    const plan = await planPlaintextPinUpgrade('emp-1', ['4821', modern])
    expect(plan).toMatchObject({ upgrade:false, conflict:true })
  })

  it('no intenta convertir un hash antiguo sin conocer el PIN', async () => {
    const plan = await planPlaintextPinUpgrade('emp-1', ['a'.repeat(64)])
    expect(plan).toMatchObject({ upgrade:false, conflict:false })
  })
})
