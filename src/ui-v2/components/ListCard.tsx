import type { ReactNode } from 'react'
import { Card } from './Card.js'
import { colors } from '../design-system/colors'
import { IconDots, IconArrowRight } from './Icons.js'

export interface ListCardItem {
  id: string
  leading?: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
}

export interface ListCardProps {
  title: string
  items: ListCardItem[]
  moreLabel?: string
  onMore?: () => void
  menu?: boolean
}

// Tarjeta de lista genérica — mismo patrón para "Actividad reciente",
// "Próximas ausencias", "Alertas y notificaciones", cada fila con
// leading (dot/avatar/icono), título+subtítulo, y un valor final.
export function ListCard({ title, items, moreLabel = 'Ver todas', onMore, menu }: ListCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{title}</span>
        {menu && <IconDots width={14} height={14} color={colors.text[500]} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <div key={item.id} className="uiv2-list-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderRadius: 6 }}>
            {item.leading}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              {item.subtitle && <div style={{ fontSize: 11, color: colors.text[500] }}>{item.subtitle}</div>}
            </div>
            {item.trailing}
          </div>
        ))}
      </div>
      {onMore && (
        <button onClick={onMore} className="uiv2-list-more" style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, padding: 0, border: 'none', background: 'transparent', color: colors.primary.light, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {moreLabel} <IconArrowRight width={11} height={11} />
        </button>
      )}
      <style>{`.uiv2-list-row:hover { background: rgba(255,255,255,.03); }`}</style>
    </Card>
  )
}
