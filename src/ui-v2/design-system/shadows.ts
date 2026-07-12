// Sombras suaves, nunca exageradas — elevación por capas, no por dramatismo.
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,.28), 0 4px 12px rgba(0,0,0,.12)',
  md: '0 8px 24px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.16)',
  lg: '0 16px 40px rgba(0,0,0,.28), 0 4px 12px rgba(0,0,0,.16)',
  xl: '0 28px 72px rgba(0,0,0,.42), 0 0 0 1px rgba(var(--uiv2-overlay-rgb),.05)',
  glowPrimary: '0 10px 30px var(--uiv2-primary-glow)',
} as const

export type ShadowToken = keyof typeof shadows
