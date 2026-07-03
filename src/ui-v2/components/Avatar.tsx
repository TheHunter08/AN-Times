import { colors } from '../design-system/colors.js'

export interface AvatarProps {
  name: string
  color?: string
  size?: number
  status?: 'online' | 'offline'
}

export function Avatar({ name, color, size = 36, status }: AvatarProps) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: '50%',
          background: color || colors.primary.base,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.36, fontWeight: 800, color: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        }}
      >
        {initials}
      </div>
      {status && (
        <span
          style={{
            position: 'absolute', bottom: -1, right: -1,
            width: size * 0.28, height: size * 0.28, borderRadius: '50%',
            background: status === 'online' ? colors.semantic.green : colors.text[300],
            border: `2px solid ${colors.bg[700]}`,
          }}
        />
      )}
    </div>
  )
}
