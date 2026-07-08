import { useState, useMemo, Suspense, lazy } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, calcSecs, calcMin, gid } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { CtrlCard } from '../../components/admin/CtrlCard.jsx'
const MapaObra = lazy(() => import('../../components/admin/MapaObra.jsx').then(m => ({ default: m.MapaObra })))

export default function PanelControl({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const [vista, setVista] = useState('lista') // 'lista' | 'mapa'
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)

  const liveEmpsForMap = useMemo(() => liveRecs.map(r => {
    const e = emps.find(x => x.id === r.empId)
    if (!e || !r.locInicio) return null
    return { id: e.id, name: e.name, initials: (e.initials || e.name.slice(0, 2)).toUpperCase(), lat: r.locInicio.lat, lng: r.locInicio.lng, enDescanso: !!r.enDescanso }
  }).filter(Boolean), [liveRecs, emps])

  // Pre-compute todayMin per employee (avoids O(n²) filter inside render)
  const todayMinMap = useMemo(() => {
    const tod = today()
    const map = {}
    recs.filter(r => r.fin && r.inicio?.startsWith(tod)).forEach(r => {
      map[r.empId] = (map[r.empId] || 0) + calcMin(r)
    })
    return map
  }, [recs])

  const adminName = session?.user?.name || 'Admin'

  const startJornada = (e) => {
    if (liveRecs.find(r => r.empId === e.id)) { toast('Ya tiene jornada abierta', 3000, 'warn'); return }
    const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || '', breaks: [], workSecs: 0, breakSecs: 0, creadoPor: adminName }
    const withAudit = auditLog(db, 'Jornada iniciada por admin', e.name, adminName)
    saveDB({ records: [...recs, newRec], audit: withAudit.audit })
    queuePush(e.id, '▶ Jornada iniciada', `${adminName} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
    toast(`Jornada iniciada — ${e.name.split(' ')[0]}`, 3000, 'ok')
  }

  const toggleDescanso = (rec) => {
    const now = new Date().toISOString()
    let updated
    if (rec.enDescanso) {
      const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
      updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
      queuePush(rec.empId, '▶ Descanso finalizado', `${adminName} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso finalizado', 3000, 'ok')
    } else {
      updated = { ...rec, enDescanso: true, bStartTs: now }
      queuePush(rec.empId, '⏸ Descanso iniciado', `${adminName} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso iniciado', 3000, 'ok')
    }
    saveDB({ records: recs.map(r => r.id === rec.id ? updated : r) })
  }

  const force = (rec) => {
    const workedMin = Math.floor((Date.now() - new Date(rec.inicio).getTime()) / 60000)
    const warnMsg = workedMin < 5 ? ` ⚠️ Solo lleva ${workedMin} min trabajando.` : ''
    showConfirm(`¿Forzar cierre de jornada de ${rec.empName}?${warnMsg}`, () => {
      const now = new Date().toISOString()
      const breaks = [...(rec.breaks || [])]
      if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
      const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      saveDB(freshDb => {
        const wA = auditLog(freshDb, 'Jornada cerrada forzosamente', rec.empName, adminName)
        return { records: (freshDb.records || []).map(r => r.id === rec.id ? closed : r), audit: wA.audit }
      })
      queuePush(rec.empId, '⏱️ Jornada cerrada', `${adminName} ha cerrado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
      toast('Jornada cerrada forzosamente', 3000, 'ok')
    })
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Control en tiempo real</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>
            <span className="live-indicator" style={{ display:'inline-block', verticalAlign:'middle', marginRight:6 }} />
            {liveRecs.length} activos / {emps.length} totales
          </div>
        </div>
        <div style={{ display:'flex', gap:6, background:'var(--bg-600)', borderRadius:10, padding:3 }}>
          {[['lista','☰ Lista'],['mapa','🗺️ Mapa']].map(([v,lbl]) => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                background: vista===v ? 'var(--primary)' : 'transparent', color: vista===v ? '#fff' : 'var(--text3)' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {vista === 'mapa' && (
        <div style={{ marginBottom:16 }}>
          <Suspense fallback={<div style={{ height:420, borderRadius:'var(--r-lg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text3)', fontSize:12 }}>Cargando mapa…</div>}>
            <MapaObra obras={db.obras || []} liveEmps={liveEmpsForMap} />
          </Suspense>
        </div>
      )}

      {vista === 'lista' && !liveRecs.length && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(96,116,138,.08)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:16 }}>
          <span style={{ fontSize:16 }}>😴</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)' }}>Nadie activo ahora mismo</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>Los fichajes aparecerán aquí en tiempo real cuando los empleados inicien jornada</div>
          </div>
        </div>
      )}

      {vista === 'lista' && (
        <div className="stagger-in" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
          {emps.map(e => (
            <CtrlCard
              key={e.id}
              e={e}
              live={liveRecs.find(r => r.empId === e.id)}
              todayMin={todayMinMap[e.id] || 0}
              wdMin={db.config?.wdMin}
              force={force}
              startJornada={startJornada}
              toggleDescanso={toggleDescanso}
            />
          ))}
        </div>
      )}
    </div>
  )
}
