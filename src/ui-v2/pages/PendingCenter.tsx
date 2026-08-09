import { useAppStore } from '../../store/appStore.js'
import { canCloseMonth } from '../../utils/adminHelpers.js'
import { isRecordPendingValidation } from '../../utils/recordValidation.js'
import { colors } from '../design-system/colors'

export function PendingCenter({ onNavigate }: { onNavigate: (page: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const offlinePending = useAppStore(s => s.offlinePending)
  const syncStatus = useAppStore(s => s.syncStatus)
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const now = Date.now()
  const openTooLong = (db.records || []).filter((r:any) => !r.fin && r.inicio && now - new Date(r.inicio).getTime() > 10 * 3600000).length
  const pendingHours = (db.records || []).filter(isRecordPendingValidation).length
  const pendingVacations = (db.vacaciones || []).filter((v:any) => v.estado === 'pendiente').length
  const pendingExpenses = (db.gastos || []).filter((g:any) => g.estado === 'pendiente').length
  const pendingDocuments = (db.documentos || []).filter((d:any) => {
    if (!d.expiresOn) return false
    return (new Date(`${d.expiresOn}T23:59:59`).getTime() - now) / 86400000 <= 30
  }).length
  const pendingClosures = (db.cierres || []).filter((c:any) => canCloseMonth(c.mes) && !(c.firmaAdmin && (c.firmaEmp || c.firma))).length
  const cards = [
    { label:'Jornadas abiertas +10h', value:openTooLong, page:'en_linea', tone:colors.semantic.red },
    { label:'Horas por validar', value:pendingHours, page:'validar', tone:colors.semantic.orange },
    { label:'Vacaciones pendientes', value:pendingVacations, page:'solicitudes', tone:colors.primary.light },
    { label:'Gastos pendientes', value:pendingExpenses, page:'gastos', tone:colors.semantic.orange },
    { label:'Documentos a revisar', value:pendingDocuments, page:'documentos', tone:colors.accent.base },
    { label:'Cierres sin completar', value:pendingClosures, page:'cierre', tone:colors.text[700] },
  ]
  const exportBackup = () => {
    const payload = { exportedAt:new Date().toISOString(), app:'Times INC', version:1, data:db }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `times-inc-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:1000 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <div><h1 style={{ margin:0, fontSize:24, color:colors.text[900] }}>Centro de pendientes</h1><p style={{ margin:'6px 0 0', color:colors.text[500], fontSize:13 }}>Todo lo que requiere atención administrativa en un único lugar.</p></div>
      <button onClick={exportBackup} style={{ padding:'9px 13px', borderRadius:9, border:`1px solid ${colors.primary.base}`, background:colors.primary.dim, color:colors.primary.light, fontWeight:700, cursor:'pointer' }}>Descargar copia JSON</button>
    </div>
    <div style={{ padding:'13px 15px', borderRadius:12, border:`1px solid ${offlinePending || syncStatus === 'error' ? 'rgba(245,158,11,.4)' : colors.border.subtle}`, background:colors.bg[600], display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
      <strong style={{ color:offlinePending || syncStatus === 'error' ? colors.semantic.orange : colors.semantic.green }}>{offlinePending ? 'Hay un lote de cambios pendiente de subir' : syncStatus === 'synced' ? 'Datos sincronizados' : `Sincronización: ${syncStatus}`}</strong>
      <span style={{ color:colors.text[500], fontSize:12 }}>{lastSyncTime ? `Última confirmación: ${new Date(lastSyncTime).toLocaleString('es-ES')}` : 'Todavía sin confirmación del servidor'}</span>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
      {cards.map(card => <button key={card.label} onClick={() => onNavigate(card.page)} style={{ textAlign:'left', padding:16, borderRadius:12, border:`1px solid ${colors.border.subtle}`, background:colors.bg[600], cursor:'pointer', color:colors.text[900] }}><div style={{ color:colors.text[500], fontSize:12 }}>{card.label}</div><div style={{ marginTop:8, fontSize:28, fontWeight:800, color:card.tone }}>{card.value}</div><div style={{ marginTop:8, color:colors.primary.light, fontSize:11, fontWeight:700 }}>Revisar →</div></button>)}
    </div>
  </div>
}
