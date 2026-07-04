import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export interface SidebarItem {
  id: string
  label: string
  icon: ReactNode
}

export interface SidebarProps {
  items: SidebarItem[]
  active: string
  onSelect: (id: string) => void
  header?: ReactNode
  footer?: ReactNode
}

// Sin resplandores ni degradados de fondo — una barra lateral confiable
// se lee sólida y quieta; el color se reserva para el ítem activo y nada
// más, que es lo que de verdad la distingue de un fondo plano genérico.
export function Sidebar({ items, active, onSelect, header, footer }: SidebarProps) {
  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: colors.bg[700],
        borderRight: `1px solid ${colors.border.subtle}`,
        height: '100%',
      }}
    >
      {header && <div style={{ padding: '20px 18px 16px' }}>{header}</div>}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, padding: '8px 10px' }}>
        {items.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`uiv2-sidebar-item${isActive ? ' uiv2-active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                borderRadius: radius.sm,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                textAlign: 'left',
                background: isActive ? colors.bg[500] : 'transparent',
                color: isActive ? colors.text[900] : colors.text[500],
                transition: transition(['background', 'color']),
              }}
            >
              <span style={{ display: 'inline-flex', width: 16, height: 16, color: isActive ? colors.primary.light : 'currentColor', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      {footer && <div style={{ padding: 12, borderTop: `1px solid ${colors.border.subtle}` }}>{footer}</div>}

      <style>{`.uiv2-sidebar-item:not(.uiv2-active):hover { background: rgba(255,255,255,.04) !important; color: ${colors.text[900]} !important; }`}</style>
    </aside>
  )
}
