import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconArrowLeft, IconArrowRight, IconClock } from '../components/Icons.js'

export interface PlanCell {
  status: 'ok' | 'live' | 'turno' | 'absent' | 'vac' | 'weekend' | 'future'
  value?: string
}

export interface PlanEmployee {
  id: string
  name: string
  dept: string
  week: PlanCell[] // 7: Mon-Sun
}

export interface PlanningProps {
  weekLabel: string
  days: string[] // ['Lun 7', 'Mar 8', ...]
  employees: PlanEmployee[]
  onPrev?: () => void
  onNext?: () => void
  onToday?: () => void
}

const cellDef: Record<PlanCell['status'], { bg: string; color: string; border: string }> = {
  ok:      { bg: 'rgba(16,185,129,.14)',  color: colors.semantic.green, border: 'rgba(16,185,129,.35)' },
  live:    { bg: 'rgba(16,185,129,.26)',  color: '#34D399', border: '#34D399' },
  turno:   { bg: colors.primary.dim,      color: colors.primary.light, border: colors.primary.base + '55' },
  absent:  { bg: 'rgba(239,68,68,.12)',   color: colors.semantic.red, border: 'rgba(239,68,68,.3)' },
  vac:     { bg: 'rgba(59,130,246,.14)',  color: colors.accent.base, border: 'rgba(59,130,246,.35)' },
  weekend: { bg: 'rgba(var(--uiv2-overlay-rgb),.03)', color: colors.text[300], border: colors.border.subtle },
  future:  { bg: 'transparent',           color: colors.text[300], border: colors.border.subtle },
}

const LEGEND = [
  { status: 'ok', label: 'Trabajó' },
  { status: 'live', label: 'En curso' },
  { status: 'turno', label: 'Turno' },
  { status: 'absent', label: 'Ausente' },
  { status: 'vac', label: 'Vacaciones' },
  { status: 'weekend', label: 'Fin de semana' },
] as const

export function Planning({ weekLabel, days, employees, onPrev, onNext, onToday }: PlanningProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>Planning semanal</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onPrev} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowLeft width={15} height={15} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], minWidth: 160, textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={onNext} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowRight width={15} height={15} />
          </button>
          <button onClick={onToday} style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: colors.bg[500], color: colors.text[700], fontSize: 12, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit' }}>Hoy</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {LEGEND.map(l => (
          <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500] }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cellDef[l.status].bg, border: `1.5px solid ${cellDef[l.status].border}` }} />
            {l.label}
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 110, padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500] }}>Empleado</th>
              {days.map((d, i) => (
                <th key={i} style={{ padding: '6px 2px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: i >= 5 ? colors.text[300] : colors.text[500] }}>
                  <div style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>{d.split(' ')[0]}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: i >= 5 ? colors.text[300] : colors.text[900], letterSpacing: '-.3px' }}>{d.split(' ')[1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td style={{ padding: '4px 8px', verticalAlign: 'middle', width: 110 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Avatar name={emp.name} size={24} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.text[900], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                        {emp.name.split(' ')[0]}
                      </div>
                      <div style={{ fontSize: 9.5, color: colors.text[500], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                        {emp.name.split(' ').slice(1).join(' ') || emp.dept}
                      </div>
                    </div>
                  </div>
                </td>
                {emp.week.map((cell, di) => {
                  const def = cellDef[cell.status]
                  return (
                    <td key={di} style={{ padding: '4px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{
                        padding: '4px 2px', borderRadius: radius.sm, minHeight: 30,
                        background: def.bg, border: `1px solid ${def.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {cell.status === 'live' && (
                          <span style={{ position: 'absolute', top: 2, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 0 2px rgba(52,211,153,.25)', animation: 'pulse 2s infinite' }} />
                        )}
                        {cell.value ? (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: def.color, fontVariantNumeric: 'tabular-nums' }}>{cell.value}</span>
                        ) : (
                          <span style={{ fontSize: 9, color: def.color, fontWeight: 700 }}>
                            {cell.status === 'absent' ? '—' : cell.status === 'vac' ? 'VAC' : cell.status === 'weekend' ? '·' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity:1 } 50% { opacity:.5 } }`}</style>
    </div>
  )
}
