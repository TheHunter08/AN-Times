import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'
import { shadows } from '../design-system/shadows.js'

export interface ProjectRow {
  id: string
  name: string
  client: string
  hoursLogged: string
  progressPct: number
  status: 'active' | 'paused' | 'done'
}

export interface ProjectsProps {
  rows: ProjectRow[]
}

const statusTone: Record<ProjectRow['status'], 'green' | 'orange' | 'gray'> = { active: 'green', paused: 'orange', done: 'gray' }
const statusLabel: Record<ProjectRow['status'], string> = { active: 'En curso', paused: 'Pausado', done: 'Completado' }

// Directorio de proyectos — los mismos nombres que ya aparecían en los
// bloques del calendario semanal (Proyecto Alpha/Beta), ahora con su
// propia pantalla en vez de ser solo una etiqueta suelta en un evento.
export function Projects({ rows }: ProjectsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      <PageTitle>Proyectos</PageTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(p => (
          <div
            key={p.id}
            className="uiv2-project-row"
            style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.lg,
              padding: '16px 20px', boxShadow: shadows.sm, transition: transition(['border-color']),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 640, color: colors.text[900] }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: colors.text[500] }}>{p.client}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: colors.text[500] }}>{p.hoursLogged}</span>
                <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: radius.pill, background: colors.bg[500], overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%', width: `${p.progressPct}%`, borderRadius: radius.pill,
                  background: p.status === 'done' ? colors.semantic.green : colors.primary.base,
                  transition: transition(['width']),
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <style>{`.uiv2-project-row:hover { border-color: ${colors.border.default}; }`}</style>
    </div>
  )
}
