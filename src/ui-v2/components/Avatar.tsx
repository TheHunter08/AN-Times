import { colors } from '../design-system/colors.js'

export interface AvatarProps {
  name: string
  /** Solo para casos donde el color SÍ debe ser deliberado (p.ej. marca de
   * empresa). Por defecto el avatar elige de avatarPalette según el nombre
   * — nunca hereda colores sueltos guardados por usuario. */
  forceColor?: string
  size?: number
  status?: 'online' | 'offline'
}

function paletteColorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return colors.avatarPalette[hash % colors.avatarPalette.length]
}

export function Avatar({ name, forceColor, size = 36, status }: AvatarProps) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const bg = forceColor || paletteColorFor(name)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: '50%',
          background: bg,
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
