import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'

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
        height: 64,
        padding: '0 22px',
        background: colors.bg[700],
        borderBottom: `1px solid ${colors.border.subtle}`,
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {breadcrumb && <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 2 }}>{breadcrumb}</div>}
        <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '-.3px', color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </header>
  )
}
