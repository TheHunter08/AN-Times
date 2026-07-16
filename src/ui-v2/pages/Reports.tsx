import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconFileText, IconDownload, IconShield, IconCheck, IconAlertCircle } from '../components/Icons.js'

export interface ReportRow {
  id: string
  name: string
  description: string
  generatedOn: string
  onDownload?: (id: string) => void
  onDownloadExcel?: (id: string) => void
}

export interface ReportsProps {
  rows: ReportRow[]
  compliance?: {
    score: number
    retainedRecords: number
    completionPct: number
    traceabilityPct: number
    validationPct: number
    closurePct: number
    oldestRecord: string | null
    risks: Array<{ id: string; tone: string; count: number; label: string; destination: string }>
  }
  onExportInspection?: () => void
  onExportAudit?: () => void
  onExportPayroll?: () => void
  onNavigate?: (page: string) => void
}

// Bandeja de informes descargables — el mismo concepto que ya existe en
// la app real (informe de registro horario para Inspección de Trabajo,
// RD 8/2019), aquí con su propia pantalla en vez de un icono suelto en
// "Accesos rápidos" que no llevaba a ningún sitio.
export function Reports({ rows, compliance, onExportInspection, onExportAudit, onExportPayroll, onNavigate }: ReportsProps) {
  const healthy = (compliance?.score || 0) >= 90
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1040 }}>
      <div className="uiv2-compliance-heading">
        <div>
          <PageTitle>Centro de cumplimiento</PageTitle>
          <p style={{ margin:'6px 0 0', fontSize:12.5, lineHeight:1.55, color:colors.text[500] }}>Registro horario, conservación, trazabilidad y documentación preparada para revisión.</p>
        </div>
        <div className="uiv2-compliance-actions">
          {onExportAudit && <button onClick={onExportAudit}><IconDownload width={13} height={13}/> Auditoría CSV</button>}
          {onExportPayroll && <button onClick={onExportPayroll}><IconDownload width={13} height={13}/> Nómina CSV</button>}
          {onExportInspection && <button className="is-primary" onClick={onExportInspection}><IconShield width={14} height={14}/> Paquete de inspección</button>}
        </div>
      </div>

      {compliance && <>
        <section className="uiv2-compliance-hero" aria-label="Estado de cumplimiento">
          <div className={`uiv2-compliance-score${healthy ? ' is-healthy' : ''}`}>
            <span>{healthy ? <IconCheck width={22} height={22}/> : <IconAlertCircle width={22} height={22}/>}</span>
            <div><strong>{compliance.score}%</strong><small>Índice documental</small></div>
          </div>
          <div className="uiv2-compliance-copy">
            <strong>{healthy ? 'Documentación preparada' : 'Hay puntos que requieren revisión'}</strong>
            <span>{compliance.retainedRecords} registros dentro del periodo legal · conservación mínima de 4 años</span>
          </div>
          <div className="uiv2-compliance-legal">Art. 34.9 ET</div>
        </section>

        <section className="uiv2-compliance-metrics" aria-label="Indicadores de cumplimiento">
          {[
            ['Jornadas completas', compliance.completionPct],
            ['Trazabilidad de cambios', compliance.traceabilityPct],
            ['Registros validados', compliance.validationPct],
            ['Cierres firmados', compliance.closurePct],
          ].map(([label, value]) => <Card key={String(label)} padding={4}>
            <div className="uiv2-compliance-metric"><span>{label}</span><strong>{value}%</strong><div><i style={{ width:`${value}%` }}/></div></div>
          </Card>)}
        </section>

        <Card>
          <div className="uiv2-compliance-section-title"><div><strong>Riesgos y excepciones</strong><span>Solo se muestran elementos que requieren una decisión.</span></div><span>{compliance.risks.length}</span></div>
          <div className="uiv2-compliance-risks">
            {compliance.risks.map(risk => <button key={risk.id} onClick={() => onNavigate?.(risk.destination)}>
              <span className={`tone-${risk.tone}`}><IconAlertCircle width={14} height={14}/></span>
              <div><strong>{risk.label}</strong><small>{risk.count ? `${risk.count} elementos` : 'Sin actividad registrada'}</small></div>
              <b>Revisar →</b>
            </button>)}
          </div>
        </Card>
      </>}

      <div><h2 style={{ margin:0, fontSize:19, color:colors.text[900], letterSpacing:'-.35px' }}>Informes mensuales</h2><p style={{ margin:'5px 0 0', fontSize:12, color:colors.text[500] }}>PDF y Excel con detalle de jornada y modificaciones.</p></div>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="uiv2-report-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px',
                borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.border.subtle}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: radius.sm, background: colors.primary.dim, color: colors.primary.light, flexShrink: 0 }}>
                <IconFileText width={17} height={17} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: colors.text[500] }}>{r.description}</div>
              </div>
              <span style={{ fontSize: 11, color: colors.text[500], flexShrink: 0 }}>{r.generatedOn}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {r.onDownloadExcel && (
                  <button
                    onClick={() => r.onDownloadExcel?.(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[500], color: colors.text[700], fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <IconDownload width={12} height={12} /> Excel
                  </button>
                )}
                <button
                  onClick={() => r.onDownload?.(r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[500], color: colors.text[900], fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <IconDownload width={13} height={13} /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <style>{`
        .uiv2-report-row:hover { background: rgba(var(--uiv2-overlay-rgb),.02); }
        .uiv2-compliance-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}.uiv2-compliance-actions{display:flex;gap:8px;flex-wrap:wrap}.uiv2-compliance-actions button{min-height:38px;padding:0 13px;border-radius:10px;border:1px solid var(--uiv2-border-default);background:var(--uiv2-bg-500);color:var(--uiv2-text-700);display:inline-flex;align-items:center;gap:6px;font:650 11.5px inherit;cursor:pointer}.uiv2-compliance-actions button.is-primary{border-color:var(--uiv2-primary-base);background:var(--uiv2-primary-base);color:#fff}.uiv2-compliance-hero{display:flex;align-items:center;gap:18px;padding:18px;border:1px solid var(--uiv2-border-default);border-radius:16px;background:linear-gradient(135deg,var(--uiv2-primary-dim),var(--uiv2-bg-700) 46%)}.uiv2-compliance-score{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:12px;background:rgba(245,158,11,.1);color:var(--uiv2-orange)}.uiv2-compliance-score.is-healthy{background:rgba(16,185,129,.1);color:var(--uiv2-green)}.uiv2-compliance-score>span{display:flex}.uiv2-compliance-score div{display:grid}.uiv2-compliance-score strong{font-size:22px;line-height:1}.uiv2-compliance-score small{margin-top:3px;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.uiv2-compliance-copy{display:grid;gap:4px;flex:1;min-width:220px}.uiv2-compliance-copy strong{font-size:14px;color:var(--uiv2-text-900)}.uiv2-compliance-copy span{font-size:11.5px;color:var(--uiv2-text-500)}.uiv2-compliance-legal{padding:7px 10px;border-radius:999px;border:1px solid var(--uiv2-border-default);color:var(--uiv2-text-500);font-size:10px;font-weight:700}.uiv2-compliance-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.uiv2-compliance-metric{padding:12px;display:grid;gap:8px}.uiv2-compliance-metric span{font-size:10.5px;color:var(--uiv2-text-500)}.uiv2-compliance-metric strong{font-size:21px;color:var(--uiv2-text-900)}.uiv2-compliance-metric>div{height:4px;border-radius:4px;overflow:hidden;background:var(--uiv2-bg-400)}.uiv2-compliance-metric i{height:100%;display:block;border-radius:4px;background:var(--uiv2-primary-base)}.uiv2-compliance-section-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.uiv2-compliance-section-title>div{display:grid;gap:3px}.uiv2-compliance-section-title strong{font-size:13px;color:var(--uiv2-text-900)}.uiv2-compliance-section-title span,.uiv2-compliance-section-title small{font-size:10.5px;color:var(--uiv2-text-500)}.uiv2-compliance-section-title>span{min-width:26px;height:26px;border-radius:99px;background:var(--uiv2-primary-dim);color:var(--uiv2-primary-light);display:grid;place-items:center;font-weight:800}.uiv2-compliance-risks{display:grid;gap:7px}.uiv2-compliance-risks button{width:100%;display:flex;align-items:center;gap:11px;padding:10px;border:0;border-radius:10px;background:var(--uiv2-bg-600);color:var(--uiv2-text-900);text-align:left;cursor:pointer;font-family:inherit}.uiv2-compliance-risks button>span{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(245,158,11,.12);color:var(--uiv2-orange)}.uiv2-compliance-risks button>span.tone-red{background:rgba(239,68,68,.12);color:var(--uiv2-red)}.uiv2-compliance-risks button>span.tone-gray{background:var(--uiv2-bg-500);color:var(--uiv2-text-500)}.uiv2-compliance-risks button>div{display:grid;gap:2px;flex:1}.uiv2-compliance-risks strong{font-size:11.5px}.uiv2-compliance-risks small{font-size:10px;color:var(--uiv2-text-500)}.uiv2-compliance-risks b{font-size:10px;color:var(--uiv2-primary-light)}
        @media(max-width:800px){.uiv2-compliance-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.uiv2-compliance-hero{align-items:flex-start;flex-wrap:wrap}.uiv2-report-row{align-items:flex-start!important;flex-wrap:wrap}.uiv2-report-row>div:last-child{width:100%;padding-left:50px}.uiv2-report-row>span{display:none}}
        @media(max-width:480px){.uiv2-compliance-metrics{grid-template-columns:1fr 1fr}.uiv2-compliance-actions{width:100%}.uiv2-compliance-actions button{flex:1;justify-content:center}.uiv2-compliance-score{width:100%;justify-content:center}}
      `}</style>
    </div>
  )
}
