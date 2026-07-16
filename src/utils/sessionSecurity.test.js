import { describe, expect, it } from 'vitest'
import { sanitizeSession, sanitizeSessionUser } from './sessionSecurity.js'

describe('persistencia mínima de sesión', () => {
  it('no duplica secretos ni datos personales de la ficha del empleado', () => {
    const user = sanitizeSessionUser({
      id:'e1', name:'Ana', role:'encargado', pin:'pbkdf2:secret', pinLen:4,
      email:'ana@example.com', telefono:'600000000', iban:'ES00', isEnc:true,
    })

    expect(user).toEqual({ id:'e1', name:'Ana', role:'encargado', isAdmin:false, isEnc:true, isJO:false })
    expect(user).not.toHaveProperty('pin')
    expect(user).not.toHaveProperty('email')
    expect(user).not.toHaveProperty('telefono')
  })

  it('conserva el método de acceso sin aceptar campos arbitrarios', () => {
    expect(sanitizeSession({
      user:{ id:'e1', name:'Ana' }, isAdmin:false, authMethod:'email', authenticatedAt:123,
      accessToken:'no-debe-persistir',
    })).toEqual({
      user:{ id:'e1', name:'Ana', role:'empleado', isAdmin:false, isEnc:false, isJO:false },
      isAdmin:false, isEnc:false, isJO:false, authMethod:'email', authenticatedAt:123,
    })
  })
})

