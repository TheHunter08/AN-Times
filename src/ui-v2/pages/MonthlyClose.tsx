import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconFileText, IconDownload, IconCheck, IconChevronDown, IconX } from '../components/Icons.js'
import { downloadSimplePdf, downloadExcel } from '../../utils/exportFiles.js'

export interface ClosureItem {
  id: string
  empId: string
  empName: string
  dept: string
  role: string
  month: string
  mes: string        // 'YYYY-MM' for internal use
  totalHours: string
  totalMins: number
  extraHours: string
  extraMins: number
  workedDays: number
  signedBy: 'none' | 'emp' | 'supervisor' | 'all'
  firmaAdmin: boolean
  firmaEmp: boolean
  firmaSupervisor: boolean  // encargado o jefe de obra
  supervisorName?: string
  generatedOn: string
  estado: string
  records: Array<{ date: string; entry: string; exit: string; hours: string }>
}

export interface MonthlyCloseProps {
  items: ClosureItem[]
  onDownload?: (id: string) => void
  onSignAdmin?: (id: string) => void
  onGenerateAll?: () => void
  onDelete?: (id: string) => void
}

const signLabel = (item: ClosureItem) => {
  const count = [item.firmaAdmin, item.firmaEmp, item.firmaSupervisor].filter(Boolean).length
  const needed = item.firmaSupervisor !== undefined ? 3 : 2
  if (count === 0) return 'Sin firmas'
  if (count >= needed || (item.firmaAdmin && item.firmaEmp)) return 'Firmado'
  return `${count} de ${item.firmaSupervisor !== undefined ? 3 : 2} firmas`
}
const signTone = (item: ClosureItem): 'gray' | 'orange' | 'green' => {
  if (item.firmaAdmin && item.firmaEmp) return 'green'
  if (item.firmaAdmin || item.firmaEmp || item.firmaSupervisor) return 'orange'
  return 'gray'
}

async function generatePDF(item: ClosureItem) {
  const lines = [
    `Empleado: ${item.empName}`,
    `Mes: ${item.month}`,
    `Dias trabajados: ${item.workedDays}`,
    `Horas totales: ${item.totalHours}`,
    `Horas extra: ${item.extraHours}`,
    '',
    'Fecha | Entrada | Salida | Horas',
    ...(item.records || []).map(r => `${r.date} | ${r.entry} | ${r.exit} | ${r.hours}`),
  ]
  await downloadSimplePdf(`Cierre mensual - ${item.empName}`, lines, `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.pdf`)
}

function generateExcel(item: ClosureItem) {
  downloadExcel(['Fecha', 'Entrada', 'Salida', 'Horas'], (item.records || []).map(r => [r.date, r.entry, r.exit, r.hours]), `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.xls`)
}

function legacyGeneratePDF(item: ClosureItem) {
  const rows = (item.records || []).map(r =>
    `<tr><td>${r.date}</td><td>${r.entry}</td><td>${r.exit}</td><td>${r.hours}</td></tr>`
  ).join('')

  const firmaAdminMark = item.firmaAdmin ? '&#10003; Firmado' : '_____________________'
  const firmaEmpMark   = item.firmaEmp   ? '&#10003; Firmado' : '_____________________'
  const firmaSuperMark = item.firmaSupervisor ? '&#10003; Firmado' : '_____________________'

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Cierre mensual · ${item.empName} · ${item.month}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 32px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
  .kpi-row { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .kpi { padding: 12px 18px; border: 1px solid #e0e0e0; border-radius: 6px; min-width: 110px; }
  .kpi-val { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .kpi-lbl { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 2px solid #ddd; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  .firma-section { display: flex; gap: 48px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #ddd; flex-wrap: wrap; }
  .firma-box { flex: 1; min-width: 160px; }
  .firma-line { font-size: 11px; color: #888; margin-top: 6px; }
  .firma-name { font-weight: 600; margin-bottom: 24px; }
  .firma-val { font-size: 13px; color: #1a7a1a; font-weight: 600; }
</style>
</head>
<body>
<h1>Cierre Mensual de Horas</h1>
<div class="sub">${item.month} &middot; Generado el ${new Date().toLocaleDateString('es-ES')}</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-lbl">Empleado</div><div class="kpi-val" style="font-size:14px">${item.empName}</div></div>
  <div class="kpi"><div class="kpi-lbl">Centro / Depto</div><div class="kpi-val" style="font-size:13px">${item.dept || '&mdash;'}</div></div>
  <div class="kpi"><div class="kpi-lbl">D&iacute;as trabajados</div><div class="kpi-val">${item.workedDays}</div></div>
  <div class="kpi"><div class="kpi-lbl">Horas totales</div><div class="kpi-val">${item.totalHours}</div></div>
  <div class="kpi"><div class="kpi-lbl">Horas extra</div><div class="kpi-val" style="color:${item.extraMins > 0 ? '#d97706' : '#1a1a1a'}">${item.extraHours}</div></div>
</div>
<table>
  <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" style="color:#999;text-align:center;padding:16px">Sin registros este mes</td></tr>'}</tbody>
</table>
<div class="firma-section">
  <div class="firma-box">
    <div class="firma-name">Empleado</div>
    <div class="firma-val">${firmaEmpMark}</div>
    <div class="firma-line">${item.empName}</div>
  </div>
  ${item.supervisorName ? `<div class="firma-box"><div class="firma-name">Encargado / Jefe de obra</div><div class="firma-val">${firmaSuperMark}</div><div class="firma-line">${item.supervisorName}</div></div>` : ''}
  <div class="firma-box">
    <div class="firma-name">Administrador</div>
    <div class="firma-val">${firmaAdminMark}</div>
    <div class="firma-line">Times INC</div>
  </div>
</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function MonthlyClose({ items, onDownload, onSignAdmin, onGenerateAll, onDelete }: MonthlyCloseProps) {
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [detail, setDetail] = useState<ClosureItem | null>(null)

  const months = [...new Set(items.map(i => i.month))]
  const filtered = items.filter(i => monthFilter === 'all' || i.month === monthFilter)

  const totalSigned  = items.filter(i => i.firmaAdmin && i.firmaEmp).length
  const totalPending = items.filter(i => !(i.firmaAdmin && i.firmaEmp)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Cierre mensual</PageTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onGenerateAll && (
            <button
              onClick={onGenerateAll}
              style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${colors.primary.base}`, background: colors.primary.dim, color: colors.primary.light, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Generar mes actual
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <select
              value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              style={{ appearance: 'none', padding: '7px 30px 7px 12px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
            >
              <option value="all">Todos los meses</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <IconChevronDown width={12} height={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="uiv2-close-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Cierres generados',   value: String(items.length),       color: colors.accent.base,      bg: colors.accent.dim },
          { label: 'Firmados completos',  value: String(totalSigned),        color: colors.semantic.green,   bg: 'rgba(16,185,129,.10)' },
          { label: 'Pendientes de firma', value: String(totalPending),       color: colors.semantic.orange,  bg: 'rgba(245,158,11,.10)' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)` }}>
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, letterSpacing: '-1px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`, overflow: 'hidden' }}>
        <div style={{ background: colors.bg[700] }}>
          <div className="uiv2-close-table-head" style={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px 90px 180px 130px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${colors.border.subtle}` }}>
            {['Empleado', 'Mes', 'Horas', 'Extra', 'Firmas', 'Acciones'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500] }}>{h}</div>
            ))}
          </div>

          {filtered.map((item, i) => (
            <div key={item.id} className="uiv2-close-row" style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 90px 90px 180px 130px', gap: 8,
              padding: '12px 16px', alignItems: 'center',
              borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${colors.border.subtle}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={item.empName} size={30} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[900] }}>{item.empName}</div>
                  <div style={{ fontSize: 11, color: colors.text[500] }}>{item.role || item.dept}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: colors.text[700] }}>{item.month}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{item.totalHours}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.extraMins > 0 ? colors.semantic.orange : colors.text[700], fontVariantNumeric: 'tabular-nums' }}>{item.extraHours}</div>

              {/* Firma indicators */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { label: 'Emp', ok: item.firmaEmp },
                  ...(item.supervisorName ? [{ label: 'Enc', ok: item.firmaSupervisor }] : []),
                  { label: 'Admin', ok: item.firmaAdmin },
                ].map(f => (
                  <span key={f.label} style={{
                    padding: '2px 7px', borderRadius: radius.pill, fontSize: 10.5, fontWeight: 700,
                    background: f.ok ? 'rgba(16,185,129,.15)' : 'rgba(var(--uiv2-overlay-rgb),.06)',
                    color: f.ok ? colors.semantic.green : colors.text[400],
                    border: `1px solid ${f.ok ? 'rgba(16,185,129,.3)' : colors.border.subtle}`,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {f.ok && <IconCheck width={9} height={9} />}{f.label}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { onDownload ? onDownload(item.id) : generatePDF(item) }}
                  title="Generar PDF"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: radius.xs, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}
                >
                  <IconDownload width={13} height={13} /> PDF
                </button>
                <button onClick={() => generateExcel(item)} title="Generar Excel" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: radius.xs, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                  <IconDownload width={13} height={13} /> Excel
                </button>
                <button
                  onClick={() => setDetail(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: radius.xs, border: 'none', background: colors.primary.dim, color: colors.primary.light, cursor: 'pointer', fontSize: 11, fontWeight: 640, fontFamily: 'inherit' }}
                >
                  Ver
                </button>
                {onDelete && !(item.firmaAdmin || item.firmaEmp) && (
                  <button
                    onClick={() => onDelete(item.id)}
                    title="Eliminar cierre y PDF"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: radius.xs, border: '1px solid rgba(239,68,68,.28)', background: 'transparent', color: colors.semantic.red, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    <IconX width={13} height={13} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>
              {items.length === 0
                ? 'No hay cierres generados. Pulsa "Generar mes actual" para crear los cierres del mes en curso.'
                : 'Sin cierres para el mes seleccionado.'}
            </div>
          )}
        </div>
      </div>

      {/* Detail / sign modal */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="uiv2-close-modal" onClick={e => e.stopPropagation()} style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}`, padding: 28, width: '100%', maxWidth: 560, maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: colors.text[900] }}>{detail.empName}</div>
                <div style={{ fontSize: 12, color: colors.text[400] }}>{detail.month} · {detail.role || detail.dept}</div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], display: 'flex', padding: 4 }}>
                <IconX width={18} height={18} />
              </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Días trabajados', value: String(detail.workedDays) },
                { label: 'Horas totales',   value: detail.totalHours },
                { label: 'Horas extra',     value: detail.extraHours, warn: detail.extraMins > 0 },
              ].map(k => (
                <div key={k.label} style={{ padding: '10px 14px', borderRadius: radius.md, background: colors.bg[700], border: `1px solid ${colors.border.subtle}` }}>
                  <div style={{ fontSize: 10, color: colors.text[400], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: k.warn ? colors.semantic.orange : colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Firma status */}
            <div style={{ padding: '14px 16px', borderRadius: radius.md, background: colors.bg[700], border: `1px solid ${colors.border.subtle}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Estado de firmas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { role: 'Empleado', signed: detail.firmaEmp, name: detail.empName },
                  ...(detail.supervisorName ? [{ role: 'Encargado / Jefe de obra', signed: detail.firmaSupervisor, name: detail.supervisorName }] : []),
                  { role: 'Administrador', signed: detail.firmaAdmin, name: 'Times INC' },
                ].map(f => (
                  <div key={f.role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: radius.sm, background: f.signed ? 'rgba(16,185,129,.08)' : 'rgba(var(--uiv2-overlay-rgb),.04)', border: `1px solid ${f.signed ? 'rgba(16,185,129,.2)' : colors.border.subtle}` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text[700] }}>{f.role}</div>
                      <div style={{ fontSize: 11, color: colors.text[400] }}>{f.name}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: f.signed ? colors.semantic.green : colors.text[400], display: 'flex', alignItems: 'center', gap: 4 }}>
                      {f.signed ? <><IconCheck width={12} height={12} /> Firmado</> : 'Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Registro diario */}
            {detail.records.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Registro diario</div>
                <div style={{ borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`, overflow: 'hidden' }}>
                  {detail.records.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 8, padding: '8px 12px', borderBottom: i === detail.records.length - 1 ? 'none' : `1px solid ${colors.border.subtle}`, background: i % 2 === 0 ? 'transparent' : 'rgba(var(--uiv2-overlay-rgb),.02)' }}>
                      <span style={{ fontSize: 12, color: colors.text[700] }}>{r.date}</span>
                      <span style={{ fontSize: 12, color: colors.text[500] }}>{r.entry}</span>
                      <span style={{ fontSize: 12, color: colors.text[500] }}>{r.exit}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{r.hours}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => generatePDF(detail)}
                style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <IconDownload width={14} height={14} /> Descargar PDF
              </button>
              <button onClick={() => generateExcel(detail)} style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Descargar Excel
              </button>
              {!detail.firmaAdmin && onSignAdmin && (
                <button
                  onClick={() => { onSignAdmin(detail.id); setDetail(null) }}
                  style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <IconCheck width={14} height={14} /> Firmar como admin
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
