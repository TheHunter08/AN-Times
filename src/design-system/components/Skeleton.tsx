import { type CSSProperties, type HTMLAttributes } from 'react'
import { cx } from './internal'

type CssSize = number | string

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  width?: CssSize
  height?: CssSize
  radius?: CssSize
  shape?: 'text' | 'rect' | 'circle'
}

function toCssSize(value: CssSize | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value
}

export function Skeleton({ width, height, radius, shape = 'text', className, style, ...props }: SkeletonProps) {
  const skeletonStyle = {
    '--ds-skeleton-width': toCssSize(width),
    '--ds-skeleton-height': toCssSize(height),
    '--ds-skeleton-radius': toCssSize(radius),
    ...style,
  } as CSSProperties

  return (
    <span
      {...props}
      className={cx('ds-skeleton', `ds-skeleton--${shape}`, className)}
      style={skeletonStyle}
      aria-hidden="true"
    />
  )
}
