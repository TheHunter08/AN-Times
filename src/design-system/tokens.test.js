import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const readCss = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const colors = readCss('./tokens/colors.css')
const motion = readCss('./tokens/motion.css')
const radius = readCss('./tokens/radius.css')
const shadows = readCss('./tokens/shadows.css')
const spacing = readCss('./tokens/spacing.css')
const typography = readCss('./tokens/typography.css')
const zIndex = readCss('./tokens/z-index.css')
const accessibility = readCss('./foundations/accessibility.css')
const base = readCss('./foundations/base.css')

function expectTokens(source, names) {
  names.forEach(name => expect(source, `Falta el token ${name}`).toContain(`--${name}:`))
}

describe('TIMES INC V7 design tokens', () => {
  it('defines the official canvas, brand, semantic and text palette', () => {
    expectTokens(colors, [
      'bg-canvas',
      'bg-sidebar',
      'bg-card',
      'bg-overlay',
      'border-subtle',
      'border-default',
      'border-focus',
      'brand-50',
      'brand-500',
      'brand-700',
      'accent-400',
      'accent-500',
      'success-400',
      'success-soft',
      'warning-400',
      'warning-soft',
      'danger-400',
      'danger-soft',
      'info-400',
      'info-soft',
      'text-primary',
      'text-secondary',
      'text-tertiary',
      'gradient-brand',
      'gradient-clock',
      'gradient-card',
    ])

    expect(colors).toContain('--bg-canvas:#06080d')
    expect(colors).toContain('--brand-500:#3568ff')
    expect(colors).toContain('--accent-500:#7c5cff')
    expect(colors).toContain('--success-500:#16c96f')
    expect(colors).toContain(':root[data-theme="light"]')
  })

  it('keeps the official 4px spacing, type, radius, shadow, motion and layer scales', () => {
    expectTokens(spacing, ['space-0', 'space-1', 'space-4', 'space-8', 'space-20'])
    expectTokens(typography, [
      'font-display-xl',
      'font-heading-xl',
      'font-body-md',
      'font-caption',
      'font-regular',
      'font-semibold',
      'leading-tight',
      'leading-body',
    ])
    expectTokens(radius, ['radius-xs', 'radius-md', 'radius-xl', 'radius-2xl', 'radius-pill'])
    expectTokens(shadows, ['shadow-xs', 'shadow-md', 'shadow-lg', 'shadow-brand'])
    expectTokens(motion, [
      'duration-fast',
      'duration-normal',
      'duration-slow',
      'duration-modal',
      'ease-standard',
      'ease-enter',
      'ease-exit',
    ])
    expectTokens(zIndex, ['z-base', 'z-header', 'z-drawer', 'z-modal', 'z-toast'])

    expect(spacing).toContain('--space-1:4px')
    expect(radius).toContain('--radius-pill:999px')
    expect(motion).toContain('--duration-normal:180ms')
  })

  it('includes visible focus, reduced motion and tabular-number foundations', () => {
    expect(accessibility).toContain(':focus-visible')
    expect(accessibility).toContain('outline: 2px solid var(--border-focus)')
    expect(accessibility).toContain('@media (prefers-reduced-motion: reduce)')
    expect(base).toContain('font-family: Geist, Inter')
    expect(base).toContain('font-variant-numeric: tabular-nums')
  })
})
