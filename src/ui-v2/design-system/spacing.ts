// Escala de espaciado en grid de 8px (con medios pasos de 4px en los
// extremos pequeños, donde 8px es demasiado brusco para iconos/badges).
export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const

export type SpacingToken = keyof typeof spacing
