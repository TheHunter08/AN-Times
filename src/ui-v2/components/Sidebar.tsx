import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
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
      {header && <div style={{ padding: '22px 20px 18px' }}>{header}</div>}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 10px' }}>
        {items.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 500,
                textAlign: 'left',
                background: isActive ? colors.primary.dim : 'transparent',
                color: isActive ? colors.primary.light : colors.text[500],
                transition: transition(['background', 'color']),
              }}
            >
              <span style={{ display: 'inline-flex', width: 18, height: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
      {footer && <div style={{ padding: 14, borderTop: `1px solid ${colors.border.subtle}` }}>{footer}</div>}
    </aside>
  )
}
