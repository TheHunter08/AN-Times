import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { vacData } from '../../utils/time.js'

export function ModalInfoPersonal({ visible, db, u, onClose, toast, saveDB }) {
  const emp = (db.employees || []).find(e => e.id === u?.id) || u || {}
  const [nombre, setNombre] = useState(emp.name || '')
  const [email, setEmail] = useState(emp.email || '')
  const [tel, setTel] = useState(emp.tel || '')

  useEffect(() => {
    if (visible) {
      const e = (db.employees || []).find(e => e.id === u?.id) || u || {}
      setNombre(e.name || '')
      setEmail(e.email || '')
      setTel(e.tel || '')
    }
  }, [visible])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null

  const save = () => {
    const updated = db.employees.map(e =>
      e.id === u.id ? { ...e, name: nombre, email, tel } : e
    )
    saveDB({ employees: updated })
    toast('Datos actualizados')
    onClose()
  }

  const field = (label, value, onChange, readonly) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>{label}</div>
      <input
        value={value} onChange={e => onChange && onChange(e.target.value)}
        readOnly={readonly}
        style={{
          width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)',
          background: readonly ? 'var(--bg-700)' : 'var(--bg-800)', color:'var(--text)',
          fontSize:14, boxSizing:'border-box', opacity: readonly ? 0.7 : 1
        }}
      />
    </div>
  )

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Información personal</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto', color:'#fff', fontWeight:700 }}>
            {(nombre||'?')[0].toUpperCase()}
          </div>
        </div>
        {field('Nombre', nombre, setNombre)}
        {field('Email', email, setEmail)}
        {field('Teléfono', tel, setTel)}
        {field('Obra', emp.empresa || '—', null, true)}
        {field('Centro de trabajo', emp.centroTrabajo || '—', null, true)}
        {field('Rol', emp.role==='encargado'?'Encargado':emp.role==='jefe_obra'?'Jefe de Obra':'Empleado', null, true)}
        {field('Fecha de alta', emp.fechaAlta || '—', null, true)}
        {field('Días vacaciones/año', String(vacData(u.id, db).generated || 22) + ' días', null, true)}
        <button className="btn btn-primary" onClick={save} style={{ width:'100%', marginTop:8 }}>Guardar cambios</button>
      </div>
    </div>
  )
}
