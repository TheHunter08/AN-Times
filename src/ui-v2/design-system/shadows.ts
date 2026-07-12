// Sombras suaves, nunca exageradas — elevación por capas, no por dramatismo.
export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.5), 0 1px 8px rgba(0,0,0,0.3)',
  md: '0 4px 14px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)',
  lg: '0 8px 28px rgba(0,0,0,0.65), 0 4px 10px rgba(0,0,0,0.45)',
  xl: '0 20px 64px rgba(0,0,0,0.80), 0 0 0 1px rgba(var(--uiv2-overlay-rgb),0.04)',
  glowPrimary: '0 8px 28px rgba(59,91,255,0.35), 0 2px 8px rgba(59,91,255,0.20)',
} as const

export type ShadowToken = keyof typeof shadows
