import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'
import { typeScale } from '../design-system/typography'

// Texto sólido, no degradado — el degradado-en-texto es un recurso de
// página de marketing, no de un producto que se usa a diario. Confianza
// tipográfica: tamaño y tracking hacen el trabajo, no el efecto.
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: `clamp(22px, 5vw, ${typeScale.h1.size})`, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking, color: colors.text[900], lineHeight: typeScale.h1.lineHeight }}>
      {children}
    </div>
  )
}
