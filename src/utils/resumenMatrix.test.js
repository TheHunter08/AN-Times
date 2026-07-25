import { describe, it, expect } from 'vitest'
import { buildResumenMatrix, resolvePeriodDays, dayColumnLabel, resolveRole } from './resumenMatrix.js'

describe('resolveRole', () => {
  it('usa e.role si existe', () => {
    expect(resolveRole({ role: 'encargado' })).toBe('encargado')
  })
  it('cae a los booleanos legacy si no hay role', () => {
    expect(resolveRole({ isAdmin: true })).toBe('admin')
    expect(resolveRole({ isEnc: true })).toBe('encargado')
    expect(resolveRole({ isJO: true })).toBe('jefe_obra')
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
  ]
  const vacaciones = [
    { empId: 'e3', estado: 'aprobada', fechaInicio: '2026-07-04', fechaFin: '2026-07-06' },
    { empId: 'e4', estado: 'pendiente', fechaInicio: '2026-07-05', fechaFin: '2026-07-05' }, // no aprobada, no cuenta
  ]

  it('ordena por rol (admin, jefe_obra, encargado, empleado) y luego por nombre', () => {
    const { rows } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'date', value: '2026-07-05' } })
    expect(rows.map(r => r.employee.id)).toEqual(['e4', 'e2', 'e3', 'e1'])
  })

  it('excluye empleados dados de baja', () => {
    const { rows } = buildResumenMatrix({ employees, records, vacaciones, period: { mode: 'date', value: '2026-07-05' } })
    expect(rows.some(r => r.employee.id === 'baja1')).toBe(false)
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

  it('sameMonth es true dentro de un mes y false en un rango que cruza meses', () => {
    expect(buildResumenMatrix({ employees, records, period: { mode: 'month', value: '2026-07' } }).sameMonth).toBe(true)
    expect(buildResumenMatrix({ employees, records, period: { mode: 'range', from: '2026-07-30', to: '2026-08-02' } }).sameMonth).toBe(false)
  })

  it('sin periodo válido, produce una matriz vacía sin lanzar', () => {
    const result = buildResumenMatrix({ employees, records, period: null })
    expect(result.days).toEqual([])
    expect(result.rows.every(r => r.cells.length === 0)).toBe(true)
  })
})
