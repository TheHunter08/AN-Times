import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  loading?: boolean
  loadingLabel?: string
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    loading = false,
    loadingLabel = 'Cargando',
    fullWidth = false,
    className,
    children,
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
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'ds-button',
        `ds-button--${variant}`,
        `ds-button--${size}`,
        fullWidth && 'ds-button--full',
        loading && 'ds-button--loading',
        className,
      )}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : leadingIcon ? <span className="ds-button__icon">{leadingIcon}</span> : null}
      <span className="ds-button__label">{children}</span>
      {loading ? <span className="ds-sr-only">{loadingLabel}</span> : trailingIcon ? <span className="ds-button__icon">{trailingIcon}</span> : null}
    </button>
  )
})
