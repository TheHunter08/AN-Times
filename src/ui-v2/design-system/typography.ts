export const fontFamily = {
  display: "'SF Pro Display', 'Inter', -apple-system, system-ui, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
} as const

// Jerarquía tipográfica: display > h1..h4 > body > caption/label.
// Pesos recalibrados hacia la referencia real de Linear (banda 400-560,
// nunca 800-900): la sensación "precision-machined" viene de un tamaño
// grande con un peso contenido y un tracking negativo ajustado, no de
// forzar todo a extra-bold — eso es lo que hacía que todo se sintiera
// genérico/plantilla en vez de deliberado.
export const typeScale = {
  display: { size: '40px', weight: 560, tracking: '-1.6px', lineHeight: 1.05 },
  h1:      { size: '26px', weight: 560, tracking: '-.8px',  lineHeight: 1.15 },
  h2:      { size: '20px', weight: 560, tracking: '-.4px', lineHeight: 1.2 },
  h3:      { size: '16px', weight: 540, tracking: '-.2px', lineHeight: 1.25 },
  h4:      { size: '14px', weight: 540, tracking: '-.1px', lineHeight: 1.3 },
  body:    { size: '14px', weight: 400, tracking: '0px',   lineHeight: 1.5 },
  caption: { size: '12px', weight: 400, tracking: '.1px',  lineHeight: 1.4 },
  label:   { size: '10px', weight: 600, tracking: '.6px',  lineHeight: 1.3, uppercase: true },
} as const

export type TypeScaleKey = keyof typeof typeScale
