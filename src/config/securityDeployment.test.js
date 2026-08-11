import { describe, expect, it } from 'vitest'
import { AUTH_RLS_ACTIVATION_SEAL, evaluateSecurityDeployment } from './securityDeployment.js'

describe('evaluateSecurityDeployment', () => {
  it('mantiene el modo de transicion por defecto', () => {
    expect(evaluateSecurityDeployment({})).toMatchObject({
      active:false,
      authenticatedDataPath:false,
      requireOfficialAuth:false,
      allowPrimaryPinLogin:true,
    })
  })

  it('no activa un despliegue configurado solo a medias', () => {
    const result = evaluateSecurityDeployment({ VITE_SECURITY_MODE:'auth_rls' })
    expect(result.active).toBe(false)
    expect(result.issues).toContain('falta el sello de activacion Auth/RLS')
  })

  it('activa el runtime solo con modo y sello exactos', () => {
    expect(evaluateSecurityDeployment({
      VITE_SECURITY_MODE:'auth_rls',
      VITE_SECURITY_ACTIVATION_SEAL:AUTH_RLS_ACTIVATION_SEAL,
    })).toMatchObject({
      requested:true,
      sealed:true,
      active:true,
      authenticatedDataPath:true,
      requireOfficialAuth:true,
      allowPrimaryPinLogin:false,
      allowPrimaryBiometricLogin:false,
    })
  })
})
