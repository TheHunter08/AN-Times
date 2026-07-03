export const fontFamily = {
  display: "'SF Pro Display', 'Inter', -apple-system, system-ui, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
} as const

// Jerarquía tipográfica: display > h1..h4 > body > caption/label.
export const typeScale = {
  display: { size: '38px', weight: 900, tracking: '-2px', lineHeight: 1.05 },
  h1:      { size: '28px', weight: 800, tracking: '-1px',  lineHeight: 1.1 },
  h2:      { size: '22px', weight: 800, tracking: '-.5px', lineHeight: 1.15 },
  h3:      { size: '18px', weight: 700, tracking: '-.3px', lineHeight: 1.2 },
  h4:      { size: '15px', weight: 700, tracking: '-.2px', lineHeight: 1.3 },
  body:    { size: '14px', weight: 500, tracking: '0px',   lineHeight: 1.5 },
  caption: { size: '12px', weight: 500, tracking: '.1px',  lineHeight: 1.4 },
  label:   { size: '10px', weight: 700, tracking: '.8px',  lineHeight: 1.3, uppercase: true },
} as const

export type TypeScaleKey = keyof typeof typeScale
