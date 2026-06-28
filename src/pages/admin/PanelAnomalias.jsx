import { useState, useMemo } from 'react'
import { gid, fds } from '../../utils/time.js'
import { auditLog } from '../../services/dataService.js'

function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return Math.abs(h).toString(36)
}

const NIVEL_COLORS = {
  alto: '#ef4444',
  medio: '#f59e0b',
  bajo: '#6366f1',
}

const NIVEL_BG = {
  alto: 'rgba(239,68,68,.12)',
  medio: 'rgba(245,158,11,.12)',
  bajo: 'rgba(99,102,241,.12)',
}

const NIVEL_ORDER = { alto: 0, medio: 1, bajo: 2 }

const TIPO_LABELS = {
  buddy_punching: 'Riesgo fichaje por otro',
  forgotten_clockout: 'Olvido de salida',
  impossible_schedule: 'Jornada imposible (>14h)',
  chronic_lateness: 'Retraso crónico',
  ghost_employee: 'Sin actividad 30 días',
}

export default function PanelAnomalias({ db, toast, saveDB, session }) {
  const [filterNivel, setFilterNivel] = useState('todos')
  const [filterTipo, setFilterTipo] = useState('todos')
  const [showReviewed, setShowReviewed] = useState(false)

  const who = session?.user?.name || 'Admin'

  const anomalias = useMemo(() => {
    const records = db.records || []
    const employees = db.employees || []
    const activeEmps = employees.filter(e => !e.baja && !e.isAdmin)
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000
    const result = []

    // 1. Forgotten clock-out: records with autoClosedAt
    records.forEach(r => {
      if (r.autoClosedAt) {
        const emp = employees.find(e => e.id === r.empId)
        const id = hashStr(`forgotten_${r.id}`)
        result.push({
          id,
          empId: r.empId,
          empName: emp?.name || r.empId,
          tipo: 'forgotten_clockout',
          descripcion: `Fichaje del ${fds(r.inicio)} cerrado automáticamente por falta de salida manual.`,
          nivel: 'bajo',
          fecha: r.inicio ? r.inicio.slice(0, 10) : '',
        })
      }
    })

    // 2. Impossible schedule: record with more than 14 hours worked
    records.forEach(r => {
      if (!r.inicio || !r.fin) return
      const segs = r.workSecs || 0
      const hours = segs / 3600
      if (hours > 14) {
        const emp = employees.find(e => e.id === r.empId)
        const id = hashStr(`impossible_${r.id}`)
        result.push({
          id,
          empId: r.empId,
          empName: emp?.name || r.empId,
          tipo: 'impossible_schedule',
          descripcion: `Jornada de ${hours.toFixed(1)}h registrada el ${fds(r.inicio)}, supera las 14 horas permitidas.`,
          nivel: 'alto',
          fecha: r.inicio ? r.inicio.slice(0, 10) : '',
        })
      }
    })

    // 3. Buddy punching: two employees clock in within 2 minutes of each other on 3+ days
    const recordsByDate = {}
    records.forEach(r => {
      if (!r.inicio) return
      const fecha = r.inicio.slice(0, 10)
      if (!recordsByDate[fecha]) recordsByDate[fecha] = []
      recordsByDate[fecha].push(r)
    })

    const buddyPairCounts = {}
    Object.values(recordsByDate).forEach(dayRecs => {
      const sorted = [...dayRecs].sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const diff = Math.abs(new Date(sorted[i].inicio) - new Date(sorted[j].inicio))
          if (diff <= 2 * 60 * 1000) {
            const pair = [sorted[i].empId, sorted[j].empId].sort().join('__')
            buddyPairCounts[pair] = (buddyPairCounts[pair] || 0) + 1
          }
        }
      }
    })

    Object.entries(buddyPairCounts).forEach(([pair, count]) => {
      if (count >= 3) {
        const [id1, id2] = pair.split('__')
        const emp1 = employees.find(e => e.id === id1)
        const emp2 = employees.find(e => e.id === id2)
        const anomId = hashStr(`buddy_${pair}`)
        result.push({
          id: anomId,
          empId: id1,
          empName: `${emp1?.name || id1} & ${emp2?.name || id2}`,
          tipo: 'buddy_punching',
          descripcion: `${emp1?.name || id1} y ${emp2?.name || id2} fichan juntos en menos de 2 minutos en ${count} días. Posible fichaje por tercero.`,
          nivel: 'alto',
          fecha: '',
        })
      }
    })

    // 4. Chronic lateness: employee consistently starts after 09:30
    const empStartTimes = {}
    records.forEach(r => {
      if (!r.inicio || !r.fin) return
      const d = new Date(r.inicio)
      const mins = d.getHours() * 60 + d.getMinutes()
      if (!empStartTimes[r.empId]) empStartTimes[r.empId] = []
      empStartTimes[r.empId].push(mins)
    })
    Object.entries(empStartTimes).forEach(([empId, times]) => {
      if (times.length < 5) return
      const lateCount = times.filter(m => m > 9 * 60 + 30).length
      const ratio = lateCount / times.length
      if (ratio >= 0.7) {
        const emp = employees.find(e => e.id === empId)
        const anomId = hashStr(`chronic_late_${empId}`)
        const avgMins = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        const h = Math.floor(avgMins / 60), m = avgMins % 60
        result.push({
          id: anomId,
          empId,
          empName: emp?.name || empId,
          tipo: 'chronic_lateness',
          descripcion: `Llega tarde (después de las 09:30) en el ${Math.round(ratio * 100)}% de los días. Hora media de entrada: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}.`,
          nivel: 'medio',
          fecha: '',
        })
      }
    })

    // 5. Ghost employee: 0 records in last 30 days and not on baja
    activeEmps.forEach(emp => {
      const recent = records.filter(r => r.empId === emp.id && r.inicio && new Date(r.inicio).getTime() >= thirtyDaysAgo)
      if (!recent.length) {
        const anomId = hashStr(`ghost_${emp.id}`)
        result.push({
          id: anomId,
          empId: emp.id,
          empName: emp.name,
          tipo: 'ghost_employee',
          descripcion: `Sin ningún fichaje registrado en los últimos 30 días. El empleado está activo pero no hay actividad reciente.`,
          nivel: 'medio',
          fecha: '',
        })
      }
    })

    return result.sort((a, b) => (NIVEL_ORDER[a.nivel] ?? 3) - (NIVEL_ORDER[b.nivel] ?? 3))
  }, [db.records, db.employees])

  const vistas = db.anomalias_vistas || []

  const markReviewed = (anomId) => {
    if (vistas.includes(anomId)) return
    const withAudit = auditLog(db, 'Anomalía revisada', anomId, who)
    saveDB({ anomalias_vistas: [...vistas, anomId], audit: withAudit.audit })
    toast('Marcada como revisada', 2500, 'ok')
  }

  const unmarkReviewed = (anomId) => {
    const withAudit = auditLog(db, 'Anomalía reabierta', anomId, who)
    saveDB({ anomalias_vistas: vistas.filter(id => id !== anomId), audit: withAudit.audit })
    toast('Reabierta', 2000)
  }

  const visible = anomalias.filter(a => {
    const reviewed = vistas.includes(a.id)
    if (!showReviewed && reviewed) return false
    if (filterNivel !== 'todos' && a.nivel !== filterNivel) return false
    if (filterTipo !== 'todos' && a.tipo !== filterTipo) return false
    return true
  })

  const totalAlto = anomalias.filter(a => a.nivel === 'alto' && !vistas.includes(a.id)).length
  const totalMedio = anomalias.filter(a => a.nivel === 'medio' && !vistas.includes(a.id)).length
  const totalBajo = anomalias.filter(a => a.nivel === 'bajo' && !vistas.includes(a.id)).length
  const totalPendiente = anomalias.filter(a => !vistas.includes(a.id)).length

  const allTipos = [...new Set(anomalias.map(a => a.tipo))]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Detección de Anomalías</h1>
          <div className="adm-panel-sub" style={{ marginTop: 2 }}>
            {totalPendiente} anomalías pendientes de revisión · análisis automático de fichajes
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total', value: anomalias.length, color: 'var(--text2)', bg: 'rgba(255,255,255,.04)' },
          { label: 'Alta', value: totalAlto, color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
          { label: 'Media', value: totalMedio, color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
          { label: 'Baja', value: totalBajo, color: '#6366f1', bg: 'rgba(99,102,241,.1)' },
          { label: 'Revisadas', value: vistas.length, color: '#22c55e', bg: 'rgba(34,197,94,.1)' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['todos', 'alto', 'medio', 'bajo'].map(n => (
            <button
              key={n}
              onClick={() => setFilterNivel(n)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: `1px solid ${filterNivel === n ? (NIVEL_COLORS[n] || 'var(--primary)') : 'rgba(255,255,255,.1)'}`,
                background: filterNivel === n ? (NIVEL_BG[n] || 'rgba(99,102,241,.15)') : 'transparent',
                color: filterNivel === n ? (NIVEL_COLORS[n] || 'var(--primary)') : 'var(--text3)',
                fontSize: 11,
                fontWeight: filterNivel === n ? 700 : 400,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {n.charAt(0).toUpperCase() + n.slice(1)}
            </button>
          ))}
        </div>
        {allTipos.length > 1 && (
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--text2)', fontSize: 11, fontFamily: 'inherit' }}
          >
            <option value="todos">Todos los tipos</option>
            {allTipos.map(t => <option key={t} value={t}>{TIPO_LABELS[t] || t}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)', cursor: 'pointer', marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={e => setShowReviewed(e.target.checked)}
            style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
          />
          Mostrar revisadas
        </label>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.length === 0 && (
          <div className="empty-premium">
            <div className="empty-premium-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="empty-premium-title">
              {anomalias.length === 0 ? 'Sin anomalías detectadas' : 'Todas las anomalías están revisadas'}
            </div>
            <div className="empty-premium-sub">
              {anomalias.length === 0
                ? 'Los patrones de fichaje se analizan automáticamente en cada carga'
                : 'Activa "Mostrar revisadas" para ver el historial completo'}
            </div>
          </div>
        )}

        {visible.map(a => {
          const reviewed = vistas.includes(a.id)
          return (
            <div
              key={a.id}
              style={{
                background: reviewed ? 'rgba(255,255,255,.02)' : NIVEL_BG[a.nivel],
                border: `1px solid ${reviewed ? 'rgba(255,255,255,.06)' : NIVEL_COLORS[a.nivel] + '44'}`,
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
                opacity: reviewed ? 0.6 : 1,
                transition: 'all .2s',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: reviewed ? 'rgba(255,255,255,.06)' : NIVEL_BG[a.nivel],
                border: `1px solid ${reviewed ? 'rgba(255,255,255,.1)' : NIVEL_COLORS[a.nivel] + '55'}`,
                fontSize: 16,
              }}>
                {a.nivel === 'alto' ? '🔴' : a.nivel === 'medio' ? '🟡' : '🔵'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{a.empName}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: NIVEL_BG[a.nivel], color: NIVEL_COLORS[a.nivel],
                    border: `1px solid ${NIVEL_COLORS[a.nivel]}44`,
                    textTransform: 'uppercase', letterSpacing: '.4px',
                  }}>
                    {a.nivel}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(255,255,255,.05)', color: 'var(--text3)',
                    border: '1px solid rgba(255,255,255,.08)',
                  }}>
                    {TIPO_LABELS[a.tipo] || a.tipo}
                  </span>
                  {a.fecha && <span style={{ fontSize: 10, color: 'var(--text4)' }}>{fds(a.fecha)}</span>}
                  {reviewed && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>✓ Revisada</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{a.descripcion}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {reviewed ? (
                  <button
                    onClick={() => unmarkReviewed(a.id)}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'var(--text4)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Reabrir
                  </button>
                ) : (
                  <button
                    onClick={() => markReviewed(a.id)}
                    style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.1)', color: '#22c55e', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ✓ Revisado
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {anomalias.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', fontSize: 11, color: 'var(--text4)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text3)' }}>Sobre este análisis:</strong> Las anomalías se calculan automáticamente a partir de los fichajes. Marcar una anomalía como revisada no borra el fichaje, solo la oculta del panel. Los algoritmos analizan fichajes cerrados automáticamente, jornadas superiores a 14h, patrones de fichaje simultáneo, retrasos crónicos y empleados sin actividad reciente.
        </div>
      )}
    </div>
  )
}
