import './tokens/colors.css'
import './tokens/spacing.css'
import './tokens/typography.css'
import './tokens/radius.css'
import './tokens/shadows.css'
import './tokens/motion.css'
import './tokens/z-index.css'
import './foundations/base.css'
import './foundations/accessibility.css'
import './components/components.css'

export * from './foundations'
export * from './components'

export const designSystem = {
  fontFamily: 'Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 },
} as const
