import { useState } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'
import { ClockRing } from './ClockRing.js'
import { Dropdown } from './Dropdown.js'
import { IconX, IconPlay } from './Icons.js'

export type PunchType = 'entrada' | 'pausa' | 'salida'

export interface TodayPunch {
  id: string
  label: string
  time: string
  tone: 'green' | 'orange' | 'red'
}

export interface PunchPanelProps {
  time: string
  dateLabel: string
  progressPct: number
  onStart: () => void
  onClose?: () => void
  projects: { value: string; label: string }[]
  tasks: { value: string; label: string }[]
  today: TodayPunch[]
}

const toneDot: Record<TodayPunch['tone'], string> = {
  green: colors.semantic.green,
  orange: colors.semantic.orange,
  red: colors.semantic.red,
}

// Panel "Iniciar fichaje" del admin — réplica de la referencia real:
// anillo + reloj, botón de inicio, selector Entrada/Pausa/Salida,
// proyecto/tarea opcionales, notas, y el listado de fichajes de hoy.
export function PunchPanel({ time, dateLabel, progressPct, onStart, onClose, projects, tasks, today }: PunchPanelProps) {
  const [type, setType] = useState<PunchType>('entrada')
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.lg, padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: colors.text[700] }}>Iniciar fichaje</span>
        {onClose && (
          <button onClick={onClose} style={{ width: 22, height: 22, border: 'none', background: 'transparent', color: colors.text[500], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconX width={14} height={14} />
          </button>
        )}
      </div>

      <div style={{ position: 'relative', width: 168, height: 168, margin: '0 auto' }}>
        <ClockRing pct={progressPct} color={colors.semantic.green} size={168} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: colors.semantic.green }}>Listo para fichar</span>
          <span style={{ fontSize: 24, fontWeight: 640, letterSpacing: '-1px', color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{time}</span>
          <span style={{ fontSize: 10, fontWeight: 400, color: colors.text[500], textAlign: 'center' }}>{dateLabel}</span>
        </div>
      </div>

      <button
        onClick={onStart}
        className="uiv2-punch-start"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 20, padding: '12px', borderRadius: radius.md, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: colors.semantic.green, color: '#fff', fontSize: 13.5, fontWeight: 640,
          boxShadow: `0 10px 24px -12px ${colors.semantic.green}`,
        }}
      >
        <IconPlay width={14} height={14} color="#fff" /> Iniciar fichaje
      </button>

      <div style={{ marginTop: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.text[500] }}>Selecciona el tipo de fichaje</span>
        <div style={{ display: 'flex', gap: 4, marginTop: 8, padding: 3, background: colors.bg[500], borderRadius: radius.sm }}>
          {(['entrada', 'pausa', 'salida'] as PunchType[]).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: radius.xs, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 640, textTransform: 'capitalize',
                background: type === t ? colors.semantic.green : 'transparent',
                color: type === t ? '#fff' : colors.text[500],
                transition: transition(['background', 'color']),
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: colors.text[500], marginBottom: 6 }}>Proyecto (opcional)</div>
          <Dropdown options={projects} value={project} onChange={setProject} placeholder="Seleccionar proyecto" />
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: colors.text[500], marginBottom: 6 }}>Tarea (opcional)</div>
          <Dropdown options={tasks} value={task} onChange={setTask} placeholder="Seleccionar tarea" />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: colors.text[500] }}>Notas (opcional)</span>
            <span style={{ fontSize: 10, color: colors.text[300] }}>{notes.length}/120</span>
          </div>
          <textarea
            value={notes}
            maxLength={120}
            onChange={e => setNotes(e.target.value)}
            placeholder="Añadir notas sobre el fichaje…"
            rows={2}
            style={{
              width: '100%', resize: 'none', padding: '9px 11px', borderRadius: radius.sm,
              border: `1px solid ${colors.border.subtle}`, background: colors.bg[500], color: colors.text[900],
              fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${colors.border.subtle}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 640, color: colors.text[900] }}>Fichajes de hoy</span>
          <a href="#" style={{ fontSize: 11, fontWeight: 600, color: colors.primary.light, textDecoration: 'none' }}>Ver todos →</a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneDot[p.tone], flexShrink: 0 }} />
              <span style={{ flex: 1, color: colors.text[700] }}>{p.label}</span>
              <span style={{ color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{p.time}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`.uiv2-punch-start:hover { filter: brightness(1.08); } .uiv2-punch-start:active { transform: scale(.98); }`}</style>
    </div>
  )
}
