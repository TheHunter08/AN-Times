import { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, p2, ftime, calcSecs, calcMin, wkStart, recWorkSecs } from '../../utils/time.js'
import { WD } from '../../config/constants.js'
import { auditLog } from '../../services/dataService.js'

export default function PanelFichajes({ db, toast, saveDB, session }) {
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [editingRec, setEditingRec] = useState(null)
  const [pageSize, setPageSize] = useState(100)
  const emps = db.employees || []
  const recs = (db.records || []).filter(r => r.fin)
  const now = new Date()
  const todayStr = today()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const qs = {
    hoy:    r => r.inicio?.startsWith(todayStr),
    semana: r => r.inicio && new Date(r.inicio) >= wkStart(now),
    mes:    r => r.inicio?.startsWith(mk),
  }

  const filtered = useMemo(() => recs.filter(r => {
    if (quickFilter && qs[quickFilter] && !qs[quickFilter](r)) return false
    if (!quickFilter && filterDate && !r.inicio?.startsWith(filterDate)) return false
    if (filterEmp && r.empId !== filterEmp) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.empName?.toLowerCase().includes(q) && !r.centro?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a,b) => (b.inicio||'').localeCompare(a.inicio||'') || a.id.localeCompare(b.id)), [recs, quickFilter, filterDate, filterEmp, search])
  const pagedFiltered = filtered.slice(0, pageSize)

  const totalWork = useMemo(() => filtered.reduce((s,r) => s + Math.floor(recWorkSecs(r)/60), 0), [filtered])
  const totalBreak = useMemo(() => filtered.reduce((s,r) => s + Math.floor((r.breakSecs||0)/60), 0), [filtered])

  const { showConfirm } = useAppStore()
  const del = (id) => {
    showConfirm('¿Eliminar este fichaje?', () => {
      const rec = (db.records||[]).find(r => r.id === id)
      const withAudit = auditLog(db, 'Fichaje eliminado', `${rec?.empName || ''} · ${rec?.inicio?.slice(0,10) || ''}`, session?.user?.name || 'Admin')
      saveDB({ records: (db.records||[]).filter(r => r.id !== id), audit: withAudit.audit })
      toast('Fichaje eliminado')
    })
  }

  const downloadCSV = () => {
    const headers = ['Empleado','Centro','Fecha','Entrada','Salida','Trabajo (min)','Descanso (min)']
    const rows = filtered.map(r => [
      r.empName || '',
      r.centro || '',
      r.inicio?.slice(0,10) || '',
      r.inicio?.slice(11,16) || '',
      r.fin?.slice(11,16) || '',
      Math.floor(recWorkSecs(r)/60),
      Math.floor((r.breakSecs||0)/60)
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `fichajes-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast(`${rows.length} fichajes exportados`, 3000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Fichajes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{filtered.length} registros · {mhm(totalWork)} trabajo</div>
        </div>
        <button onClick={downloadCSV} className="btn btn-secondary" style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>

      {/* Quick filters */}
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {[['','Todos'],['hoy','Hoy'],['semana','Esta semana'],['mes','Este mes']].map(([v,l]) => (
          <button key={v} onClick={() => { setQuickFilter(v); if(v) setFilterDate('') }}
            style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:'1px solid', transition:'all .15s',
              background: quickFilter===v ? 'var(--primary)' : 'var(--bg-600)',
              color: quickFilter===v ? '#fff' : 'var(--text3)',
              borderColor: quickFilter===v ? 'var(--primary)' : 'var(--border)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Active filter badge */}
      {(quickFilter || filterDate || filterEmp) && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          <span style={{ fontSize:11, color:'var(--text4)', fontWeight:600, alignSelf:'center' }}>Viendo:</span>
          {quickFilter && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {quickFilter === 'hoy' ? 'Hoy' : quickFilter === 'semana' ? 'Esta semana' : 'Este mes'}
              <button onClick={() => setQuickFilter('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
          {filterDate && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {filterDate}
              <button onClick={() => setFilterDate('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
          {filterEmp && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--primary-dim)', color:'var(--primary-light)', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, border:'1px solid var(--primary-glow)' }}>
              {emps.find(e => e.id === filterEmp)?.name || filterEmp}
              <button onClick={() => setFilterEmp('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, lineHeight:1, fontSize:12, fontWeight:700 }}>×</button>
            </span>
          )}
        </div>
      )}

      <div className="premium-filters">
        <input placeholder="Buscar empleado o centro…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:180 }} />
        <input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setQuickFilter('') }} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todos los empleados</option>
          {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Salida</th><th>Trabajo</th><th>Descanso</th><th>GPS</th><th></th></tr></thead>
          <tbody>
            {pagedFiltered.map(r => {
              const wm = Math.floor(recWorkSecs(r)/60)
              const bm = Math.floor((r.breakSecs||0)/60)
              const over = wm > WD
              const loc = r.locInicio
              return (
                <tr key={r.id}>
                  <td>{r.empName}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{r.centro || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                    {editingRec?.id === r.id && editingRec?.field === 'inicio' ? (
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input type="datetime-local" defaultValue={r.inicio?.slice(0,16) || ''} id="edit-rec-input"
                          style={{ fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border2)', background:'var(--bg-500)', color:'var(--text)', fontFamily:'inherit', width:155 }} />
                        <button className="btn btn-sm btn-primary" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={() => {
                            const val = document.getElementById('edit-rec-input').value
                            if (!val) return
                            const newInicio = new Date(val).toISOString()
                            if (r.fin && newInicio >= r.fin) { toast('La entrada debe ser anterior a la salida', 3500, 'err'); return }
                            const empRecs = (db.records||[]).filter(rec => rec.empId === r.empId && rec.id !== r.id && rec.fin)
                            if (empRecs.some(rec => newInicio < rec.fin && (r.fin || newInicio) > rec.inicio)) { toast('La hora se solapa con otro fichaje', 3500, 'err'); return }
                            const updated = (db.records||[]).map(rec => {
                              if (rec.id !== r.id) return rec
                              const t2 = calcSecs({ ...rec, inicio: newInicio })
                              return { ...rec, inicio: newInicio, workSecs: t2.work, breakSecs: t2.brk }
                            })
                            const withAudit = auditLog(db, 'Hora entrada editada', `${r.empName}: ${ftime(r.inicio)} → ${ftime(newInicio)}`, session?.user?.name || 'Admin')
                            saveDB({ records: updated, audit: withAudit.audit })
                            setEditingRec(null)
                            toast('Hora de entrada actualizada', 3000, 'ok')
                          }}>✓</button>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setEditingRec(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:2 }} title="Click para editar" onClick={() => setEditingRec({ id:r.id, field:'inicio' })}>
                        {ftime(r.inicio)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>
                    {editingRec?.id === r.id && editingRec?.field === 'fin' ? (
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input type="datetime-local" defaultValue={r.fin?.slice(0,16)} id="edit-rec-fin-input"
                          style={{ fontSize:11, padding:'3px 6px', borderRadius:6, border:'1px solid var(--border2)', background:'var(--bg-500)', color:'var(--text)', fontFamily:'inherit', width:155 }} />
                        <button className="btn btn-sm btn-primary" style={{ fontSize:10, padding:'3px 8px' }}
                          onClick={() => {
                            const val = document.getElementById('edit-rec-fin-input').value
                            if (!val) return
                            const newFin = new Date(val).toISOString()
                            if (newFin <= r.inicio) { toast('La salida debe ser posterior a la entrada', 3500, 'err'); return }
                            const empRecs2 = (db.records||[]).filter(rec => rec.empId === r.empId && rec.id !== r.id && rec.fin)
                            if (empRecs2.some(rec => r.inicio < rec.fin && newFin > rec.inicio)) { toast('La hora se solapa con otro fichaje', 3500, 'err'); return }
                            const updated = (db.records||[]).map(rec => {
                              if (rec.id !== r.id) return rec
                              const t2 = calcSecs({ ...rec, fin: newFin })
                              return { ...rec, fin: newFin, workSecs: t2.work, breakSecs: t2.brk }
                            })
                            const withAudit = auditLog(db, 'Hora salida editada', `${r.empName}: ${ftime(r.fin)} → ${ftime(newFin)}`, session?.user?.name || 'Admin')
                            saveDB({ records: updated, audit: withAudit.audit })
                            setEditingRec(null)
                            toast('Hora de salida actualizada', 3000, 'ok')
                          }}>✓</button>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setEditingRec(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:2 }} title="Click para editar" onClick={() => setEditingRec({ id:r.id, field:'fin' })}>
                        {ftime(r.fin)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight:700, color: over ? 'var(--orange)' : undefined }}>{mhm(wm)}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{mhm(bm)}</td>
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      {loc ? (
                        <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}&zoom=17`}
                          target="_blank" rel="noopener noreferrer"
                          title={`Entrada: ${loc.lat}, ${loc.lng} ±${loc.acc||'?'}m${r.geoAlert ? ` ⚠️ Fuera de zona: ${r.geoAlert.dist}m (radio ${r.geoAlert.radio}m)` : ''}`}
                          style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:13 }}>▶ 📍</span>
                          {r.geoAlert ? (
                            <span style={{ fontSize:9, fontWeight:700, color: r.geoAlert.dist > r.geoAlert.radio * 2 ? 'var(--red)' : 'var(--orange)', background: r.geoAlert.dist > r.geoAlert.radio * 2 ? 'rgba(239,68,68,.1)' : 'var(--orange-dim)', border:`1px solid ${r.geoAlert.dist > r.geoAlert.radio * 2 ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.25)'}`, borderRadius:20, padding:'1px 5px', whiteSpace:'nowrap' }}>⚠ +{r.geoAlert.dist}m</span>
                          ) : (
                            <span style={{ fontSize:9, color:'var(--green)', fontWeight:600 }}>✓</span>
                          )}
                        </a>
                      ) : <span style={{ color:'var(--text4)', fontSize:11 }}>▶ —</span>}
                      {r.locFin ? (
                        <a href={`https://www.openstreetmap.org/?mlat=${r.locFin.lat}&mlon=${r.locFin.lng}&zoom=17`}
                          target="_blank" rel="noopener noreferrer"
                          title={`Salida: ${r.locFin.lat}, ${r.locFin.lng}`}
                          style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:13 }}>⏹ 📍</span>
                          <span style={{ fontSize:9, color:'var(--text4)' }}>salida</span>
                        </a>
                      ) : r.fin ? <span style={{ fontSize:10, color:'var(--text4)' }}>⏹ —</span> : null}
                    </div>
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              )
            })}
            {!pagedFiltered.length && <tr><td colSpan={8} className="empty">Sin resultados</td></tr>}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background:'var(--bg-500)' }}>
                <td colSpan={4} style={{ fontWeight:700, fontSize:12, color:'var(--text3)', padding:'8px 14px' }}>
                  Total ({filtered.length} registros)
                </td>
                <td style={{ fontWeight:800, color:'var(--primary-light)', fontVariantNumeric:'tabular-nums' }}>{mhm(totalWork)}</td>
                <td style={{ fontWeight:700, color:'var(--text3)', fontVariantNumeric:'tabular-nums', fontSize:12 }}>{mhm(totalBreak)}</td>
                <td /><td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length > pageSize && (
        <div style={{ textAlign:'center', marginTop:14 }}>
          <button className="btn btn-secondary" onClick={() => setPageSize(s => s + 100)}>
            Ver más ({filtered.length - pageSize} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
