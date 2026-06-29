import { useState } from 'react'

export default function PanelAuditoria({ db }) {
  const [auditQ, setAuditQ] = useState('')
  const [auditUser, setAuditUser] = useState('')
  const audit = (db.audit || []).slice().reverse()
  const users = [...new Set(audit.map(a => a.user).filter(Boolean))]

  const ACTION_COLORS = {
    'Jornada': 'var(--green)', 'Empleado': 'var(--primary-light)', 'Obra': 'var(--teal)',
    'Documento': 'var(--orange)', 'Solicitud': 'var(--accent)', 'Centro': 'var(--secondary)',
    'PIN': 'var(--red)', 'correccion': 'var(--yellow)',
  }
  const getColor = (action) => {
    for (const [k, v] of Object.entries(ACTION_COLORS)) if (action?.toLowerCase().includes(k.toLowerCase())) return v
    return 'var(--text3)'
  }

  const filtered = audit.filter(a => {
    if (auditQ) {
      const q = auditQ.toLowerCase()
      if (!a.action?.toLowerCase().includes(q) && !a.detail?.toLowerCase().includes(q)) return false
    }
    if (auditUser && a.user !== auditUser) return false
    return true
  })

  const exportAuditCSV = () => {
    const headers = ['Fecha','Hora','Acción','Usuario','Detalle']
    const rows = filtered.map(a => {
      const d = a.ts ? new Date(a.ts) : null
      return [
        d ? d.toLocaleDateString('es-ES') : '',
        d ? d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : '',
        a.action || '',
        a.user || '',
        a.detail || ''
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Auditoría</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{filtered.length} de {audit.length} registros</div>
        </div>
        <button onClick={exportAuditCSV} className="btn btn-secondary btn-sm" disabled={!filtered.length} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
      <div className="premium-filters" style={{ marginBottom:16 }}>
        <input placeholder="Buscar acción o detalle…" value={auditQ} onChange={e => setAuditQ(e.target.value)} style={{ flex:1, minWidth:160 }} />
        <select value={auditUser} onChange={e => setAuditUser(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {(auditQ || auditUser) && (
          <button onClick={() => { setAuditQ(''); setAuditUser('') }} className="btn btn-secondary" style={{ fontSize:12 }}>Limpiar</button>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {!filtered.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
            <div className="empty-premium-title">{audit.length ? 'Sin resultados' : 'Sin registros'}</div>
            <div className="empty-premium-sub">{audit.length ? 'Prueba con otros filtros' : 'Las acciones del sistema se registrarán aquí automáticamente'}</div>
          </div>
        )}
        {filtered.map((a, i) => (
          <div key={i} className="audit-row-premium">
            <div className="audit-dot" style={{ background: getColor(a.action) }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>{a.action}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{a.user}{a.detail ? ` · ${a.detail}` : ''}</div>
            </div>
            <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right', flexShrink:0, whiteSpace:'nowrap' }}>
              {a.ts ? new Date(a.ts).toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' }) : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
