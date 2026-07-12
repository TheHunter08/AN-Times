import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal'
import type { ButtonSize, ButtonVariant } from './Button'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon: ReactNode
  variant?: Exclude<ButtonVariant, 'primary'> | 'primary'
  size?: ButtonSize
  loading?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    loading = false,
    className,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx('ds-icon-button', `ds-icon-button--${variant}`, `ds-icon-button--${size}`, className)}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : <span className="ds-icon-button__icon" aria-hidden="true">{icon}</span>}
    </button>
  )
})
