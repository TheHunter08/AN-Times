import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'

export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,.04)', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
      {items.map(item => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: radius.sm,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              background: isActive ? colors.primary.dim : 'transparent',
              color: isActive ? colors.text[900] : colors.text[500],
              boxShadow: isActive ? `inset 0 0 0 1px ${colors.primary.glow}` : 'none',
              transition: transition(['background', 'color']),
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
