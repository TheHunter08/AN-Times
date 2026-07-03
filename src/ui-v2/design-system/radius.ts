export const radius = {
  xs: '9px',
  sm: '12px',
  md: '16px',
  lg: '22px',
  xl: '26px',
  '2xl': '32px',
  '3xl': '40px',
  pill: '999px',
} as const

export type RadiusToken = keyof typeof radius
