import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { vacData } from '../../utils/time.js'
import { isValidAccountEmail, normalizeAccountEmail } from '../../utils/authRegistration.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:400, maxHeight:'92vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }
const btnPrimary = { width:'100%', padding:'12px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', marginTop:8, boxShadow:`0 4px 14px ${colors.primary.glow}` }

export function ModalInfoPersonal({ visible, db, u, onClose, toast, saveDB }) {
  const emp = (db.employees || []).find(e => e.id === u?.id) || u || {}
  const [nombre, setNombre] = useState(emp.name || '')
  const [email, setEmail] = useState(emp.email || '')
  const [tel, setTel] = useState(emp.tel || '')

  useEffect(() => {
    if (visible) {
      const e = (db.employees || []).find(e => e.id === u?.id) || u || {}
      setNombre(e.name || ''); setEmail(e.email || ''); setTel(e.tel || '')
    }
  }, [visible])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  const dialogRef = useDialogA11y(visible, onClose)
  if (!visible) return null

  const save = () => {
    const trimmedName = nombre.trim()
    if (!trimmedName) { toast('El nombre es obligatorio', 3000, 'warn'); return }
    const normalizedEmail = normalizeAccountEmail(email)
    if (!isValidAccountEmail(normalizedEmail)) { toast('Introduce un email válido', 3000, 'warn'); return }
    const duplicate = (db.employees || []).find(e => e.id !== u.id && normalizeAccountEmail(e.email) === normalizedEmail)
    if (duplicate) { toast('Ese email ya pertenece a otro empleado', 4000, 'warn'); return }
    const linked = Boolean(emp.authId || emp.auth_id)
    if (linked && normalizeAccountEmail(emp.email) !== normalizedEmail) {
      toast('No se puede cambiar el email de una cuenta ya vinculada', 4500, 'warn')
      return
    }
    saveDB(fresh => ({
      employees: (fresh.employees || []).map(e => e.id === u.id ? { ...e, name: trimmedName, email: normalizedEmail, tel } : e),
    }))
    toast('Datos actualizados')
    onClose()
  }

  const Field = ({ label, value, onChange, readonly }) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, color:colors.text[500], marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>{label}</div>
      <input
        value={value} onChange={e => onChange && onChange(e.target.value)} readOnly={readonly}
        style={{ width:'100%', padding:'10px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`,
          background: readonly ? colors.bg[600] : colors.bg[500], color:colors.text[900],
          fontSize:14, boxSizing:'border-box', fontFamily:'inherit', outline:'none', opacity: readonly ? 0.7 : 1 }}
      />
    </div>
  )

  return (
    <div style={OV} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Información personal" tabIndex={-1} style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900] }}>Información personal</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', fontFamily:'inherit' }}>×</button>
        </div>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:colors.primary.base, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto', color:'#fff', fontWeight:700 }}>
            {(nombre||'?')[0].toUpperCase()}
          </div>
        </div>
        <Field label="Nombre" value={nombre} onChange={setNombre} />
        <Field label="Email" value={email} onChange={setEmail} />
        <Field label="Teléfono" value={tel} onChange={setTel} />
        <Field label="Obra" value={emp.empresa || '—'} readonly />
        <Field label="Centro de trabajo" value={emp.centroTrabajo || '—'} readonly />
        <Field label="Rol" value={emp.role==='encargado'?'Encargado':emp.role==='jefe_obra'?'Jefe de Obra':'Empleado'} readonly />
        <Field label="Fecha de alta" value={emp.fechaAlta || '—'} readonly />
        <Field label="Días vacaciones/año" value={String(vacData(u.id, db).generated || 22) + ' días'} readonly />
        <button style={btnPrimary} onClick={save}>Guardar cambios</button>
      </div>
    </div>
  )
}
