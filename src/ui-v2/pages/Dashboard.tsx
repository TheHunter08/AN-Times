import type { CSSProperties, ReactNode } from 'react'
import { AreaChart } from '../components/AreaChart.js'
import type { AreaChartPoint } from '../components/AreaChart.js'
import { colors } from '../design-system/colors'
import {
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconDownload,
  IconUsers,
} from '../components/Icons.js'

export type KpiTone = 'primary' | 'accent' | 'cyan' | 'amber'

export interface KPI {
  label: string
  value: string
  delta?: { text: string; tone: 'up' | 'down' | 'flat' }
  icon?: ReactNode
  tone?: KpiTone
  sparkline?: number[]
}

export interface ActivityItem {
  id: string
  text: string
  time: string
  tone?: 'green' | 'orange' | 'red' | 'purple' | 'gray'
}

export interface QuickLink {
  id: string
  label: string
  value: string
  icon?: ReactNode
  onClick?: () => void
}

export interface TeamSlot {
  shown: { id: string; name: string; color?: string }[]
  extra: number
  activeCount: number
  pauseCount: number
  total: number
}

export interface DashboardProps {
  greeting: string
  greetingSub?: string
  kpis: KPI[]
  activity: ActivityItem[]
  trend?: AreaChartPoint[]
  compareTrend?: AreaChartPoint[]
  quickActions?: ReactNode
  nextEvent?: { label: string; time: string }
  fichaje?: { statusLabel: string; time: string; tone: 'green' | 'primary' | 'orange' }
  quickLinks?: QuickLink[]
  teamSlot?: TeamSlot
  onExport?: () => void
}

const toneOrder: KpiTone[] = ['primary', 'accent', 'cyan', 'amber']

const toneAccent: Record<KpiTone, { color: string; soft: string }> = {
  primary: { color: colors.primary.base, soft: colors.primary.dim },
  accent: { color: colors.accent.base, soft: colors.accent.dim },
  cyan: { color: '#38BDF8', soft: 'rgba(56,189,248,.12)' },
  amber: { color: colors.semantic.orange, soft: 'rgba(245,158,11,.12)' },
}

const fichajeToneColor: Record<'green' | 'primary' | 'orange', string> = {
  green: colors.semantic.green,
  primary: colors.primary.base,
  orange: colors.semantic.orange,
}

const activityTone: Record<string, string> = {
  green: colors.semantic.green,
  orange: colors.semantic.orange,
  red: colors.semantic.red,
  purple: colors.accent.base,
  gray: colors.text[300],
}

function KpiCard({ kpi, tone }: { kpi: KPI; tone: KpiTone }) {
  const accent = toneAccent[tone]
  const style = {
    '--ti-kpi-accent': accent.color,
    '--ti-kpi-soft': accent.soft,
  } as CSSProperties

  return (
    <article className="ti-kpi-card" style={style}>
      <div className="ti-kpi-card__top">
        <span className="ti-kpi-card__icon" aria-hidden="true">
          {kpi.icon ?? <IconClock width={18} height={18} />}
        </span>
        {kpi.delta && (
          <span className={`ti-kpi-delta ti-kpi-delta--${kpi.delta.tone}`}>
            <span aria-hidden="true">{kpi.delta.tone === 'up' ? '↑' : kpi.delta.tone === 'down' ? '↓' : '—'}</span>
            {kpi.delta.text}
          </span>
        )}
      </div>
      <div className="ti-kpi-card__body">
        <span className="ti-kpi-card__label">{kpi.label}</span>
        <strong className="ti-kpi-card__value">{kpi.value}</strong>
      </div>
      {kpi.sparkline && kpi.sparkline.length > 1 && (
        <div className="ti-kpi-card__sparkline" aria-hidden="true">
          <AreaChart
            compact
            data={kpi.sparkline.map((value, index) => ({ label: String(index), value }))}
            height={28}
            color={accent.color}
          />
        </div>
      )}
    </article>
  )
}

function PanelTitle({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="ti-panel-title">
      <h2>{children}</h2>
      {detail && <div className="ti-panel-title__detail">{detail}</div>}
    </div>
  )
}

export function Dashboard({
  greeting,
  greetingSub,
  kpis,
  activity,
  trend,
  compareTrend,
  quickActions,
  nextEvent,
  fichaje,
  quickLinks,
  teamSlot,
  onExport,
}: DashboardProps) {
  const todayLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const workingCount = teamSlot ? Math.max(0, teamSlot.activeCount - teamSlot.pauseCount) : 0
  const awayCount = teamSlot ? Math.max(0, teamSlot.total - teamSlot.activeCount) : 0
  const total = Math.max(teamSlot?.total ?? 0, 1)
  const workingPct = (workingCount / total) * 100
  const pausePct = ((teamSlot?.pauseCount ?? 0) / total) * 100
  const awayPct = (awayCount / total) * 100
  const hasThirdRow = Boolean(nextEvent || fichaje || (teamSlot && teamSlot.total > 0) || quickLinks?.length)

  return (
    <div className="ti-dashboard">
      <section className="ti-dashboard-heading" aria-labelledby="dashboard-title">
        <div>
          <span className="ti-dashboard-heading__eyebrow">Panel de administración</span>
          <h1 id="dashboard-title">Dashboard</h1>
          <p>
            <span>{greeting}</span>
            {greetingSub && <span className="ti-dashboard-heading__separator"> · </span>}
            {greetingSub && <span>{greetingSub}</span>}
          </p>
        </div>
        <div className="ti-dashboard-toolbar">
          <div className="ti-date-chip" aria-label={`Fecha actual: ${todayLabel}`}>
            <IconCalendar width={16} height={16} aria-hidden="true" />
            <span>Hoy, {todayLabel}</span>
          </div>
          {onExport && (
            <button className="ti-dashboard-button" type="button" onClick={onExport}>
              <IconDownload width={16} height={16} aria-hidden="true" />
              Exportar
            </button>
          )}
          {quickActions}
        </div>
      </section>

      <section
        className="ti-kpi-grid"
        aria-label="Resumen operativo"
        style={{ '--ti-kpi-count': Math.min(Math.max(kpis.length, 1), 5) } as CSSProperties}
      >
        {kpis.map((kpi, index) => (
          <KpiCard key={`${kpi.label}-${index}`} kpi={kpi} tone={kpi.tone ?? toneOrder[index % toneOrder.length]} />
        ))}
      </section>

      <section className={`ti-dashboard-second${trend?.length ? '' : ' ti-dashboard-second--single'}`}>
        <article className="ti-panel ti-live-panel">
          <PanelTitle
            detail={
              <span className="ti-live-label">
                <span className="ti-live-label__dot" aria-hidden="true" />
                En directo
              </span>
            }
          >
            Actividad en tiempo real
          </PanelTitle>

          {teamSlot && teamSlot.shown.length > 0 && (
            <div className="ti-team-strip" aria-label="Estado actual del equipo">
              {teamSlot.shown.map((employee, index) => {
                const initials = employee.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(word => word[0])
                  .join('')
                  .toUpperCase()
                const isActive = index < teamSlot.activeCount
                return (
                  <div className={`ti-team-member${isActive ? ' ti-team-member--active' : ''}`} key={employee.id}>
                    <span
                      className="ti-team-member__avatar"
                      style={{ background: employee.color || colors.avatarPalette[index % colors.avatarPalette.length] }}
                    >
                      {initials}
                    </span>
                    <strong title={employee.name}>{employee.name}</strong>
                    <span>{isActive ? 'Activo ahora' : 'Fuera de jornada'}</span>
                  </div>
                )
              })}
              {teamSlot.extra > 0 && (
                <div className="ti-team-member ti-team-member--more" aria-label={`${teamSlot.extra} empleados más`}>
                  <span className="ti-team-member__avatar">+{teamSlot.extra}</span>
                  <strong>Ver equipo</strong>
                  <span>{teamSlot.total} en total</span>
                </div>
              )}
            </div>
          )}

          <div className="ti-activity-list">
            {activity.length === 0 ? (
              <div className="ti-empty-state">
                <IconClock width={20} height={20} aria-hidden="true" />
                <span>Sin actividad registrada todavía</span>
              </div>
            ) : (
              activity.slice(0, 5).map(item => (
                <div className="ti-activity-row" key={item.id}>
                  <span
                    className="ti-activity-row__dot"
                    style={{ background: activityTone[item.tone ?? 'gray'] }}
                    aria-hidden="true"
                  />
                  <span className="ti-activity-row__text">{item.text}</span>
                  <time>{item.time}</time>
                </div>
              ))
            )}
          </div>
        </article>

        {trend && trend.length > 0 && (
          <article className="ti-panel ti-chart-panel">
            <PanelTitle detail={<span className="ti-panel-caption">Comparativa semanal</span>}>
              Horas trabajadas
            </PanelTitle>
            <div className="ti-chart-panel__legend" aria-hidden="true">
              <span><i className="ti-chart-key ti-chart-key--current" />Esta semana</span>
              {compareTrend && compareTrend.length > 0 && (
                <span><i className="ti-chart-key ti-chart-key--compare" />Semana anterior</span>
              )}
            </div>
            <div className="ti-chart-panel__plot">
              <AreaChart data={trend} compareData={compareTrend} height={190} color={colors.primary.base} />
            </div>
          </article>
        )}
      </section>

      {hasThirdRow && (
        <section className="ti-dashboard-third" aria-label="Resumen y accesos de gestión">
          {nextEvent && (
            <article className="ti-panel ti-request-card">
              <PanelTitle detail={<span className="ti-status-badge ti-status-badge--warning">Pendiente</span>}>
                Solicitudes pendientes
              </PanelTitle>
              <div className="ti-request-card__body">
                <span className="ti-request-card__icon" aria-hidden="true"><IconCalendar width={18} height={18} /></span>
                <div>
                  <strong>{nextEvent.label}</strong>
                  <span>{nextEvent.time}</span>
                </div>
              </div>
            </article>
          )}

          {fichaje && (
            <article className="ti-panel ti-status-card">
              <PanelTitle>Estado de jornada</PanelTitle>
              <div className="ti-status-card__body">
                <span
                  className="ti-status-card__indicator"
                  style={{ background: fichajeToneColor[fichaje.tone] }}
                  aria-hidden="true"
                />
                <div>
                  <strong>{fichaje.statusLabel}</strong>
                  <span><IconClock width={14} height={14} aria-hidden="true" />{fichaje.time}</span>
                </div>
              </div>
            </article>
          )}

          {teamSlot && teamSlot.total > 0 && (
            <article className="ti-panel ti-distribution-card">
              <PanelTitle detail={<strong className="ti-distribution-card__total">{teamSlot.total}</strong>}>
                Distribución del equipo
              </PanelTitle>
              <div className="ti-distribution-bar" aria-label={`${workingCount} trabajando, ${teamSlot.pauseCount} en descanso y ${awayCount} fuera de jornada`}>
                <span className="ti-distribution-bar__working" style={{ width: `${workingPct}%` }} />
                <span className="ti-distribution-bar__pause" style={{ width: `${pausePct}%` }} />
                <span className="ti-distribution-bar__away" style={{ width: `${awayPct}%` }} />
              </div>
              <div className="ti-distribution-legend">
                <span><i className="ti-legend-dot ti-legend-dot--working" />Trabajando <strong>{workingCount}</strong></span>
                <span><i className="ti-legend-dot ti-legend-dot--pause" />Descanso <strong>{teamSlot.pauseCount}</strong></span>
                <span><i className="ti-legend-dot ti-legend-dot--away" />Fuera <strong>{awayCount}</strong></span>
              </div>
            </article>
          )}

          {quickLinks && quickLinks.length > 0 && (
            <article className="ti-panel ti-management-card">
              <PanelTitle>Accesos de gestión</PanelTitle>
              <div className="ti-management-list">
                {quickLinks.map(link => (
                  <button className="ti-management-link" type="button" onClick={link.onClick} key={link.id}>
                    <span className="ti-management-link__icon" aria-hidden="true">
                      {link.icon ?? <IconUsers width={16} height={16} />}
                    </span>
                    <span className="ti-management-link__copy">
                      <strong>{link.label}</strong>
                      <small>{link.value}</small>
                    </span>
                    <IconArrowRight width={15} height={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

      <style>{`
        .ti-dashboard {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
          color: ${colors.text[900]};
        }
        .ti-dashboard-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          min-height: 64px;
        }
        .ti-dashboard-heading__eyebrow {
          display: block;
          margin-bottom: 5px;
          color: ${colors.primary.light};
          font-size: 11px;
          font-weight: 650;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ti-dashboard-heading h1 {
          margin: 0;
          color: ${colors.text[900]};
          font-size: clamp(26px, 2.1vw, 32px);
          font-weight: 650;
          letter-spacing: -.035em;
          line-height: 1.15;
        }
        .ti-dashboard-heading p {
          margin: 7px 0 0;
          color: ${colors.text[500]};
          font-size: 13px;
          line-height: 1.45;
        }
        .ti-dashboard-heading__separator { color: ${colors.text[300]}; }
        .ti-dashboard-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
        .ti-date-chip,
        .ti-dashboard-button {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 13px;
          border: 1px solid ${colors.border.subtle};
          border-radius: 12px;
          background: ${colors.bg[600]};
          color: ${colors.text[700]};
          font: 550 12px/1 inherit;
          text-transform: capitalize;
        }
        .ti-dashboard-button {
          border-color: ${colors.border.default};
          color: ${colors.text[900]};
          cursor: pointer;
          transition: transform 140ms cubic-bezier(.2,0,0,1), background 140ms cubic-bezier(.2,0,0,1), border-color 140ms cubic-bezier(.2,0,0,1);
        }
        .ti-dashboard-button:hover { background: ${colors.bg[500]}; border-color: ${colors.border.strong}; transform: translateY(-1px); }
        .ti-dashboard-button:active { transform: scale(.98); }
        .ti-dashboard-button:focus-visible,
        .ti-management-link:focus-visible { outline: 2px solid ${colors.primary.base}; outline-offset: 2px; }
        .ti-kpi-grid {
          display: grid;
          grid-template-columns: repeat(var(--ti-kpi-count), minmax(0, 1fr));
          gap: 12px;
        }
        .ti-kpi-card,
        .ti-panel {
          background: linear-gradient(180deg, rgba(255,255,255,.022), rgba(255,255,255,.004)), ${colors.bg[600]};
          border: 1px solid ${colors.border.subtle};
          box-shadow: 0 1px 2px rgba(0,0,0,.16);
        }
        .ti-kpi-card {
          min-width: 0;
          min-height: 130px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 14px;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          transition: transform 160ms cubic-bezier(.2,0,0,1), border-color 160ms cubic-bezier(.2,0,0,1), background 160ms cubic-bezier(.2,0,0,1);
        }
        .ti-kpi-card::after {
          content: '';
          position: absolute;
          inset: auto 14px 0;
          height: 1px;
          background: var(--ti-kpi-accent);
          opacity: .46;
        }
        .ti-kpi-card:hover { transform: translateY(-2px); border-color: ${colors.border.default}; background-color: ${colors.bg[500]}; }
        .ti-kpi-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-height: 34px; }
        .ti-kpi-card__icon {
          width: 34px;
          height: 34px;
          border-radius: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          color: var(--ti-kpi-accent);
          background: var(--ti-kpi-soft);
          border: 1px solid color-mix(in srgb, var(--ti-kpi-accent) 18%, transparent);
        }
        .ti-kpi-card__body { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .ti-kpi-card__label { color: ${colors.text[500]}; font-size: 11.5px; font-weight: 500; line-height: 1.25; }
        .ti-kpi-card__value {
          color: ${colors.text[900]};
          font-size: clamp(23px, 2vw, 29px);
          font-weight: 650;
          line-height: 1;
          letter-spacing: -.045em;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ti-kpi-delta { display: inline-flex; align-items: center; gap: 3px; max-width: 72%; font-size: 9.5px; font-weight: 600; line-height: 1.2; text-align: right; }
        .ti-kpi-delta--up { color: ${colors.semantic.green}; }
        .ti-kpi-delta--down { color: ${colors.semantic.red}; }
        .ti-kpi-delta--flat { color: ${colors.text[500]}; }
        .ti-kpi-card__sparkline { height: 28px; margin: -5px -4px -2px; opacity: .9; }
        .ti-dashboard-second {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(340px, .95fr);
          gap: 12px;
          align-items: stretch;
        }
        .ti-dashboard-second--single { grid-template-columns: minmax(0, 1fr); }
        .ti-panel { border-radius: 18px; padding: 18px; min-width: 0; }
        .ti-panel-title { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
        .ti-panel-title h2 { margin: 0; color: ${colors.text[900]}; font-size: 13px; font-weight: 620; letter-spacing: -.01em; }
        .ti-panel-title__detail { flex: 0 0 auto; color: ${colors.text[500]}; }
        .ti-panel-caption { font-size: 10.5px; font-weight: 500; }
        .ti-live-label { display: inline-flex; align-items: center; gap: 6px; color: ${colors.semantic.green}; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; }
        .ti-live-label__dot { width: 6px; height: 6px; border-radius: 999px; background: ${colors.semantic.green}; box-shadow: 0 0 0 4px rgba(22,201,111,.1); animation: tiLivePulse 2s ease-in-out infinite; }
        .ti-team-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(82px, 1fr)); gap: 8px; padding-bottom: 14px; border-bottom: 1px solid ${colors.border.subtle}; }
        .ti-team-member {
          min-width: 0;
          min-height: 104px;
          padding: 11px 8px 9px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 13px;
          border: 1px solid ${colors.border.subtle};
          background: rgba(var(--uiv2-overlay-rgb), .018);
          text-align: center;
        }
        .ti-team-member__avatar {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 2px solid ${colors.text[300]};
          box-shadow: 0 0 0 3px ${colors.bg[600]};
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .02em;
        }
        .ti-team-member--active .ti-team-member__avatar { border-color: ${colors.semantic.green}; }
        .ti-team-member strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${colors.text[900]}; font-size: 10.5px; font-weight: 600; }
        .ti-team-member > span:last-child { color: ${colors.text[500]}; font-size: 9px; white-space: nowrap; }
        .ti-team-member--active > span:last-child { color: ${colors.semantic.green}; }
        .ti-team-member--more .ti-team-member__avatar { background: ${colors.bg[400]}; border-color: ${colors.border.strong}; color: ${colors.text[700]}; }
        .ti-activity-list { display: flex; flex-direction: column; padding-top: 8px; }
        .ti-activity-row { min-height: 37px; display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 6px; border-bottom: 1px solid ${colors.border.subtle}; }
        .ti-activity-row:last-child { border-bottom: 0; }
        .ti-activity-row__dot { width: 7px; height: 7px; border-radius: 999px; box-shadow: 0 0 0 3px rgba(var(--uiv2-overlay-rgb), .025); }
        .ti-activity-row__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${colors.text[700]}; font-size: 11.5px; }
        .ti-activity-row time { color: ${colors.text[500]}; font-size: 10.5px; font-variant-numeric: tabular-nums; }
        .ti-empty-state { min-height: 148px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9px; color: ${colors.text[500]}; font-size: 12px; text-align: center; }
        .ti-chart-panel { display: flex; flex-direction: column; }
        .ti-chart-panel__legend { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin: 2px 0 12px; }
        .ti-chart-panel__legend span { display: inline-flex; align-items: center; gap: 6px; color: ${colors.text[500]}; font-size: 10px; }
        .ti-chart-key { display: inline-block; width: 18px; height: 2px; border-radius: 999px; }
        .ti-chart-key--current { background: ${colors.primary.base}; }
        .ti-chart-key--compare { background: ${colors.text[300]}; opacity: .65; }
        .ti-chart-panel__plot { flex: 1; min-height: 220px; display: flex; flex-direction: column; justify-content: flex-end; }
        .ti-dashboard-third { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; align-items: stretch; }
        .ti-status-badge { display: inline-flex; align-items: center; min-height: 23px; padding: 0 8px; border-radius: 999px; font-size: 9.5px; font-weight: 650; }
        .ti-status-badge--warning { color: ${colors.semantic.orange}; background: rgba(245,158,11,.12); }
        .ti-request-card__body,
        .ti-status-card__body { display: flex; align-items: center; gap: 12px; min-height: 72px; }
        .ti-request-card__icon { width: 38px; height: 38px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; color: ${colors.semantic.orange}; background: rgba(245,158,11,.11); }
        .ti-request-card__body div,
        .ti-status-card__body div { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .ti-request-card__body strong,
        .ti-status-card__body strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${colors.text[900]}; font-size: 12px; font-weight: 600; }
        .ti-request-card__body span:last-child,
        .ti-status-card__body span { color: ${colors.text[500]}; font-size: 10.5px; }
        .ti-status-card__body span { display: inline-flex; align-items: center; gap: 6px; }
        .ti-status-card__indicator { width: 10px; height: 10px; border-radius: 999px; box-shadow: 0 0 0 6px rgba(var(--uiv2-overlay-rgb), .03); }
        .ti-distribution-card__total { color: ${colors.text[900]}; font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; }
        .ti-distribution-bar { height: 8px; display: flex; overflow: hidden; border-radius: 999px; background: ${colors.bg[400]}; margin: 22px 0 18px; }
        .ti-distribution-bar span { display: block; height: 100%; }
        .ti-distribution-bar__working { background: ${colors.semantic.green}; }
        .ti-distribution-bar__pause { background: ${colors.semantic.orange}; }
        .ti-distribution-bar__away { background: ${colors.text[300]}; }
        .ti-distribution-legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .ti-distribution-legend > span { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 6px; color: ${colors.text[500]}; font-size: 9.5px; }
        .ti-distribution-legend strong { grid-column: 2; color: ${colors.text[900]}; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }
        .ti-legend-dot { width: 7px; height: 7px; border-radius: 999px; }
        .ti-legend-dot--working { background: ${colors.semantic.green}; }
        .ti-legend-dot--pause { background: ${colors.semantic.orange}; }
        .ti-legend-dot--away { background: ${colors.text[300]}; }
        .ti-management-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
        .ti-management-link { min-width: 0; min-height: 51px; padding: 7px 9px; display: flex; align-items: center; gap: 8px; border: 1px solid ${colors.border.subtle}; border-radius: 12px; background: rgba(var(--uiv2-overlay-rgb), .018); color: ${colors.text[500]}; cursor: pointer; font-family: inherit; text-align: left; transition: background 140ms cubic-bezier(.2,0,0,1), border-color 140ms cubic-bezier(.2,0,0,1), transform 140ms cubic-bezier(.2,0,0,1); }
        .ti-management-link:hover { background: ${colors.bg[500]}; border-color: ${colors.border.default}; transform: translateY(-1px); }
        .ti-management-link__icon { width: 29px; height: 29px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; color: ${colors.primary.light}; background: ${colors.primary.dim}; }
        .ti-management-link__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .ti-management-link__copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${colors.text[700]}; font-size: 10px; font-weight: 550; }
        .ti-management-link__copy small { color: ${colors.text[900]}; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; }
        @keyframes tiLivePulse { 0%, 100% { opacity: 1; } 50% { opacity: .42; } }
        @media (max-width: 1180px) {
          .ti-kpi-grid { grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); }
          .ti-dashboard-second { grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); }
        }
        @media (max-width: 900px) {
          .ti-dashboard-heading { align-items: flex-start; }
          .ti-dashboard-second { grid-template-columns: minmax(0, 1fr); }
          .ti-chart-panel__plot { min-height: 190px; }
        }
        @media (max-width: 640px) {
          .ti-dashboard { gap: 14px; }
          .ti-dashboard-heading { min-height: 0; flex-direction: column; gap: 14px; }
          .ti-dashboard-toolbar { width: 100%; justify-content: flex-start; }
          .ti-date-chip { flex: 1; }
          .ti-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
          .ti-kpi-card { min-height: 118px; padding: 14px; gap: 10px; }
          .ti-kpi-card:last-child:nth-child(odd) { grid-column: 1 / -1; }
          .ti-kpi-card__value { font-size: 24px; }
          .ti-panel { padding: 15px; border-radius: 16px; }
          .ti-team-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .ti-dashboard-third { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 390px) {
          .ti-dashboard-heading__separator { display: none; }
          .ti-dashboard-heading p span { display: block; }
          .ti-date-chip { width: 100%; }
          .ti-dashboard-button { flex: 1; }
          .ti-team-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ti-management-list { grid-template-columns: minmax(0, 1fr); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ti-live-label__dot { animation: none; }
          .ti-kpi-card,
          .ti-dashboard-button,
          .ti-management-link { transition: none; }
        }
      `}</style>
    </div>
  )
}
