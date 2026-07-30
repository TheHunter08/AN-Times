import { describe, expect, it } from 'vitest'
import { workBalanceOptions } from './workBalance.js'

describe('workBalanceOptions', () => {
  it('incluye vacaciones aprobadas, bajas y ausencias no rechazadas', () => {
    const options = workBalanceOptions({
      vacaciones:[
        { empId:'e1', estado:'aprobada', fechaInicio:'2026-06-01', fechaFin:'2026-06-02' },
        { empId:'e1', estado:'pendiente', fechaInicio:'2026-06-03', fechaFin:'2026-06-03' },
      ],
      medicos:[{ empId:'e1', fecha:'2026-06-04' }],
      ausencias:[
        { empId:'e1', estado:'justificada', fecha:'2026-06-05' },
        { empId:'e1', estado:'rechazada', fecha:'2026-06-08' },
      ],
      config:{ usarFestivosMadrid:false, festivosExtra:{ '2026-06-09':'Local' } },
    }, { id:'e1' })

    expect(options.justifiedAbsences).toHaveLength(3)
    expect(options.holidays).toEqual({ '2026-06-09':'Local' })
  })

  it('usa los festivos de Madrid salvo que la empresa los desactive', () => {
    const options = workBalanceOptions({}, { id:'e1' })
    expect(options.holidays['2026-05-01']).toBeTruthy()
  })
})
