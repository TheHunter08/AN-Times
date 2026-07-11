import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { IconArrowLeft, IconArrowRight, IconClock } from '../components/Icons.js'

export interface ShiftCell {
  type?: 'normal' | 'guardia' | 'libre' | 'vacaciones'
  start?: string
  end?: string
}

export interface ShiftEmployee {
  id: string
  name: string
  dept: string
  week: ShiftCell[] // 7 entries: Mon-Sun
}

export interface ShiftsProps {
  weekLabel: string
  employees: ShiftEmployee[]
  onPrev?: () => void
  onNext?: () => void
  onToday?: () => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const shiftStyle: Record<string, { bg: string; color: string; label: string }> = {
  normal:     { bg: 'rgba(99,102,241,.18)',  color: '#818CF8', label: 'Normal' },
  guardia:    { bg: 'rgba(245,158,11,.18)',   color: colors.semantic.orange, label: 'Guardia' },
  libre:      { bg: 'rgba(16,185,129,.16)',   color: colors.semantic.green, label: 'Libre' },
  vacaciones: { bg: 'rgba(59,130,246,.16)',   color: colors.accent.base, label: 'Vacaciones' },
}

export function Shifts({ weekLabel, employees, onPrev, onNext, onToday }: ShiftsProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>Turnos</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onPrev} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowLeft width={15} height={15} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], minWidth: 150, textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={onNext} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowRight width={15} height={15} />
          </button>
          <button onClick={onToday} style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: colors.bg[500], color: colors.text[700], fontSize: 12, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit' }}>
            Hoy
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {Object.entries(shiftStyle).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500] }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.color}` }} />
            {v.label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 180, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], borderBottom: `1px solid ${colors.border.subtle}` }}>Empleado</th>
              {DAY_NAMES.map((d, i) => (
                <th key={d} style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: i >= 5 ? colors.text[300] : colors.text[500], borderBottom: `1px solid ${colors.border.subtle}` }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, ri) => (
              <tr key={emp.id}>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border.subtle}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={emp.name} size={28} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text[900] }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: colors.text[500] }}>{emp.dept}</div>
                    </div>
                  </div>
                </td>
                {emp.week.map((cell, di) => {
                  const cellKey = `${emp.id}-${di}`
                  const s = cell.type ? shiftStyle[cell.type] : null
                  return (
                    <td key={di} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${colors.border.subtle}` }}
                      onMouseEnter={() => setHoveredCell(cellKey)}
                      onMouseLeave={() => setHoveredCell(null)}>
                      {s ? (
                        <div style={{ padding: '6px 4px', borderRadius: radius.sm, background: s.bg, border: `1px solid ${s.color}44`, cursor: 'default' }}>
                          {cell.start && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 10.5, color: s.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              <IconClock width={10} height={10} />
                              {cell.start}
                            </div>
                          )}
                          {!cell.start && (
                            <div style={{ fontSize: 10.5, color: s.color, fontWeight: 700 }}>{s.label}</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ height: 30, borderRadius: radius.xs, border: `1px dashed ${colors.border.subtle}`, opacity: .4 }} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
