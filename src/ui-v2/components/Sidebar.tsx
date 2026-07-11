import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
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
        background: colors.gradients.sidebar,
        borderRight: `1px solid ${colors.border.subtle}`,
        height: '100%',
      }}
    >
      {header && <div style={{ padding: '20px 18px 18px' }}>{header}</div>}
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px' }}>
        {items.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`uiv2-sidebar-item${isActive ? ' uiv2-active' : ''}`}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px 9px 12px',
                borderRadius: radius.sm,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                textAlign: 'left',
                background: isActive ? colors.primary.base : 'transparent',
                color: isActive ? colors.ink.onDark : colors.text[500],
                boxShadow: isActive ? '0 4px 12px -4px rgba(124,58,237,.5)' : 'none',
                transition: transition(['background', 'color']),
              }}
            >
              <span style={{ display: 'inline-flex', width: 16, height: 16, color: isActive ? colors.ink.onDark : 'currentColor', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      {footer && <div style={{ padding: 12, borderTop: `1px solid ${colors.border.subtle}` }}>{footer}</div>}

      <style>{`.uiv2-sidebar-item:not(.uiv2-active):hover { background: rgba(255,255,255,.045) !important; color: ${colors.text[900]} !important; }`}</style>
    </aside>
  )
}
