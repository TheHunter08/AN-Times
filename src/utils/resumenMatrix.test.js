import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildResumenMatrix, resolvePeriodDays, dayColumnLabel, resolveRole } from './resumenMatrix.js'

describe('resolveRole', () => {
  it('usa e.role si existe', () => {
    expect(resolveRole({ role: 'encargado' })).toBe('encargado')
  })
  it('cae a los booleanos legacy si no hay role', () => {
    expect(resolveRole({ isAdmin: true })).toBe('admin')
    expect(resolveRole({ isEnc: true })).toBe('encargado')
    expect(resolveRole({ isJO: true })).toBe('jefe_obra')
    expect(resolveRole({ isJefeCentro: true })).toBe('jefe_centro')
    expect(resolveRole({})).toBe('empleado')
  })
})

describe('resolvePeriodDays', () => {
  it('mes: genera todos los días del mes, incluido el último (28/29/30/31)', () => {
    expect(resolvePeriodDays({ mode: 'month', value: '2026-02' })).toHaveLength(28) // 2026 no es bisiesto
    expect(resolvePeriodDays({ mode: 'month', value: '2024-02' })).toHaveLength(29) // 2024 sí lo es
    expect(resolvePeriodDays({ mode: 'month', value: '2026-07' })[0]).toBe('2026-07-01')
    expect(resolvePeriodDays({ mode: 'month', value: '2026-07' }).at(-1)).toBe('2026-07-31')
  })

  it('fecha específica: un único día', () => {
    expect(resolvePeriodDays({ mode: 'date', value: '2026-07-15' })).toEqual(['2026-07-15'])
  })

  it('rango: incluye ambos extremos, incluso cruzando meses', () => {
    const days = resolvePeriodDays({ mode: 'range', from: '2026-07-30', to: '2026-08-02' })
    expect(days).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('un rango invertido (to < from) no genera días en vez de colgarse', () => {
    expect(resolvePeriodDays({ mode: 'range', from: '2026-08-01', to: '2026-07-01' })).toEqual([])
  })

  it('sin period o con datos incompletos, devuelve array vacío', () => {
    expect(resolvePeriodDays(null)).toEqual([])
    expect(resolvePeriodDays({ mode: 'range', from: '2026-07-01' })).toEqual([])
  })
})

describe('dayColumnLabel', () => {
  it('solo el número de día cuando el periodo cae en un único mes', () => {
    expect(dayColumnLabel('2026-07-05', true)).toBe('5')
    expect(dayColumnLabel('2026-07-31', true)).toBe('31')
  })
  it('dd/mm cuando el rango cruza meses', () => {
    expect(dayColumnLabel('2026-08-01', false)).toBe('01/08')
  })
})

describe('buildResumenMatrix', () => {
  const employees = [
    { id: 'e1', name: 'Zoe Empleada', role: 'empleado' },
    { id: 'e2', name: 'Ana Encargada', role: 'encargado' },
    { id: 'e3', name: 'Beto Empleado', role: 'empleado' },
    { id: 'e4', name: 'Jefe De Obra', role: 'jefe_obra' },
    { id: 'baja1', name: 'Ex Empleado', role: 'empleado', baja: true },
  ]
  const records = [
    { id: 'r1', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z' }, // 8h
    { id: 'r2', empId: 'e2', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T12:00:00.000Z' }, // 4h
    { id: 'r3', empId: 'e1', inicio: '2026-06-05T08:00:00.000Z', fin: '2026-06-05T16:00:00.000Z' }, // fuera de periodo
    { id: 'r4', empId: 'e1', inicio: '2026-07-06T08:00:00.000Z', fin: null }, // abierta, no cuenta
    // e3/e4 necesitan al menos un fichaje en julio para no quedar fuera del
    // resumen por la regla "sin ningún fichaje ese mes, no aparece".
    { id: 'r5', empId: 'e3', inicio: '2026-07-10T08:00:00.000Z', fin: '2026-07-10T16:00:00.000Z' }, // 8h
    { id: 'r6', empId: 'e4', inicio: '2026-07-10T08:00:00.000Z', fin: '2026-07-10T16:00:00.000Z' }, // 8h
  ]
  const vacaciones = [
    { empId: 'e3', estado: 'aprobada', fechaInicio: '2026-07-04', fechaFin: '2026-07-06' },
    { empId: 'e4', estado: 'pendiente', fechaInicio: '2026-07-05', fechaFin: '2026-07-05' }, // no aprobada, no cuenta
  ]

  it('ordena por rol (admin, jefe_obra, encargado, empleado) y luego por nombre', () => {
    const { rows } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'month', value: '2026-07' } })
    expect(rows.map(r => r.employee.id)).toEqual(['e4', 'e2', 'e3', 'e1'])
  })

  it('excluye empleados dados de baja', () => {
    const { rows } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'date', value: '2026-07-05' } })
    expect(rows.some(r => r.employee.id === 'baja1')).toBe(false)
  })

  it('un empleado de baja con fichajes sí aparece si se pide explícitamente por employeeId', () => {
    const bajaConFichajes = [{ id: 'bajaX', name: 'Ex con fichajes', role: 'empleado', baja: true }]
    const bajaRecords = [{ id: 'rb', empId: 'bajaX', inicio: '2026-07-10T08:00:00.000Z', fin: '2026-07-10T16:00:00.000Z' }]
    const general = buildResumenMatrix({ employees: bajaConFichajes, records: bajaRecords, period: { mode: 'month', value: '2026-07' } })
    expect(general.rows).toHaveLength(0)
    const explicit = buildResumenMatrix({ employees: bajaConFichajes, records: bajaRecords, period: { mode: 'month', value: '2026-07' }, employeeId: 'bajaX' })
    expect(explicit.rows).toHaveLength(1)
    expect(explicit.rows[0].employee.id).toBe('bajaX')
  })

  it('excluye, sin seleccionar un empleado concreto, a quien no tiene ningún fichaje ese periodo', () => {
    const sinFichajes = [{ id: 'eX', name: 'Nunca Ficha', role: 'empleado' }]
    const { rows } = buildResumenMatrix({ employees: sinFichajes, records: [], period: { mode: 'month', value: '2026-07' } })
    expect(rows).toHaveLength(0)
  })

  it('excluye al administrador — no es un empleado', () => {
    const withAdmin = [...employees, { id: 'admin1', name: 'Admin Root', role: 'admin' }, { id: 'admin2', name: 'Admin Legacy', isAdmin: true }]
    const { rows } = buildResumenMatrix({ employees: withAdmin, records, vacaciones, period: { mode: 'date', value: '2026-07-05' } })
    expect(rows.some(r => r.employee.id === 'admin1' || r.employee.id === 'admin2')).toBe(false)
  })

  it('filtra por un empleado concreto cuando se pasa employeeId', () => {
    const { rows } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'date', value: '2026-07-05' }, employeeId: 'e1' })
    expect(rows).toHaveLength(1)
    expect(rows[0].employee.id).toBe('e1')
  })

  it('calcula minutos trabajados por día, solo de fichajes cerrados dentro del periodo', () => {
    const { rows, days } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'month', value: '2026-07' } })
    const e1 = rows.find(r => r.employee.id === 'e1')
    const dayIdx = days.indexOf('2026-07-05')
    expect(e1.cells[dayIdx].minutes).toBe(480) // 8h
    // El registro abierto (r4, sin fin) del día 6 no debe sumar nada
    const day6Idx = days.indexOf('2026-07-06')
    expect(e1.cells[day6Idx].minutes).toBe(0)
    // El registro de junio (fuera del periodo de julio) no contamina el total
    expect(e1.totalMinutes).toBe(480)
  })

  it('marca isVacation solo con solicitudes aprobadas que cubren el día', () => {
    const { rows, days } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'month', value: '2026-07' } })
    const e3 = rows.find(r => r.employee.id === 'e3')
    const e4 = rows.find(r => r.employee.id === 'e4')
    expect(e3.cells[days.indexOf('2026-07-05')].isVacation).toBe(true)
    expect(e3.cells[days.indexOf('2026-07-10')].isVacation).toBe(false)
    // Pendiente (no aprobada) no debe marcarse
    expect(e4.cells[days.indexOf('2026-07-05')].isVacation).toBe(false)
  })

  describe('ausencia vs. descanso (fin de semana) vs. día futuro', () => {
    beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00')))
    afterEach(() => vi.useRealTimers())

    it('sábado y domingo sin fichaje son descanso (isWeekend), nunca ausencia', () => {
      const { rows, days } = buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } })
      const e1 = rows.find(r => r.employee.id === 'e1')
      const saturdayIdx = days.indexOf('2026-07-04') // sábado, sin fichaje
      expect(e1.cells[saturdayIdx].isWeekend).toBe(true)
      expect(e1.cells[saturdayIdx].isAbsent).toBe(false)
    })

    it('un día laborable pasado sin fichaje es ausencia', () => {
      const { rows, days } = buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } })
      const e1 = rows.find(r => r.employee.id === 'e1')
      const pastWeekdayIdx = days.indexOf('2026-07-01') // miércoles, sin fichaje, ya pasó
      expect(e1.cells[pastWeekdayIdx].isWeekend).toBe(false)
      expect(e1.cells[pastWeekdayIdx].isAbsent).toBe(true)
    })

    it('un día laborable futuro sin fichaje no es ausencia todavía', () => {
      const { rows, days } = buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } })
      const e1 = rows.find(r => r.employee.id === 'e1')
      const futureWeekdayIdx = days.indexOf('2026-07-30') // jueves, futuro respecto al 25 de julio
      expect(e1.cells[futureWeekdayIdx].isAbsent).toBe(false)
    })

    it('un día con fichaje no cuenta como ausencia', () => {
      const { rows, days } = buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } })
      const e1 = rows.find(r => r.employee.id === 'e1')
      expect(e1.cells[days.indexOf('2026-07-05')].isAbsent).toBe(false)
    })

    it('un día de vacaciones aprobadas no cuenta como ausencia', () => {
      const { rows, days } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'month', value: '2026-07' } })
      const e3 = rows.find(r => r.employee.id === 'e3')
      expect(e3.cells[days.indexOf('2026-07-06')].isVacation).toBe(true)
      expect(e3.cells[days.indexOf('2026-07-06')].isAbsent).toBe(false)
    })
  })

  it('sameMonth es true dentro de un mes y false en un rango que cruza meses', () => {
    expect(buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } }).sameMonth).toBe(true)
    expect(buildResumenMatrix({ employees, records, period: { mode: 'range', from: '2026-07-30', to: '2026-08-02' } }).sameMonth).toBe(false)
  })

  it('sin periodo válido, produce una matriz vacía sin lanzar', () => {
    const result = buildResumenMatrix({ employees, records, period: null })
    expect(result.days).toEqual([])
    expect(result.rows.every(r => r.cells.length === 0)).toBe(true)
  })

  describe('filtro por obra (obraNames)', () => {
    const obraRecords = [
      { id: 'o1', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z', centro: 'Obra Norte' }, // 8h
      { id: 'o2', empId: 'e2', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T12:00:00.000Z', centro: 'Obra Sur' }, // 4h, otra obra
    ]

    it('sin obraNames (null), se comporta exactamente igual que antes', () => {
      const withFilter = buildResumenMatrix({ employees, records: obraRecords, period: { mode: 'date', value: '2026-07-05' }, obraNames: null })
      const without = buildResumenMatrix({ employees, records: obraRecords, period: { mode: 'date', value: '2026-07-05' } })
      expect(withFilter).toEqual(without)
    })

    it('solo cuenta los minutos de los fichajes en las obras seleccionadas', () => {
      const { rows } = buildResumenMatrix({ employees, records: obraRecords, period: { mode: 'date', value: '2026-07-05' }, obraNames: ['Obra Norte'] })
      const e1 = rows.find(r => r.employee.id === 'e1')
      const e2 = rows.find(r => r.employee.id === 'e2')
      expect(e1.cells[0].minutes).toBe(480)
      expect(e2).toBeUndefined() // e2 no tiene fichajes en Obra Norte, se oculta
    })

    it('marca isElsewhere (no isAbsent) el día que un empleado de la obra filtrada fichó en otra obra', () => {
      const { rows, days } = buildResumenMatrix({
        employees: [{ id: 'e1', name: 'Zoe', role: 'empleado' }],
        records: [
          { id: 'o-day5', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z', centro: 'Obra Norte' }, // 8h, obra filtrada
          { id: 'o-day6', empId: 'e1', inicio: '2026-07-06T08:00:00.000Z', fin: '2026-07-06T12:00:00.000Z', centro: 'Obra Sur' }, // 4h, otra obra
        ],
        period: { mode: 'month', value: '2026-07' },
        obraNames: ['Obra Norte'],
      })
      expect(rows).toHaveLength(1) // e1 sí tiene fichajes en Obra Norte ese mes, se muestra
      const day5 = rows[0].cells[days.indexOf('2026-07-05')]
      const day6 = rows[0].cells[days.indexOf('2026-07-06')]
      expect(day5.minutes).toBe(480)
      expect(day6.minutes).toBe(0)
      expect(day6.isElsewhere).toBe(true)
      expect(day6.isAbsent).toBe(false)
    })

    it('con varias obras seleccionadas, incluye fichajes de cualquiera de ellas', () => {
      const { rows } = buildResumenMatrix({ employees, records: obraRecords, period: { mode: 'date', value: '2026-07-05' }, obraNames: ['Obra Norte', 'Obra Sur'] })
      expect(rows.find(r => r.employee.id === 'e1').cells[0].minutes).toBe(480)
      expect(rows.find(r => r.employee.id === 'e2').cells[0].minutes).toBe(240)
    })

    describe('reasignación a otra obra (sin histórico, usa la asignación actual — obrasAsignadas)', () => {
      const obras = [{ id: 'o-norte', nombre: 'Obra Norte' }, { id: 'o-sur', nombre: 'Obra Sur' }]

      it('sigue asignado a la obra filtrada: un día sin fichar en ningún sitio es Ausente, como siempre', () => {
        const asignado = [{ id: 'e1', name: 'Zoe', role: 'empleado', obrasAsignadas: ['o-norte'] }]
        const unSoloDia = [{ id: 'o1', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z', centro: 'Obra Norte' }]
        const { rows, days } = buildResumenMatrix({ employees: asignado, records: unSoloDia, obras, period: { mode: 'month', value: '2026-07' }, obraNames: ['Obra Norte'] })
        const day6 = rows[0].cells[days.indexOf('2026-07-06')] // lunes, sin fichar en ningún sitio
        expect(day6.isAbsent).toBe(true)
      })

      it('ya NO está asignado a la obra filtrada: un día sin fichar en ningún sitio queda en blanco, no Ausente', () => {
        const reasignado = [{ id: 'e1', name: 'Zoe', role: 'empleado', obrasAsignadas: ['o-sur'] }] // reasignado a otra obra
        const unSoloDiaEnNorte = [{ id: 'o1', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z', centro: 'Obra Norte' }]
        const { rows, days } = buildResumenMatrix({ employees: reasignado, records: unSoloDiaEnNorte, obras, period: { mode: 'month', value: '2026-07' }, obraNames: ['Obra Norte'] })
        const day6 = rows[0].cells[days.indexOf('2026-07-06')]
        expect(day6.isAbsent).toBe(false)
        expect(day6.isElsewhere).toBe(false) // tampoco fichó en ningún sitio ese día — vacío, no "otra obra"
        expect(day6.minutes).toBe(0)
      })

      it('reasignado y fichando ya en la nueva obra: esos días se marcan "Otra obra", no Ausente', () => {
        const reasignado = [{ id: 'e1', name: 'Zoe', role: 'empleado', obrasAsignadas: ['o-sur'] }]
        const recs = [
          { id: 'o1', empId: 'e1', inicio: '2026-07-05T08:00:00.000Z', fin: '2026-07-05T16:00:00.000Z', centro: 'Obra Norte' },
          { id: 'o2', empId: 'e1', inicio: '2026-07-07T08:00:00.000Z', fin: '2026-07-07T12:00:00.000Z', centro: 'Obra Sur' },
        ]
        const { rows, days } = buildResumenMatrix({ employees: reasignado, records: recs, obras, period: { mode: 'month', value: '2026-07' }, obraNames: ['Obra Norte'] })
        const day7 = rows[0].cells[days.indexOf('2026-07-07')]
        expect(day7.isElsewhere).toBe(true)
        expect(day7.isAbsent).toBe(false)
      })
    })
  })
})
