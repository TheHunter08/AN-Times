// Paleta v2 — misma identidad índigo/violeta ya validada visualmente en la
// UI actual (globals.css), portada a tokens tipados. No se inventa una
// paleta nueva desconectada: esto es la fuente de verdad para ui-v2, y
// globals.css sigue siendo la fuente de verdad para la UI existente hasta
// que una pantalla se migre por completo.

export const colors = {
  bg: {
    900: '#000000',
    800: '#000000',
    700: '#0C0C14',
    600: '#111119',
    500: '#171722',
    400: '#1E1E2C',
    300: '#28283C',
    200: '#333350',
  },
  primary: {
    base: '#3B5BFF',
    light: '#7C93FF',
    dim: 'rgba(59,91,255,0.13)',
    glow: 'rgba(59,91,255,0.28)',
  },
  accent: {
    base: '#7C3AED',
    dim: 'rgba(124,58,237,0.12)',
    glow: 'rgba(124,58,237,0.25)',
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
} as const

export type ColorToken = typeof colors
