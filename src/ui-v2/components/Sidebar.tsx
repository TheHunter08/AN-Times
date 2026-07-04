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

export function Sidebar({ items, active, onSelect, header, footer }: SidebarProps) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, ${colors.bg[700]} 0%, ${colors.bg[800]} 100%)`,
        borderRight: `1px solid ${colors.border.subtle}`,
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Resplandor ambiental sutil arriba a la izquierda, mismo lenguaje que el login */}
      <div style={{ position: 'absolute', top: -80, left: -80, width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, ${colors.primary.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      {header && <div style={{ padding: '24px 20px 20px', position: 'relative' }}>{header}</div>}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', position: 'relative' }}>
        {items.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`uiv2-sidebar-item${isActive ? ' uiv2-active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 13px',
                borderRadius: radius.sm,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: isActive ? 700 : 500,
                textAlign: 'left',
                position: 'relative',
                background: isActive ? `linear-gradient(135deg, ${colors.primary.dim}, ${colors.accent.dim})` : 'transparent',
                boxShadow: isActive ? `inset 0 0 0 1px ${colors.primary.glow}` : 'none',
                color: isActive ? '#fff' : colors.text[500],
                transition: transition(['background', 'color', 'box-shadow']),
              }}
            >
              {isActive && (
                <span style={{ position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, borderRadius: 2, background: colors.primary.base, boxShadow: `0 0 8px ${colors.primary.base}` }} />
              )}
              <span style={{ display: 'inline-flex', width: 18, height: 18, color: isActive ? colors.primary.light : 'currentColor' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
      {footer && <div style={{ padding: 14, borderTop: `1px solid ${colors.border.subtle}`, position: 'relative' }}>{footer}</div>}

      <style>{`.uiv2-sidebar-item:not(.uiv2-active):hover { background: rgba(255,255,255,.05) !important; color: ${colors.text[900]} !important; }`}</style>
    </aside>
  )
}
