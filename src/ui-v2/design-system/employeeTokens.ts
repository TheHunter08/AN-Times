// Tokens compartidos para las páginas de empleado en ui-v2 (Jornada, Vacaciones,
// Calendario, Turnos, Perfil, Gastos, Denuncia). Antes cada página redefinía su
// propia copia local de `colors`/`radius`/`toneSoft` — misma paleta "v7" (las
// mismas variables CSS que usa EmployeeHome.tsx) repetida 7 veces. Un solo sitio
// evita que una copia se quede desactualizada respecto a las demás.
export const colors = {
  bg: {
    400: 'var(--bg-card-hover)', 500: 'var(--bg-elevated)', 600: 'var(--bg-card)',
    700: 'var(--bg-canvas-soft)', 800: 'var(--bg-canvas)',
  },
  primary: {
    base: 'var(--brand-500)', light: 'var(--brand-400)',
    dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)', glow: 'rgba(53, 104, 255, 0.25)',
  },
  accent: { base: 'var(--accent-500)' },
  secondary: { base: 'var(--accent-400)', dim: 'color-mix(in srgb, var(--accent-400) 13%, transparent)' },
  semantic: { green: 'var(--success-400)', orange: 'var(--warning-400)', red: 'var(--danger-400)' },
  text: { 900: 'var(--text-primary)', 700: 'var(--text-secondary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
  avatarPalette: ['var(--brand-400)', 'var(--accent-400)', 'var(--brand-300)', 'var(--accent-500)'],
  kpiTone: { amber: { base: 'var(--warning-400)', dim: 'var(--warning-soft)' } },
} as const

export const radius = {
  sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)', pill: 'var(--radius-pill)',
} as const

export const toneSoft = (color: string, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`
