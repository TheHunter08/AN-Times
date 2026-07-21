import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmployeeGastos } from './EmployeeGastos.tsx'
import { today } from '../../utils/time.js'

describe('EmployeeGastos', () => {
  it('tolera gastos legacy sin fecha y suma importes guardados como texto', () => {
    const month = today().slice(0, 7)
    const html = renderToStaticMarkup(<EmployeeGastos
      db={{ gastos:[
        { id:'g1', empId:'e1', concepto:'Taxi', importe:'10', estado:'aprobado', ts:`${month}-02T10:00:00Z` },
        { id:'g2', empId:'e1', concepto:'Dieta', importe:'5', estado:'aprobado', ts:`${month}-03T10:00:00Z` },
      ] }}
      u={{ id:'e1', name:'Empleado' }}
      toast={() => {}}
      saveDB={() => {}}
    />)

    expect(html).toContain('15,00')
    expect(html).toContain('aprobados')
  })
})
