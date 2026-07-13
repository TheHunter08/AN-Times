import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconFileText, IconDownload } from '../components/Icons.js'

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
}

// Bandeja de informes descargables — el mismo concepto que ya existe en
// la app real (informe de registro horario para Inspección de Trabajo,
// RD 8/2019), aquí con su propia pantalla en vez de un icono suelto en
// "Accesos rápidos" que no llevaba a ningún sitio.
export function Reports({ rows }: ReportsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <PageTitle>Informes</PageTitle>
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
      <style>{`.uiv2-report-row:hover { background: rgba(var(--uiv2-overlay-rgb),.02); }`}</style>
    </div>
  )
}
