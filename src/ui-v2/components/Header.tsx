import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'

export interface HeaderProps {
  title: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
}

export function Header({ title, breadcrumb, actions }: HeaderProps) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12,
        height: 66,
        padding: '0 26px',
        background: `${colors.bg[700]}cc`,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${colors.border.subtle}`,
        flexShrink: 0,
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {breadcrumb && <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginBottom: 3 }}>{breadcrumb}</div>}
        <div
          style={{
            fontSize: 15, fontWeight: 600, letterSpacing: '-.2px', color: colors.text[900],
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </header>
  )
}
