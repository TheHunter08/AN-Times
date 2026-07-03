import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export interface TableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  width?: string
}

export interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyLabel?: string
}

// Filas como tarjetas con aire, no como una hoja de cálculo — cada fila
// es su propio bloque con hover, en vez de líneas de rejilla densas.
export function Table<T>({ columns, rows, rowKey, emptyLabel = 'Sin resultados' }: TableProps<T>) {
  if (!rows.length) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: colors.text[500], fontSize: 13, background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.lg }}>
        {emptyLabel}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', padding: '0 18px 8px', gap: 16, borderBottom: `1px solid ${colors.border.subtle}` }}>
        {columns.map(col => (
          <div key={col.key} style={{ flex: col.width ? `0 0 ${col.width}` : 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500] }}>
            {col.header}
          </div>
        ))}
      </div>
      {rows.map(row => (
        <div
          key={rowKey(row)}
          className="uiv2-table-row"
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '13px 18px',
            background: colors.bg[600],
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.md,
            transition: transition(['background', 'border-color', 'transform']),
          }}
        >
          {columns.map(col => (
            <div key={col.key} style={{ flex: col.width ? `0 0 ${col.width}` : 1, fontSize: 13, color: colors.text[900], minWidth: 0 }}>
              {col.render(row)}
            </div>
          ))}
        </div>
      ))}
      <style>{`
        .uiv2-table-row:hover { background: ${colors.bg[500]} !important; border-color: ${colors.border.default} !important; transform: translateX(2px); }
      `}</style>
    </div>
  )
}
