import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { Search } from '../components/Search.js'
import { Table } from '../components/Table.js'
import type { TableColumn } from '../components/Table.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconEdit, IconX, IconCheck, IconDownload } from '../components/Icons.js'
import { downloadXlsx, downloadCsv } from '../../utils/exportFiles.js'
import { today } from '../../utils/time.js'
import { useAppStore } from '../../store/appStore.js'

export interface TimesheetRow {
  id: string
  name: string
  centro: string
  day: string
  entrada: string
  salida: string
  worked: string
  over?: boolean
  history?: string
}
export interface TimesheetsProps {
  rows: TimesheetRow[]
  search: string
  onSearchChange: (v: string) => void
  onModify?: (id: string, entry: string, exit: string, reason: string) => Promise<boolean> | boolean
  onDelete?: (id: string, reason: string) => Promise<boolean> | boolean
}

export function Timesheets({ rows, search, onSearchChange, onModify, onDelete }: TimesheetsProps) {
  const toast = useAppStore(s => s.toast)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState('')
  const [editExit, setEditExit] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const startEdit = (row: TimesheetRow) => { setEditingId(row.id); setEditEntry(row.entrada); setEditExit(row.salida); setEditReason('') }
  const saveEdit = async (row: TimesheetRow) => {
    if (!onModify) return
    setSavingId(row.id)
    if (!editReason.trim()) return
    const ok = await onModify(row.id, editEntry, editExit, editReason.trim())
    setSavingId(null)
    if (ok !== false) setEditingId(null)
  }
  const columns: TableColumn<TimesheetRow>[] = [
    {
      key: 'name', header: 'Empleado', width: '160px',
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Avatar name={r.name} size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
            <div style={{ fontSize: 11, color: colors.text[500], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.centro}</div>
          </div>
        </div>
      ),
    },
    { key: 'day', header: 'Día', width: '90px', render: r => r.day },
    { key: 'entrada', header: 'Entrada', width: '88px', render: r => editingId === r.id ? <input aria-label={`Entrada de ${r.name}`} type="time" value={editEntry} onChange={e => setEditEntry(e.target.value)} style={{ width:82, minHeight:36, padding:'4px 6px', borderRadius:8, border:`1px solid ${colors.primary.base}`, background:colors.bg[600], color:colors.text[900] }}/> : r.entrada },
    { key: 'salida', header: 'Salida e historial', width: '260px', render: r => editingId === r.id ? <div style={{ display:'grid', gap:5 }}><input aria-label={`Salida de ${r.name}`} type="time" value={editExit} onChange={e => setEditExit(e.target.value)} style={{ width:82, minHeight:36, padding:'4px 6px', borderRadius:8, border:`1px solid ${colors.primary.base}`, background:colors.bg[600], color:colors.text[900] }}/><input aria-label={`Motivo de modificación de ${r.name}`} placeholder="Motivo obligatorio" value={editReason} onChange={e => setEditReason(e.target.value)} style={{ width:180, minHeight:34, padding:'4px 8px', borderRadius:8, border:`1px solid ${editReason.trim() ? colors.border.default : colors.semantic.orange}`, background:colors.bg[600], color:colors.text[900] }}/></div> : <div><strong>{r.salida}</strong>{r.history && <div title={r.history} style={{ marginTop:3, maxWidth:250, color:colors.text[400], fontSize:10.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.history}</div>}</div> },
    {
      key: 'worked', header: 'Trabajo', width: '72px',
      render: r => <span style={{ fontWeight: 700, color: r.over ? colors.semantic.orange : colors.text[900] }}>{r.worked}</span>,
    },
    {
      key: 'actions', header: 'Acciones', width: '104px', render: r => (
        <div style={{ display:'flex', gap:6 }}>
          {editingId === r.id ? <>
            <button aria-label={`Guardar fichaje de ${r.name}`} disabled={savingId === r.id || !editReason.trim()} onClick={() => saveEdit(r)} style={{ width:38, height:38, border:0, borderRadius:9, background:colors.primary.base, color:'#fff', cursor:'pointer', opacity:!editReason.trim() ? .6 : 1 }}><IconCheck width={14} height={14}/></button>
            <button aria-label="Cancelar edición" onClick={() => setEditingId(null)} style={{ width:38, height:38, border:`1px solid ${colors.border.default}`, borderRadius:9, background:'transparent', color:colors.text[700], cursor:'pointer' }}><IconX width={14} height={14}/></button>
          </> : <>
            <button aria-label={`Modificar fichaje de ${r.name}`} onClick={() => startEdit(r)} style={{ width:38, height:38, border:0, borderRadius:9, background:colors.primary.dim, color:colors.primary.light, cursor:'pointer' }}><IconEdit width={14} height={14}/></button>
            <button aria-label={`Eliminar fichaje de ${r.name}`} onClick={() => { const reason = window.prompt('Motivo obligatorio para eliminar el fichaje:')?.trim(); if (reason) onDelete?.(r.id, reason) }} style={{ width:38, height:38, border:'1px solid rgba(239,68,68,.28)', borderRadius:9, background:'transparent', color:colors.semantic.red, cursor:'pointer' }}><IconX width={14} height={14}/></button>
          </>}
        </div>
      )
    },
  ]

  const exportHeaders = ['Empleado', 'Centro', 'Día', 'Entrada', 'Salida', 'Trabajo']
  const exportRows = () => rows.map(r => [r.name, r.centro, r.day, r.entrada, r.salida, r.worked])
  const exportBtnStyle = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Fichajes</PageTitle>
        <Search placeholder="Buscar empleado o centro…" value={search} onChange={e => onSearchChange(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone="purple">{rows.length} registros</Badge>
        <div style={{ flex: 1 }} />
        <button type="button" style={exportBtnStyle} onClick={async () => {
          try {
            await downloadXlsx(exportHeaders, exportRows(), `fichajes-${today()}.xlsx`, 'Fichajes')
            toast('Excel profesional generado correctamente', 3000, 'ok')
          } catch (error: any) {
            toast(`No se pudo generar el Excel: ${error?.message || 'error desconocido'}`, 6000, 'err')
          }
        }}>
          <IconDownload width={13} height={13} /> Excel
        </button>
        <button type="button" style={exportBtnStyle} onClick={() => downloadCsv(exportHeaders, exportRows(), `fichajes-${today()}.csv`)}>
          <IconDownload width={13} height={13} /> CSV
        </button>
      </div>
      <Table columns={columns} rows={rows} rowKey={r => r.id} emptyLabel="Sin fichajes en este rango" />
    </div>
  )
}
import { useState } from 'react'
