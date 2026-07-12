// Paleta v2 — tokens respaldados por custom properties CSS (theme.css), así
// que reaccionan a [data-theme="light"] en tiempo real sin que ninguno de
// los ~80 archivos que importan `colors` tenga que cambiar: siguen leyendo
// colors.bg[600] etc. igual que antes, pero el valor ahora es var(--uiv2-*).
//
// Azul es el acento dominante (antes violeta) — coincide con --accent de la
// UI clásica para que ambas versiones compartan identidad de marca. El
// violeta pasa a `accent` (secundario): IA, detalles puntuales, no la marca.

export const colors = {
  bg: {
    900: 'var(--uiv2-bg-900)',
    800: 'var(--uiv2-bg-800)',
    700: 'var(--uiv2-bg-700)',
    600: 'var(--uiv2-bg-600)',
    500: 'var(--uiv2-bg-500)',
    400: 'var(--uiv2-bg-400)',
    300: 'var(--uiv2-bg-300)',
    200: 'var(--uiv2-bg-200)',
  },
  primary: {
    base: 'var(--uiv2-primary-base)',
    light: 'var(--uiv2-primary-light)',
    dim: 'var(--uiv2-primary-dim)',
    glow: 'var(--uiv2-primary-glow)',
  },
  accent: {
    base: 'var(--uiv2-accent-base)',
    dim: 'var(--uiv2-accent-dim)',
    glow: 'var(--uiv2-accent-glow)',
  },
  secondary: {
    base: 'var(--uiv2-secondary-base)',
    dim: 'var(--uiv2-secondary-dim)',
  },
  semantic: {
    green: 'var(--uiv2-green)',
    orange: 'var(--uiv2-orange)',
    red: 'var(--uiv2-red)',
  },
  text: {
    900: 'var(--uiv2-text-900)',
    700: 'var(--uiv2-text-700)',
    500: 'var(--uiv2-text-500)',
    300: 'var(--uiv2-text-300)',
  },
  border: {
    subtle: 'var(--uiv2-border-subtle)',
    default: 'var(--uiv2-border-default)',
    strong: 'var(--uiv2-border-strong)',
  },
  // Paleta curada para avatares/identidad por persona — deliberadamente sin
  // verde (reservado para estados de éxito) y centrada en la familia
  // índigo/violeta/azulado, con un par de tonos cálidos de contraste para
  // que la lista no se sienta monocroma. Nunca se usa el color "libre"
  // que un empleado tuviera guardado del sistema anterior.
  avatarPalette: [
    '#3B5BFF', '#7C3AED', '#0EA5E9', '#6366F1', '#C026D3', '#0891B2', '#DB2777', '#8B5CF6',
  ],
  // Tonos por categoría de KPI/chip — el "restraint" del pase anterior se
  // quedó corto: reservar el color solo para estados semánticos hacía que
  // TODO se viera gris. Aquí el color es identidad, no solo alarma.
  kpiTone: {
    primary: { base: 'var(--uiv2-kpi-primary)', dim: 'var(--uiv2-kpi-primary-dim)' },
    accent:  { base: 'var(--uiv2-kpi-accent)',  dim: 'var(--uiv2-kpi-accent-dim)' },
    cyan:    { base: 'var(--uiv2-kpi-cyan)',    dim: 'var(--uiv2-kpi-cyan-dim)' },
    amber:   { base: 'var(--uiv2-kpi-amber)',   dim: 'var(--uiv2-kpi-amber-dim)' },
  },
  gradients: {
    hero: 'linear-gradient(135deg, var(--uiv2-primary-glow) 0%, var(--uiv2-accent-dim) 55%, transparent 100%)',
    brand: 'linear-gradient(135deg, var(--uiv2-primary-base) 0%, #2563EB 100%)',
    sidebar: 'linear-gradient(180deg, var(--uiv2-bg-700) 0%, var(--uiv2-bg-900) 100%)',
    appBg: 'var(--uiv2-grad-bg)',
  },
  // Blanco/negro puros reservados para texto sobre bloques de color sólido
  // (estilo neo-brutalista v5) — el resto de la paleta usa grises reales,
  // pero aquí el contraste máximo es el efecto buscado, no un descuido.
  ink: { onLight: '#0A0A0E', onDark: '#F5F5F7' },
} as const

export type ColorToken = typeof colors
