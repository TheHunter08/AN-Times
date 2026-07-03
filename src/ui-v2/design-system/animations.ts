// Duraciones cortas siempre — nunca lentas, nunca exageradas (150–250ms).
export const duration = {
  fast: '140ms',
  base: '200ms',
  slow: '250ms',
} as const

export const easing = {
  standard: 'cubic-bezier(0.16, 1, 0.3, 1)',
  spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
  snappy:   'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
} as const

export const transition = (props: string[] = ['all']) =>
  props.map(p => `${p} ${duration.base} ${easing.standard}`).join(', ')
