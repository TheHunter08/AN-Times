import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react'
import { cx } from './internal'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string
  error?: string
  clearable?: boolean
  clearLabel?: string
  onClear?: () => void
  inputClassName?: string
}

function SearchGlyph() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 3.3 3.3" /></svg>
}

function ClearGlyph() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" /></svg>
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    label = 'Buscar',
    error,
    clearable = true,
    clearLabel = 'Limpiar búsqueda',
    onClear,
    className,
    inputClassName,
    value,
    defaultValue,
    onChange,
    disabled,
    id,
    ...props
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const generatedId = useId()
  const [currentValue, setCurrentValue] = useState(() => String(value ?? defaultValue ?? ''))
  const isControlled = value !== undefined
  const inputId = id ?? `ds-search-${generatedId.replace(/:/g, '')}`
  const errorId = error ? `${inputId}-error` : undefined

  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement)

  useEffect(() => {
    if (isControlled) setCurrentValue(String(value ?? ''))
  }, [isControlled, value])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCurrentValue(event.target.value)
    onChange?.(event)
  }

  const handleClear = () => {
    if (!isControlled) {
      setCurrentValue('')
      if (inputRef.current) inputRef.current.value = ''
    }
    onClear?.()
    inputRef.current?.focus()
  }

  return (
    <div className={cx('ds-search-field', error && 'ds-search-field--error', className)}>
      <label htmlFor={inputId} className="ds-sr-only">{label}</label>
      <span className="ds-search-field__icon" aria-hidden="true"><SearchGlyph /></span>
      <input
        {...props}
        ref={inputRef}
        id={inputId}
        type="search"
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={errorId}
        className={cx('ds-search-input', inputClassName)}
        onChange={handleChange}
      />
      {clearable && currentValue && !disabled ? (
        <button type="button" className="ds-search-field__clear" aria-label={clearLabel} onClick={handleClear}>
          <ClearGlyph />
        </button>
      ) : null}
      {error ? <span id={errorId} className="ds-search-field__error" role="alert">{error}</span> : null}
    </div>
  )
})
