// Escala recalibrada hacia la precisión real de Linear (6/12px), no las
// curvas grandes y suaves de un dashboard "friendly" tipo Notion — el radio
// pequeño es lo que hace que un componente se sienta "machined", no blando.
export const radius = {
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '14px',
  xl: '18px',
  '2xl': '24px',
  '3xl': '32px',
  pill: '999px',
} as const

export type RadiusToken = keyof typeof radius
