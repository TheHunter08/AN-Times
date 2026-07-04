import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { typeScale } from '../design-system/typography.js'

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: typeScale.h1.size, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking,
        background: `linear-gradient(135deg, ${colors.text[900]} 30%, ${colors.primary.light} 140%)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        display: 'inline-block',
      }}
    >
      {children}
    </div>
  )
}
