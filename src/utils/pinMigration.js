import { hashPin, isPinHashed, needsRehash, verifyPin } from './pinSecurity.js'

export async function planPlaintextPinUpgrade(employeeId, rawValues) {
  const values = [...new Set((rawValues || []).filter(value => typeof value === 'string' && value))]
  const plaintext = values.filter(value => !isPinHashed(value))
  const modern = values.filter(value => isPinHashed(value) && !needsRehash(value))
  const legacy = values.filter(value => isPinHashed(value) && needsRehash(value))

  if (!plaintext.length) return { upgrade:false, conflict:false, targetPin:null, pinLen:null }
  if (new Set(plaintext).size !== 1 || new Set(modern).size > 1 || new Set(legacy).size > 1) {
    return { upgrade:false, conflict:true, targetPin:null, pinLen:null }
  }

  const plain = plaintext[0]
  for (const stored of [...modern, ...legacy]) {
    if (!(await verifyPin(plain, stored, employeeId))) {
      return { upgrade:false, conflict:true, targetPin:null, pinLen:null }
    }
  }

  return {
    upgrade:true,
    conflict:false,
    targetPin:modern[0] || await hashPin(plain, employeeId),
    pinLen:plain.length,
  }
}
