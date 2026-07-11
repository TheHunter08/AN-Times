// Paleta v2 — misma identidad índigo/violeta ya validada visualmente en la
// UI actual (globals.css), portada a tokens tipados. No se inventa una
// paleta nueva desconectada: esto es la fuente de verdad para ui-v2, y
// globals.css sigue siendo la fuente de verdad para la UI existente hasta
// que una pantalla se migre por completo.

// Grises reales, no negro puro — el negro absoluto aplana la percepción de
// profundidad (todo se ve igual de "cerca"); un gris verdadero con un
// leve tinte azulado deja sitio para que la elevación por capas se note.
// Patrón validado en Linear/Vercel/Attio para dashboards oscuros en 2026.
export const colors = {
  bg: {
    900: '#09070D',
    800: '#0B0810',
    700: '#110D19',
    600: '#171122',
    500: '#1E1729',
    400: '#271E35',
    300: '#332740',
    200: '#413354',
  },
  // Violeta como color de marca dominante — referencia directa aportada
  // por el usuario (captura real de un dashboard premium): el acento
  // principal ya no es azul, es este violeta, con el azul degradado a
  // color secundario/de datos.
  primary: {
    base: '#7C3AED',
    light: '#A78BFA',
    dim: 'rgba(124,58,237,0.14)',
    glow: 'rgba(124,58,237,0.32)',
  },
  accent: {
    base: '#3B82F6',
    dim: 'rgba(59,130,246,0.12)',
    glow: 'rgba(59,130,246,0.25)',
  },
  secondary: {
    base: '#06B6D4',
    dim: 'rgba(6,182,212,0.12)',
  },
  semantic: {
    green: '#10B981',
    orange: '#F59E0B',
    red: '#EF4444',
  },
  text: {
    900: '#F5F5F7',
    700: '#AEAEB8',
    500: '#76767F',
    300: '#4A4A55',
  },
  border: {
    subtle: 'rgba(255,255,255,0.06)',
    default: 'rgba(255,255,255,0.10)',
    strong: 'rgba(255,255,255,0.16)',
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
    primary: { base: '#7C3AED', dim: 'rgba(124,58,237,0.16)' },
    accent:  { base: '#3B82F6', dim: 'rgba(59,130,246,0.16)' },
    cyan:    { base: '#22D3EE', dim: 'rgba(34,211,238,0.16)' },
    amber:   { base: '#FBBF24', dim: 'rgba(251,191,36,0.16)' },
  },
  gradients: {
    hero: 'linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(59,130,246,0.10) 55%, rgba(17,17,25,0) 100%)',
    brand: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
    sidebar: 'linear-gradient(180deg, #15101F 0%, #0A0710 100%)',
  },
  // Blanco/negro puros reservados para texto sobre bloques de color sólido
  // (estilo neo-brutalista v5) — el resto de la paleta usa grises reales,
  // pero aquí el contraste máximo es el efecto buscado, no un descuido.
  ink: { onLight: '#0A0A0E', onDark: '#F5F5F7' },
} as const

export type ColorToken = typeof colors
