import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconDownload, IconCheck, IconChevronDown, IconX } from '../components/Icons.js'
import { downloadSimplePdf, downloadXlsx, downloadDataUrl } from '../../utils/exportFiles.js'
import { ProductState } from '../components/ProductState.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

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
  records: Array<{ date: string; entry: string; exit: string; hours: string; corrections?: Array<{ ts?: string; by?: string; motivo?: string; device?: string; oldInicio?: string; oldFin?: string; newInicio?: string; newFin?: string }> }>
  // PDF oficial ya generado y firmado (data URL) — si existe, descargar ESTE
  // documento (tiene firma + hash) en vez de regenerar uno en texto plano.
  pdfData?: string | null
}

export interface MonthlyCloseProps {
  items: ClosureItem[]
  onDownload?: (id: string) => void
  onSignAdmin?: (id: string) => void
  onGenerateAll?: () => void
  onDelete?: (id: string) => void
  onDownloadConsolidated?: (mes: string) => void
  canGenerate?: boolean
  generationHint?: string
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
    '',
    'Historial de modificaciones',
    ...(item.records || []).flatMap(r => (r.corrections || []).map(c => `${r.date} | ${c.by || '—'} | ${c.motivo || 'Sin motivo'} | ${c.device || 'Dispositivo no registrado'}`)),
  ]
  await downloadSimplePdf(`Cierre mensual - ${item.empName}`, lines, `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.pdf`)
}

// Si el cierre ya está firmado existe un PDF oficial (con firma + hash SHA-256)
// generado en el momento de la firma — descargar ESE documento, nunca uno
// regenerado, para no perder la firma ni invalidar el hash.
function downloadPdf(item: ClosureItem) {
  if (item.pdfData) {
    downloadDataUrl(item.pdfData, `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.pdf`)
    return
  }
  generatePDF(item)
}

function generateExcel(item: ClosureItem) {
  downloadXlsx(['Fecha', 'Entrada', 'Salida', 'Horas'], (item.records || []).map(r => [r.date, r.entry, r.exit, r.hours]), `cierre-${item.mes}-${item.empName.replace(/\s+/g, '_')}.xlsx`)
}

export function MonthlyClose({ items, onDownload, onSignAdmin, onGenerateAll, onDelete, onDownloadConsolidated, canGenerate = true, generationHint }: MonthlyCloseProps) {
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'signed' | 'pending'>('all')
  const [detail, setDetail] = useState<ClosureItem | null>(null)
  const detailDialogRef = useDialogA11y(Boolean(detail), () => setDetail(null))

  const months = [...new Set(items.map(i => i.month))]
  const monthItems = items.filter(i => monthFilter === 'all' || i.month === monthFilter)
  const filtered = monthItems.filter(i => {
    const signed = i.firmaAdmin && i.firmaEmp
    return statusFilter === 'all' || (statusFilter === 'signed' ? signed : !signed)
  })

  const totalSigned  = monthItems.filter(i => i.firmaAdmin && i.firmaEmp).length
  const totalPending = monthItems.filter(i => !(i.firmaAdmin && i.firmaEmp)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Cierre mensual</PageTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onGenerateAll && (
            <button
              onClick={onGenerateAll}
              disabled={!canGenerate}
              title={generationHint}
              style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${canGenerate ? colors.primary.base : colors.border.default}`, background: canGenerate ? colors.primary.dim : colors.bg[500], color: canGenerate ? colors.primary.light : colors.text[400], fontSize: 12, fontWeight: 700, cursor: canGenerate ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: canGenerate ? 1 : .75 }}
            >
              {canGenerate ? '+ Generar cierre del mes' : 'Disponible el último día'}
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
          {onDownloadConsolidated && (
            <button
              onClick={() => filtered[0] && onDownloadConsolidated(filtered[0].mes)}
              disabled={monthFilter === 'all' || !filtered.length}
              title={monthFilter === 'all' ? 'Selecciona un mes para generar el PDF consolidado' : `PDF consolidado de ${monthFilter}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: 'transparent', color: monthFilter === 'all' ? colors.text[400] : colors.text[700], fontSize: 12, fontWeight: 600, cursor: monthFilter === 'all' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: monthFilter === 'all' ? .6 : 1 }}
            >
              <IconDownload width={13} height={13} /> PDF consolidado
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="uiv2-close-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { id: 'all' as const, label: 'Cierres generados',   value: String(monthItems.length), color: colors.accent.base,     bg: colors.accent.dim },
          { id: 'signed' as const, label: 'Firmados completos',  value: String(totalSigned),    color: colors.semantic.green,  bg: 'rgba(16,185,129,.10)' },
          { id: 'pending' as const, label: 'Pendientes de firma', value: String(totalPending),   color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)' },
        ].map(k => (
          <button
            key={k.id}
            type="button"
            aria-pressed={statusFilter === k.id}
            aria-label={`Filtrar cierres: ${k.label}`}
            onClick={() => setStatusFilter(k.id)}
            style={{ padding: '14px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid ${statusFilter === k.id ? k.color : 'rgba(var(--uiv2-overlay-rgb),.06)'}`, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', boxShadow: statusFilter === k.id ? `0 0 0 2px ${k.bg}` : 'none' }}
          >
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, letterSpacing: '-1px' }}>{k.value}</div>
          </button>
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
                  onClick={() => { onDownload ? onDownload(item.id) : downloadPdf(item) }}
                  title={item.pdfData ? 'Descargar PDF firmado' : 'Generar PDF'}
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
            <ProductState
              compact
              title={items.length === 0 ? 'Aún no hay cierres' : 'No hay cierres con este filtro'}
              description={items.length === 0 ? 'Genera los cierres del mes cuando el periodo esté disponible.' : 'Selecciona otro estado o mes para consultar sus cierres.'}
              actionLabel={items.length === 0 && canGenerate ? 'Generar cierre del mes' : statusFilter !== 'all' ? 'Ver todos los cierres' : undefined}
              onAction={items.length === 0 && canGenerate ? onGenerateAll : statusFilter !== 'all' ? () => setStatusFilter('all') : undefined}
            />
          )}
        </div>
      </div>

      {/* Detail / sign modal */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div ref={detailDialogRef} role="dialog" aria-modal="true" aria-label={`Cierre mensual de ${detail.empName}`} className="uiv2-close-modal" onClick={e => e.stopPropagation()} style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}`, padding: 28, width: '100%', maxWidth: 560, maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: colors.text[900] }}>{detail.empName}</div>
                <div style={{ fontSize: 12, color: colors.text[400] }}>{detail.month} · {detail.role || detail.dept}</div>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Cerrar detalle del cierre" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], display: 'flex', padding: 4 }}>
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
                      <span style={{ fontSize: 12, color: colors.text[700] }}>{r.date}{r.corrections?.length ? <small style={{ display:'block', marginTop:2, color:colors.semantic.orange, fontWeight:700 }}>Modificado · {r.corrections.length}</small> : null}</span>
                      <span style={{ fontSize: 12, color: colors.text[500] }}>{r.entry}</span>
                      <span style={{ fontSize: 12, color: colors.text[500] }}>{r.exit}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{r.hours}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.records.some(r => r.corrections?.length) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Trazabilidad de modificaciones</div>
                <div style={{ display:'grid', gap:8 }}>
                  {detail.records.flatMap(r => (r.corrections || []).map((c, index) => (
                    <div key={`${r.date}-${c.ts || index}`} style={{ padding:'10px 12px', borderRadius:radius.sm, border:`1px solid rgba(245,158,11,.24)`, background:'rgba(245,158,11,.07)', fontSize:11, color:colors.text[500], lineHeight:1.5 }}>
                      <div style={{ color:colors.text[900], fontWeight:700 }}>{r.date} · {c.by || '—'}</div>
                      <div>{c.motivo || 'Sin motivo'} · {c.device || 'Dispositivo no registrado'}</div>
                      <div>{c.oldInicio ? new Date(c.oldInicio).toLocaleString('es-ES') : '—'}–{c.oldFin ? new Date(c.oldFin).toLocaleString('es-ES') : '—'} → {c.newInicio ? new Date(c.newInicio).toLocaleString('es-ES') : '—'}–{c.newFin ? new Date(c.newFin).toLocaleString('es-ES') : '—'}</div>
                    </div>
                  )))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => downloadPdf(detail)}
                style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <IconDownload width={14} height={14} /> {detail.pdfData ? 'Descargar PDF firmado' : 'Descargar PDF'}
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
