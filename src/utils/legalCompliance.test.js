import { describe, expect, it } from 'vitest'
import { buildLegalAcknowledgement, getLegalConfig, hasCurrentLegalAcknowledgement, legalConfigIssues, LEGAL_NOTICE_VERSION } from './legalCompliance.js'

describe('legal compliance notice', () => {
  it('requires the controller identity and a rights contact', () => {
    expect(legalConfigIssues({})).toHaveLength(4)
    expect(legalConfigIssues({ config:{ legal:{ controllerName:'Empresa SL', taxId:'B123', address:'Madrid', privacyEmail:'privacidad@empresa.es' } } })).toEqual([])
  })

  it('uses the configured single-company identity', () => {
    expect(getLegalConfig({ empresas:[{ nombre:'Empresa SL' }], config:{ legal:{ taxId:'B123' } } })).toMatchObject({ controllerName:'Empresa SL', taxId:'B123' })
  })

  it('records receipt of the exact information version without calling it consent', () => {
    const item = buildLegalAcknowledgement({ id:'e1', name:'Ana' }, 'auth-1', new Date('2026-08-11T10:00:00Z'))
    expect(item).toMatchObject({ empId:'e1', authId:'auth-1', eventType:'information_received', noticeVersion:LEGAL_NOTICE_VERSION })
    expect(hasCurrentLegalAcknowledgement({ legalAcknowledgements:[item] }, 'e1')).toBe(true)
    expect(hasCurrentLegalAcknowledgement({ legalAcknowledgements:[{ ...item, noticeVersion:'1.0' }] }, 'e1')).toBe(false)
  })
})
