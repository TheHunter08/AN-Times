import { useState } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import {
  IconBell, IconCheck, IconX, IconAlertCircle, IconClock,
  IconCalendar, IconUsers, IconFileText, IconChat,
} from '../components/Icons.js'

export interface NotificationItem {
  id: string
  type: 'fichaje' | 'solicitud' | 'mensaje' | 'sistema' | 'aniversario' | 'anomalia'
  title: string
  body: string
  time: string
  read: boolean
  group?: 'hoy' | 'ayer' | 'semana'
}

export interface NotificationsProps {
  items: NotificationItem[]
  onMarkRead?: (id: string) => void
  onMarkAllRead?: () => void
  onDismiss?: (id: string) => void
}

const typeIcon: Record<NotificationItem['type'], React.ReactNode> = {
  fichaje:     <IconClock      width={15} height={15} />,
  solicitud:   <IconCalendar   width={15} height={15} />,
  mensaje:     <IconChat       width={15} height={15} />,
  sistema:     <IconBell       width={15} height={15} />,
  aniversario: <IconUsers      width={15} height={15} />,
  anomalia:    <IconAlertCircle width={15} height={15} />,
}

const typeTone: Record<NotificationItem['type'], { bg: string; color: string }> = {
  fichaje:     { bg: 'rgba(16,185,129,.16)',  color: colors.semantic.green  },
  solicitud:   { bg: 'rgba(59,130,246,.16)',  color: colors.accent.base     },
  mensaje:     { bg: colors.primary.dim,      color: colors.primary.light   },
  sistema:     { bg: 'rgba(148,163,184,.12)', color: colors.text[700]       },
  aniversario: { bg: 'rgba(251,191,36,.16)',  color: colors.semantic.orange },
  anomalia:    { bg: 'rgba(239,68,68,.16)',   color: colors.semantic.red    },
}

const typeLabel: Record<NotificationItem['type'], string> = {
  fichaje: 'Fichaje', solicitud: 'Solicitud', mensaje: 'Mensaje',
  sistema: 'Sistema', aniversario: '🎉 Aniversario', anomalia: '⚠️ Anomalía',
}

function groupItems(items: NotificationItem[]) {
  const hoy    = items.filter(n => !n.group || n.group === 'hoy')
  const ayer   = items.filter(n => n.group === 'ayer')
  const semana = items.filter(n => n.group === 'semana')
  return [
    { label: 'Hoy',         items: hoy    },
    { label: 'Ayer',        items: ayer   },
    { label: 'Esta semana', items: semana },
  ].filter(g => g.items.length > 0)
}

export function Notifications({ items, onMarkRead, onMarkAllRead, onDismiss }: NotificationsProps) {
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const unreadCount = items.filter(n => !n.read).length
  const filtered = tab === 'unread' ? items.filter(n => !n.read) : items
  const groups = groupItems(filtered)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 21, fontWeight: 900, color: colors.text[900], letterSpacing: '-.5px' }}>Notificaciones</div>
            {unreadCount > 0 && (
              <span style={{
                padding: '3px 9px', borderRadius: radius.pill,
                background: colors.primary.base, color: '#fff',
                fontSize: 11, fontWeight: 800,
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: colors.text[400], marginTop: 3 }}>Centro de actividad de tu equipo</div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
              background: 'transparent', color: colors.text[700],
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all .15s',
            }}
            className="uiv2-notif-markall"
          >
            <IconCheck width={13} height={13} /> Marcar todo leído
          </button>
        )}
      </div>

      {/* Tabs segmented */}
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: radius.md, background: colors.bg[600], width: 'fit-content', border: `1px solid ${colors.border.subtle}` }}>
        {(['all', 'unread'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: radius.sm, border: 'none',
            fontSize: 12.5, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t ? colors.bg[400] : 'transparent',
            color: tab === t ? colors.text[900] : colors.text[500],
            transition: 'all .15s',
            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
          }}>
            {t === 'all' ? `Todas · ${items.length}` : `Sin leer · ${unreadCount}`}
          </button>
        ))}
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div style={{
          padding: '56px 24px', textAlign: 'center',
          background: colors.bg[700], borderRadius: radius.xl,
          border: `1px solid ${colors.border.subtle}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[700] }}>Todo al día</div>
          <div style={{ fontSize: 12, color: colors.text[400], marginTop: 4 }}>No tienes notificaciones{tab === 'unread' ? ' sin leer' : ''}</div>
        </div>
      )}

      {/* Grouped list */}
      {groups.map(group => (
        <div key={group.label}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px',
            color: colors.text[400], marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{group.label}</span>
            <span style={{ flex: 1, height: 1, background: colors.border.subtle }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items.map(n => <NotifCard key={n.id} n={n} onMarkRead={onMarkRead} onDismiss={onDismiss} />)}
          </div>
        </div>
      ))}

      <style>{`
        .uiv2-notif-markall:hover { background: rgba(var(--uiv2-overlay-rgb),.07) !important; color: ${colors.text[900]} !important; }
        .uiv2-notif-card:hover { border-color: rgba(124,58,237,.25) !important; background: rgba(124,58,237,.04) !important; }
        .uiv2-notif-read-btn:hover { background: rgba(16,185,129,.22) !important; }
        .uiv2-notif-dismiss-btn:hover { background: rgba(239,68,68,.14) !important; color: ${colors.semantic.red} !important; }
      `}</style>
    </div>
  )
}

function NotifCard({ n, onMarkRead, onDismiss }: { n: NotificationItem; onMarkRead?: (id: string) => void; onDismiss?: (id: string) => void }) {
  const tone = typeTone[n.type]
  return (
    <div
      className="uiv2-notif-card"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 16px', borderRadius: radius.lg,
        background: n.read ? colors.bg[700] : `rgba(124,58,237,0.06)`,
        border: `1px solid ${n.read ? colors.border.subtle : 'rgba(124,58,237,.2)'}`,
        transition: 'all .18s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Unread accent bar */}
      {!n.read && (
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: colors.primary.base, borderRadius: '4px 0 0 4px' }} />
      )}

      {/* Type icon */}
      <div style={{
        width: 38, height: 38, borderRadius: radius.md, flexShrink: 0,
        background: tone.bg, color: tone.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {typeIcon[n.type]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: n.read ? 600 : 800, color: colors.text[900], letterSpacing: '-.1px' }}>{n.title}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: tone.color, background: tone.bg, padding: '2px 7px', borderRadius: radius.pill }}>
            {typeLabel[n.type]}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: colors.text[500], lineHeight: 1.55 }}>{n.body}</div>
        <div style={{ fontSize: 11, color: colors.text[300], marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{n.time}</div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {!n.read && (
          <button
            className="uiv2-notif-read-btn"
            onClick={() => onMarkRead?.(n.id)}
            title="Marcar como leída"
            style={{ display: 'flex', padding: '6px', borderRadius: radius.xs, border: 'none', background: 'rgba(16,185,129,.1)', color: colors.semantic.green, cursor: 'pointer', transition: 'background .15s' }}
          >
            <IconCheck width={13} height={13} />
          </button>
        )}
        <button
          className="uiv2-notif-dismiss-btn"
          onClick={() => onDismiss?.(n.id)}
          title="Descartar"
          style={{ display: 'flex', padding: '6px', borderRadius: radius.xs, border: 'none', background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[400], cursor: 'pointer', transition: 'all .15s' }}
        >
          <IconX width={13} height={13} />
        </button>
      </div>
    </div>
  )
}
