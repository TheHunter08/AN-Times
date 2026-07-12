import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from './components/Button'
import { Card } from './components/Card'
import { CircularProgress } from './components/CircularProgress'
import { EmptyState } from './components/EmptyState'
import { MetricCard } from './components/MetricCard'
import { Progress } from './components/Progress'
import { StatusBadge } from './components/StatusBadge'
import { Timeline } from './components/Timeline'

describe('TIMES INC V7 base components', () => {
  it('renders button variants and exposes an accessible loading state', () => {
    const html = renderToStaticMarkup(createElement(Button, {
      variant: 'primary',
      size: 'lg',
      loading: true,
      loadingLabel: 'Guardando cambios',
      fullWidth: true,
      children: 'Guardar',
    }))

    expect(html).toContain('type="button"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('ds-button--primary')
    expect(html).toContain('ds-button--lg')
    expect(html).toContain('ds-button--full')
    expect(html).toContain('Guardando cambios')
  })

  it('keeps card selection and metric semantics in the generated markup', () => {
    const html = renderToStaticMarkup(createElement(MetricCard, {
      label: 'Trabajando ahora',
      value: '18',
      tone: 'success',
      trend: { direction: 'up', label: '+2 desde ayer' },
      supportingText: 'de 24 empleados',
      selected: true,
    }))

    expect(html).toContain('data-selected="true"')
    expect(html).toContain('ds-metric-card')
    expect(html).toContain('ds-tone--success')
    expect(html).toContain('Trabajando ahora')
    expect(html).toContain('ds-tabular-numbers')
    expect(html).toContain('+2 desde ayer')
    expect(html).toContain('de 24 empleados')

    const interactiveCard = renderToStaticMarkup(createElement(Card, { interactive: true }, 'Detalle'))
    expect(interactiveCard).toContain('ds-card--interactive')
  })

  it('clamps linear and circular progress values and keeps their ARIA contract', () => {
    const linear = renderToStaticMarkup(createElement(Progress, {
      value: 140,
      max: 100,
      label: 'Objetivo diario',
      showValue: true,
      tone: 'brand',
    }))
    const circular = renderToStaticMarkup(createElement(CircularProgress, {
      value: -5,
      max: 100,
      valueLabel: '0 h',
      ariaLabel: 'Horas trabajadas',
    }))

    expect(linear).toContain('role="progressbar"')
    expect(linear).toContain('aria-valuenow="100"')
    expect(linear).toContain('aria-valuetext="100%"')
    expect(linear).toContain('scaleX(1)')
    expect(circular).toContain('aria-label="Horas trabajadas"')
    expect(circular).toContain('aria-valuenow="0"')
    expect(circular).toContain('aria-valuetext="0 h"')
  })

  it('renders semantic statuses, contextual empty states and an ordered timeline', () => {
    const badge = renderToStaticMarkup(createElement(StatusBadge, { tone: 'warning' }, 'Solicitud pendiente'))
    const empty = renderToStaticMarkup(createElement(EmptyState, {
      title: 'Sin fichajes',
      description: 'No hay registros para este periodo',
      compact: true,
    }))
    const timeline = renderToStaticMarkup(createElement(Timeline, {
      ariaLabel: 'Historial del día',
      items: [
        { id: 'in', title: 'Entrada', time: '08:01', description: 'Oficina Central', tone: 'success' },
        { id: 'pause', title: 'Inicio de descanso', time: '12:32', tone: 'warning' },
      ],
    }))

    expect(badge).toContain('ds-tone--warning')
    expect(badge).toContain('Solicitud pendiente')
    expect(empty).toContain('ds-empty-state--compact')
    expect(empty).toContain('No hay registros para este periodo')
    expect(timeline).toContain('<ol')
    expect(timeline).toContain('aria-label="Historial del día"')
    expect(timeline.match(/ds-timeline__item/g)).toHaveLength(2)
    expect(timeline).toContain('<time')
  })
})
