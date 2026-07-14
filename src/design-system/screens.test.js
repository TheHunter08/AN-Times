import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../ui-v2/pages/Dashboard'
import { EmployeeHome } from '../ui-v2/pages/EmployeeHome'
import { ValidateHours } from '../ui-v2/pages/ValidateHours'

const dashboardProps = {
  greeting: 'Resumen general de la empresa',
  greetingSub: 'Datos actualizados',
  kpis: [
    { label: 'Empleados activos', value: '128' },
    { label: 'Trabajando ahora', value: '96', tone: 'primary' },
    { label: 'En descanso', value: '15', tone: 'amber' },
    { label: 'Ausentes hoy', value: '17', tone: 'accent' },
    { label: 'Horas trabajadas hoy', value: '642 h 18 min' },
  ],
  activity: [],
  teamSlot: {
    shown: [{ id: 'emp-1', name: 'Ismael A.' }],
    extra: 2,
    activeCount: 4,
    pauseCount: 1,
    total: 6,
  },
}

function employeeProps(state, callbacks = {
  onStartAction: vi.fn(),
  onBreakAction: vi.fn(),
  onStopAction: vi.fn(),
}) {
  return {
    time: '06:18',
    seconds: ':24',
    dateLabel: 'Martes, 11 de junio',
    state,
    ...callbacks,
    workedLabel: '6 h 18 min',
    remainingLabel: '1 h 42 min',
    progressPct: 77,
    siteLabel: 'Oficina Central',
    greeting: 'Buenos días, Ismael',
    shiftStart: '08:00',
    shiftEnd: '16:00',
    recent: [{ id: '1', label: 'Entrada', time: '08:01', type: 'entrada', tone: 'green' }],
  }
}

describe('V7 administrator dashboard contract', () => {
  it('renders the premium five-metric structure with real prop values', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, dashboardProps))

    expect(html).toContain('class="ti-dashboard"')
    expect(html).toContain('aria-label="Resumen operativo"')
    expect(html.match(/<article class="ti-kpi-card"/g)).toHaveLength(5)
    dashboardProps.kpis.forEach(kpi => {
      expect(html).toContain(kpi.label)
      expect(html).toContain(kpi.value)
    })
    expect(html).toContain('Actividad en tiempo real')
    expect(html).toContain('Distribución del equipo')
    expect(html).toContain('3 trabajando, 1 en descanso y 2 fuera de jornada')
  })

  it('uses a contextual empty state instead of invented activity', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { ...dashboardProps, teamSlot: undefined }))

    expect(html).toContain('Sin actividad registrada todavía')
    expect(html).not.toContain('Ver equipo')
    expect(html).not.toContain('undefined')
  })
})

describe('V7 employee home contract', () => {
  it.each([
    ['idle', 'Iniciar jornada'],
    ['working', 'Finalizar jornada'],
    ['break', 'Finalizar jornada'],
  ])('maps the %s state to the available clock action', (state, actionLabel) => {
    const callbacks = {
      onStartAction: vi.fn(),
      onBreakAction: vi.fn(),
      onStopAction: vi.fn(),
    }
    const html = renderToStaticMarkup(createElement(EmployeeHome, employeeProps(state, callbacks)))

    expect(html).toContain(`data-state="${state}"`)
    expect(html).toContain('class="employee-home-v7__clock-button"')
    expect(html).toContain(`${actionLabel}. Mantén pulsado para confirmar.`)
    expect(html).toContain('Mantén pulsado hasta completar el círculo')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="77"')
    expect(html).toContain('6 h 18 min')
    expect(html).toContain('Oficina Central')
    expect(callbacks.onStartAction).not.toHaveBeenCalled()
    expect(callbacks.onBreakAction).not.toHaveBeenCalled()
    expect(callbacks.onStopAction).not.toHaveBeenCalled()
  })

  it('clamps invalid visual progress without invoking the fichaje callback', () => {
    const onStartAction = vi.fn()
    const html = renderToStaticMarkup(createElement(EmployeeHome, {
      ...employeeProps('idle', {
        onStartAction,
        onBreakAction: vi.fn(),
        onStopAction: vi.fn(),
      }),
      progressPct: Number.NaN,
    }))

    expect(html).toContain('aria-valuenow="0"')
    expect(html).toContain('Objetivo diario')
    expect(onStartAction).not.toHaveBeenCalled()
  })
})

describe('Validación de horas', () => {
  it('expone acciones de modificación y eliminación para un fichaje', () => {
    const html = renderToStaticMarkup(createElement(ValidateHours, {
      rows: [{
        id: 'record-1', empName: 'Ana Pérez', dept: 'Centro', date: '10 jul',
        entry: '08:00', exit: '16:00', worked: '8h0m', expected: '8h 00m',
        diff: '0h', diffTone: 'ok', status: 'pending',
      }],
      onModify: vi.fn(),
      onDelete: vi.fn(),
    }))

    expect(html).toContain('title="Modificar"')
    expect(html).toContain('Eliminar fichaje')
  })
})
