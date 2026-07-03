import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { Search } from '../components/Search.js'
import { Table } from '../components/Table.js'
import type { TableColumn } from '../components/Table.js'
import { colors } from '../design-system/colors.js'
import { typeScale } from '../design-system/typography.js'

export interface TimesheetRow {
  id: string
  name: string
  color?: string
  centro: string
  day: string
  entrada: string
  salida: string
  worked: string
  over?: boolean
}

export interface TimesheetsProps {
  rows: TimesheetRow[]
  search: string
  onSearchChange: (v: string) => void
}

export function Timesheets({ rows, search, onSearchChange }: TimesheetsProps) {
  const columns: TableColumn<TimesheetRow>[] = [
    {
      key: 'name', header: 'Empleado', width: '220px',
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={r.name} color={r.color} size={30} />
          <div>
            <div style={{ fontWeight: 700 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: colors.text[500] }}>{r.centro}</div>
          </div>
        </div>
      ),
    },
    { key: 'day', header: 'Día', width: '110px', render: r => r.day },
    { key: 'entrada', header: 'Entrada', width: '80px', render: r => r.entrada },
    { key: 'salida', header: 'Salida', width: '80px', render: r => r.salida },
    {
      key: 'worked', header: 'Trabajado', width: '100px',
      render: r => <span style={{ fontWeight: 700, color: r.over ? colors.semantic.orange : colors.text[900] }}>{r.worked}</span>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: typeScale.h1.size, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking }}>Fichajes</div>
        <Search placeholder="Buscar empleado o centro…" value={search} onChange={e => onSearchChange(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Badge tone="green">{rows.length} registros</Badge>
      </div>
      <Table columns={columns} rows={rows} rowKey={r => r.id} emptyLabel="Sin fichajes en este rango" />
    </div>
  )
}
