import { useModalBack } from '../../hooks/useModalBack.js'
import { today } from '../../utils/time.js'
import { calcStreak } from '../../utils/streaks.js'
import { AchievementsSection } from './AchievementsSection.jsx'
import { WorkHeatmap } from './WorkHeatmap.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

export function ModalLogros({ visible, db, u, onClose, saveDB }) {
  useModalBack(visible, onClose)
  const dialogRef = useDialogA11y(visible, onClose)
  if (!visible) return null
  const myRecs = (db.records || []).filter(r => r.empId === u.id && r.fin)
  // Antes reimplementaba la racha aquí mismo sin saltar fines de semana (a
  // diferencia de calcStreak, que sí lo hace) — la racha se "rompía" cada
  // sábado y no coincidía con el número que el mismo empleado ve en Inicio o
  // Perfil, además de bloquear en la práctica los logros de racha (3/7/30 días).
  const streak = calcStreak(db.records, u.id, today())
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="achievements-dialog-title" style={{ position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column', background:colors.bg[800] }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 16px 12px', borderBottom:`1px solid ${colors.border.default}`, flexShrink:0 }}>
        <button onClick={onClose} aria-label="Cerrar logros" style={{ background:'none', border:'none', color:colors.text[500], cursor:'pointer', padding:4, display:'flex' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div id="achievements-dialog-title" style={{ fontSize:16, fontWeight:800, color:colors.text[900] }}>Logros</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
        <div style={{ padding:'16px 0' }}>
          <AchievementsSection myRecs={myRecs} streak={streak} u={u} saveDB={saveDB} db={db} />
          <div style={{ padding:'0 16px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Mi actividad (15 semanas)</div>
            <WorkHeatmap records={db.records} empId={u.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
