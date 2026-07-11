import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { shadows } from '../design-system/shadows.js'

export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  trigger?: ReactNode
}

export function Dropdown({ options, value, onChange, placeholder = 'Selecciona…', trigger }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="uiv2-dd-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px',
          borderRadius: radius.sm,
          border: `1px solid ${open ? colors.primary.base : colors.border.default}`,
          background: colors.bg[600],
          color: colors.text[900],
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: shadows.sm,
        }}
      >
        {trigger ?? (selected?.label || placeholder)}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180, zIndex: 100,
            background: colors.bg[500],
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.sm,
            boxShadow: shadows.lg,
            overflow: 'hidden',
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="uiv2-dd-option"
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                background: o.value === value ? colors.primary.dim : 'transparent',
                color: colors.text[900], border: 'none', cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <style>{`.uiv2-dd-option:hover { background: rgba(255,255,255,.05) !important; }`}</style>
    </div>
  )
}
