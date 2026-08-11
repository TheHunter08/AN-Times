// Página "Actualizaciones" — versión ui-v2. Muestra la versión instalada,
// un botón para buscar actualizaciones y el changelog de la app.
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'
import { useAppUpdate } from '../../hooks/useAppUpdate.js'
import { APP_CHANGELOG } from '../../data/changelog.js'

declare const __APP_VERSION__: string | undefined

export interface EmployeeActualizacionesProps {
  toast: (msg: string, ms?: number, kind?: string) => void
  onBack?: () => void
}

const STATUS_LABEL: Record<string, string> = {
  checking: 'Buscando…',
  applying: 'Instalando…',
}

export function EmployeeActualizaciones({ toast, onBack }: EmployeeActualizacionesProps) {
  const { updateCheck, checkForUpdate } = useAppUpdate(toast)
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'
  const busy = updateCheck === 'checking' || updateCheck === 'applying'

  return (
    <div style={{ padding: 16, paddingBottom: 40, maxWidth: 520, margin: '0 auto' }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: '10px 0 14px', fontSize: 14, fontWeight: 600, minHeight: 44 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Volver a Perfil
        </button>
      )}

      <div style={{
        background: `linear-gradient(135deg, ${toneSoft(colors.primary.base, 12)}, transparent)`,
        border: `1px solid ${toneSoft(colors.primary.base, 24)}`, borderRadius: radius.xl,
        padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text[900] }}>Versión instalada</div>
          <div style={{ fontSize: 12, color: colors.text[500], marginTop: 2 }}>v{version}</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: colors.text[300], marginTop: 8 }}>
            TIMES INC se actualiza sola en segundo plano en cuanto hay una versión nueva.
            Usa este botón si crees que tu versión está desactualizada.
          </div>
        </div>
        <button type="button" disabled={busy} onClick={checkForUpdate} style={{
          background: colors.primary.base, color: '#fff', border: 'none', borderRadius: radius.md,
          padding: '9px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0,
          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1,
        }}>
          {STATUS_LABEL[updateCheck] || 'Buscar'}
        </button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[500], margin: '0 2px 8px' }}>Novedades</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {APP_CHANGELOG.map(entry => (
          <div key={entry.date} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[900] }}>{entry.title}</div>
              <div style={{ fontSize: 11, color: colors.text[300], flexShrink: 0 }}>
                {new Date(`${entry.date}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5 }}>
              {entry.items.map((item: string, i: number) => (
                <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: colors.text[500] }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
