import { describe, expect, it } from 'vitest'
import { buildOperationalPulse } from './operationalPulse.js'

const NOW = new Date('2026-08-09T14:00:00Z').getTime()

describe('buildOperationalPulse', () => {
  it('devuelve un pulso óptimo cuando no hay deuda operativa', () => {
    const pulse = buildOperationalPulse({ employees:[], records:[] }, NOW)
    expect(pulse.score).toBe(100)
    expect(pulse.level).toBe('Óptimo')
    expect(pulse.reviewEstimate).toBe('Sin cola de revisión')
  })

  it('prioriza una jornada abierta de más de doce horas', () => {
    const pulse = buildOperationalPulse({
      employees:[{ id:'e1', email:'uno@times.inc', centroTrabajo:'Centro' }],
      records:[{ id:'r1', empId:'e1', inicio:'2026-08-08T23:00:00Z', fin:null }],
    }, NOW)
    expect(pulse.signals.find(signal => signal.id === 'stale')?.value).toBe(1)
    expect(pulse.nextAction.page).toBe('anomalias')
    expect(pulse.score).toBe(80)
  })

  it('calcula de forma transparente la carga de revisión', () => {
    const pulse = buildOperationalPulse({
      records:[
        { id:'r1', inicio:'2026-08-09T08:00:00Z', fin:'2026-08-09T12:00:00Z' },
        { id:'r2', inicio:'2026-08-09T09:00:00Z', fin:'2026-08-09T13:00:00Z', validado:true },
      ],
      vacaciones:[{ id:'v1', estado:'pendiente' }],
      gastos:[{ id:'g1', estado:'pendiente' }],
    }, NOW)
    expect(pulse.reviewItems).toBe(3)
    expect(pulse.reviewMinutes).toBe(9)
    expect(pulse.reviewEstimate).toBe('≈ 9 min de revisión')
  })

  it('ignora registros eliminados y empleados dados de baja', () => {
    const pulse = buildOperationalPulse({
      records:[{ id:'r1', inicio:'2026-08-09T08:00:00Z', fin:'2026-08-09T12:00:00Z', deleted:true }],
      employees:[{ id:'e1', baja:true, email:'', centroTrabajo:'' }],
    }, NOW)
    expect(pulse.score).toBe(100)
    expect(pulse.reviewItems).toBe(0)
  })
})
