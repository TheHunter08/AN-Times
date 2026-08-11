import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconDownload, IconFileText } from '../components/Icons.js'
import { buildDuplicateNameLabels } from '../../utils/employeeLabels.js'

export type ResumenPeriodMode = 'month' | 'date' | 'range'

export interface ResumenCell {
  date: string
  minutes: number
  hours: number
  isVacation: boolean
  isWeekend: boolean
  isAbsent: boolean
}

export interface ResumenRow {
  employee: { id: string; name: string }
  roleLabel: string
  cells: ResumenCell[]
  totalHours: number
}

export interface ResumenProps {
  employees: Array<{ id: string; name: string; dept?: string }>
  employeeId: string | null
  onChangeEmployee: (id: string | null) => void
  mode: ResumenPeriodMode
  onChangeMode: (mode: ResumenPeriodMode) => void
  monthValue: string
  onChangeMonth: (value: string) => void
  dateValue: string
  onChangeDate: (value: string) => void
  rangeFrom: string
  rangeTo: string
  onChangeRangeFrom: (value: string) => void
  onChangeRangeTo: (value: string) => void
  days: string[]
  dayLabel: (date: string) => string
  rows: ResumenRow[]
  onExportPdf: () => void
  onExportExcel: () => void
  exportingPdf?: boolean
  exportingExcel?: boolean
}

function fmtHours(hours: number): string {
  if (!hours) return ''
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

const MODES: Array<{ value: ResumenPeriodMode; label: string }> = [
  { value: 'month', label: 'Mes' },
  { value: 'date', label: 'Fecha específica' },
  { value: 'range', label: 'Rango de fechas' },
]

const fieldStyle: CSSProperties = {
  padding: '8px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
  background: colors.bg[700], color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

export function Resumen(props: ResumenProps) {
  const {
    employees, employeeId, onChangeEmployee,
    mode, onChangeMode, monthValue, onChangeMonth, dateValue, onChangeDate,
    rangeFrom, rangeTo, onChangeRangeFrom, onChangeRangeTo,
    days, dayLabel, rows, onExportPdf, onExportExcel, exportingPdf, exportingExcel,
  } = props
  const employeeLabels = useMemo(() => buildDuplicateNameLabels(employees), [employees])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Resumen</PageTitle>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: colors.text[500] }}>
            Horas trabajadas por empleado y día — filtra por persona y periodo, luego exporta.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" size="sm" icon={<IconDownload width={13} height={13} />} onClick={onExportExcel} disabled={exportingExcel}>
            {exportingExcel ? 'Generando…' : 'Excel'}
          </Button>
          <Button variant="primary" size="sm" icon={<IconFileText width={13} height={13} />} onClick={onExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Generando…' : 'PDF'}
          </Button>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Empleado</div>
          <select value={employeeId ?? ''} onChange={e => onChangeEmployee(e.target.value || null)} style={{ ...fieldStyle, minWidth: 220 }}>
            <option value="">Todos los empleados</option>
            {employees.map(e => <option key={e.id} value={e.id}>{employeeLabels.get(e.id) || e.name}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Periodo</div>
          <div style={{ display: 'flex', gap: 6, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.md, padding: 3 }}>
            {MODES.map(m => (
              <button key={m.value} type="button" onClick={() => onChangeMode(m.value)} style={{
                padding: '7px 12px', borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: mode === m.value ? colors.primary.base : 'transparent',
                color: mode === m.value ? '#fff' : colors.text[500],
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        {mode === 'month' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Mes</div>
            <input type="month" value={monthValue} onChange={e => onChangeMonth(e.target.value)} style={fieldStyle} />
          </div>
        )}
        {mode === 'date' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Fecha</div>
            <input type="date" value={dateValue} onChange={e => onChangeDate(e.target.value)} style={fieldStyle} />
          </div>
        )}
        {mode === 'range' && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Desde</div>
              <input type="date" value={rangeFrom} onChange={e => onChangeRangeFrom(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Hasta</div>
              <input type="date" value={rangeTo} onChange={e => onChangeRangeTo(e.target.value)} style={fieldStyle} />
            </div>
          </>
        )}
      </div>

      {/* Matriz */}
      {days.length === 0 || rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.text[500], fontSize: 13, background: colors.bg[700], borderRadius: radius.lg, border: `1px solid ${colors.border.subtle}` }}>
          {days.length === 0 ? 'Selecciona un periodo válido.' : 'No hay empleados que coincidan con el filtro.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${colors.border.subtle}`, borderRadius: radius.lg }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, isolation: 'isolate', background: colors.bg[600], color: colors.text[500], textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', minWidth: 170, borderBottom: `1px solid ${colors.border.default}` }}>Empleado</th>
                <th style={{ background: colors.bg[600], color: colors.text[500], textAlign: 'left', padding: '10px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', minWidth: 110, borderBottom: `1px solid ${colors.border.default}` }}>Rol</th>
                {days.map(d => (
                  <th key={d} style={{ background: colors.bg[600], color: colors.text[500], textAlign: 'center', padding: '10px 6px', fontSize: 11, fontWeight: 700, minWidth: 40, borderBottom: `1px solid ${colors.border.default}` }}>{dayLabel(d)}</th>
                ))}
                <th style={{ background: colors.bg[600], color: colors.text[900], textAlign: 'right', padding: '10px 12px', fontSize: 11, fontWeight: 800, minWidth: 70, borderBottom: `1px solid ${colors.border.default}` }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.employee.id} style={{ background: rowIndex % 2 ? colors.bg[700] : 'transparent' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, isolation: 'isolate', background: rowIndex % 2 ? colors.bg[700] : colors.bg[800], padding: '8px 12px', color: colors.text[900], fontWeight: 600, whiteSpace: 'nowrap', borderBottom: `1px solid ${colors.border.subtle}` }}>{row.employee.name}</td>
                  <td style={{ padding: '8px 10px', color: colors.text[500], fontSize: 11.5, whiteSpace: 'nowrap', borderBottom: `1px solid ${colors.border.subtle}` }}>{row.roleLabel}</td>
                  {row.cells.map(cell => (
                    <td key={cell.date} style={{
                      textAlign: 'center', padding: '8px 4px', borderBottom: `1px solid ${colors.border.subtle}`,
                      background: cell.isVacation ? colors.primary.dim : undefined,
                      color: cell.minutes > 0 ? colors.text[900] : cell.isAbsent ? colors.semantic.red : colors.text[300],
                      fontWeight: cell.minutes > 0 || cell.isAbsent ? 600 : 400,
                      fontSize: cell.isAbsent || cell.isWeekend ? 10 : undefined,
                    }}>
                      {cell.minutes > 0 ? fmtHours(cell.hours) : cell.isVacation ? 'Vac' : cell.isAbsent ? 'Ausente' : cell.isWeekend ? 'Descanso' : '-'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', padding: '8px 12px', color: colors.text[900], fontWeight: 800, borderBottom: `1px solid ${colors.border.subtle}` }}>{fmtHours(row.totalHours) || '0h'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
