import { useState, useMemo } from 'react'
import { gid, today, fds } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'

const p2 = n => String(n).padStart(2, '0')

function isoDate(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function getMondayOf(d) {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  return dt
}

function addDays(d, n) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt
}

const TIPO_COLORS = {
  normal: '#6366f1',
  libre: '#22c55e',
  guardia: '#f59e0b',
}

const TIPO_BG = {
  normal: 'rgba(99,102,241,.18)',
  libre: 'rgba(34,197,94,.18)',
  guardia: 'rgba(245,158,11,.18)',
}

const TIPO_LABELS = {
  normal: 'Normal',
  libre: 'Libre',
  guardia: 'Guardia',
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function PanelTurnos({ db, toast, saveDB, session }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [modal, setModal] = useState(null) // { empId, fecha, turno|null }
  const [form, setForm] = useState({ horaInicio: '08:00', horaFin: '17:00', tipo: 'normal', centro: '', notas: '' })

  const who = session?.user?.name || 'Admin'

  const emps = useMemo(
    () => (db.employees || []).filter(e => !e.baja && !e.isAdmin).sort((a, b) => (a.name||'').localeCompare(b.name||'')),
    [db.employees]
  )

  const monday = useMemo(() => {
    const base = getMondayOf(new Date())
    return addDays(base, weekOffset * 7)
  }, [weekOffset])

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i))), [monday])

  const turnos = db.turnos || []

  const turnoMap = useMemo(() => {
    const m = {}
    turnos.forEach(t => {
      const key = `${t.empId}__${t.fecha}`
      m[key] = t
    })
    return m
  }, [turnos])

  const openModal = (empId, fecha) => {
    const existing = turnoMap[`${empId}__${fecha}`]
    setForm(
      existing
        ? { horaInicio: existing.horaInicio, horaFin: existing.horaFin, tipo: existing.tipo || 'normal', centro: existing.centro || '', notas: existing.notas || '' }
        : { horaInicio: '08:00', horaFin: '17:00', tipo: 'normal', centro: '', notas: '' }
    )
    setModal({ empId, fecha, existing: existing || null })
  }

  const saveTurno = () => {
    if (!form.horaInicio || !form.horaFin) { toast('Indica hora inicio y fin', 3000, 'err'); return }
    if (form.horaFin <= form.horaInicio && form.tipo !== 'libre') { toast('La hora de fin debe ser posterior al inicio', 3000, 'err'); return }
    const { empId, fecha, existing } = modal
    const emp = emps.find(e => e.id === empId)
    const newTurno = { id: existing?.id || gid(), empId, empName: emp?.name || '', fecha, horaInicio: form.horaInicio, horaFin: form.horaFin, tipo: form.tipo, centro: form.centro, notas: form.notas }
    let newTurnos
    if (existing) {
      newTurnos = turnos.map(t => t.id === existing.id ? newTurno : t)
    } else {
      newTurnos = [...turnos, newTurno]
    }
    const withAudit = auditLog(db, 'Turno guardado', `${emp?.name || empId} - ${fecha}`, who)
    saveDB({ turnos: newTurnos, audit: withAudit.audit })
    if (empId) {
      const tipoTxt = form.tipo === 'libre' ? 'Libre' : `${form.horaInicio}–${form.horaFin}`
      queuePush(empId, '📅 Turno publicado', `${who} te asignó un turno el ${fds(fecha)}: ${tipoTxt}${form.centro ? ' · ' + form.centro : ''}.`, 'turno', '/?tab=turnos')
    }
    setModal(null)
    toast('Turno guardado', 2500, 'ok')
  }

  const deleteTurno = () => {
    const { existing } = modal
    if (!existing) { setModal(null); return }
    const newTurnos = turnos.filter(t => t.id !== existing.id)
    const withAudit = auditLog(db, 'Turno eliminado', `${existing.empName} - ${existing.fecha}`, who)
    saveDB({ turnos: newTurnos, audit: withAudit.audit })
    if (existing.empId) queuePush(existing.empId, '📅 Turno eliminado', `${who} eliminó tu turno del ${fds(existing.fecha)}.`, 'turno', '/?tab=turnos')
    setModal(null)
    toast('Turno eliminado')
  }

  const copiarSemanaAnterior = () => {
    const prevWeekDates = Array.from({ length: 7 }, (_, i) => isoDate(addDays(addDays(monday, -7), i)))
    const prevTurnos = turnos.filter(t => prevWeekDates.includes(t.fecha))
    if (!prevTurnos.length) { toast('No hay turnos en la semana anterior', 3000, 'warn'); return }
    const newOnes = prevTurnos.map(t => {
      const dayIdx = prevWeekDates.indexOf(t.fecha)
      const newFecha = weekDates[dayIdx]
      const existing = turnoMap[`${t.empId}__${newFecha}`]
      if (existing) return null
      return { ...t, id: gid(), fecha: newFecha }
    }).filter(Boolean)
    if (!newOnes.length) { toast('Esta semana ya tiene turnos de la anterior', 3000, 'warn'); return }
    const withAudit = auditLog(db, 'Semana copiada', `${newOnes.length} turnos`, who)
    saveDB({ turnos: [...turnos, ...newOnes], audit: withAudit.audit })
    const empIdsAvisados = [...new Set(newOnes.map(t => t.empId).filter(Boolean))]
    empIdsAvisados.forEach(empId => {
      queuePush(empId, '📅 Cuadrante publicado', `${who} publicó tus turnos de la semana del ${fds(weekDates[0])}.`, 'turno', '/?tab=turnos')
    })
    toast(`${newOnes.length} turnos copiados`, 3000, 'ok')
  }

  // Total hours per day (only normal/guardia)
  const dayTotals = useMemo(() => {
    return weekDates.map(fecha => {
      let mins = 0
      turnos.forEach(t => {
        if (t.fecha !== fecha || t.tipo === 'libre') return
        const [h1, m1] = (t.horaInicio || '00:00').split(':').map(Number)
        const [h2, m2] = (t.horaFin || '00:00').split(':').map(Number)
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1)
        if (diff > 0) mins += diff
      })
      return mins
    })
  }, [turnos, weekDates])

  const weekLabel = useMemo(() => {
    const from = fds(weekDates[0])
    const to = fds(weekDates[6])
    return `${from} — ${to}`
  }, [weekDates])

  const centros = db.centrosTrabajo || []

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Planificación de Turnos</h1>
          <div className="adm-panel-sub" style={{ marginTop: 2 }}>{weekLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={copiarSemanaAnterior} title="Copiar turnos de la semana anterior a esta">
            ↙ Copiar sem. anterior
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setWeekOffset(o => o - 1)}>← Anterior</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setWeekOffset(0)} style={{ opacity: weekOffset === 0 ? 0.5 : 1 }}>Hoy</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setWeekOffset(o => o + 1)}>Siguiente →</button>
        <div style={{ flex: 1, textAlign: 'right', fontSize: 12, color: 'var(--text3)' }}>
          {emps.length} empleados activos · {turnos.filter(t => weekDates.includes(t.fecha)).length} turnos esta semana
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(TIPO_LABELS).map(([tipo, label]) => (
          <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: TIPO_COLORS[tipo] }} />
            <span style={{ color: 'var(--text3)' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--bg-500)', border: '1px dashed rgba(255,255,255,.15)' }} />
          <span style={{ color: 'var(--text3)' }}>Sin turno</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontWeight: 700, padding: '4px 8px', whiteSpace: 'nowrap', width: 140 }}>Empleado</th>
              {weekDates.map((fecha, i) => {
                const isToday = fecha === today()
                return (
                  <th key={fecha} style={{ textAlign: 'center', fontSize: 11, color: isToday ? 'var(--primary)' : 'var(--text3)', fontWeight: isToday ? 800 : 600, padding: '4px 4px', minWidth: 90 }}>
                    <div>{DAY_NAMES[i]}</div>
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 1 }}>{fecha.slice(5)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {emps.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text4)', fontSize: 13 }}>
                  No hay empleados activos
                </td>
              </tr>
            )}
            {emps.map(emp => (
              <tr key={emp.id}>
                <td style={{ padding: '3px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {emp.name}
                </td>
                {weekDates.map(fecha => {
                  const t = turnoMap[`${emp.id}__${fecha}`]
                  return (
                    <td key={fecha} style={{ padding: '3px 4px', textAlign: 'center' }}>
                      <button
                        onClick={() => openModal(emp.id, fecha)}
                        style={{
                          width: '100%',
                          minHeight: 52,
                          borderRadius: 8,
                          border: t ? `1px solid ${TIPO_COLORS[t.tipo || 'normal']}44` : '1px dashed rgba(255,255,255,.1)',
                          background: t ? TIPO_BG[t.tipo || 'normal'] : 'rgba(255,255,255,.02)',
                          cursor: 'pointer',
                          padding: '4px 2px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          transition: 'all .15s',
                        }}
                        title={t ? `${TIPO_LABELS[t.tipo || 'normal']} · ${t.horaInicio}–${t.horaFin}${t.notas ? ' · ' + t.notas : ''}` : 'Sin turno – clic para añadir'}
                      >
                        {t ? (
                          <>
                            <span style={{ fontSize: 10, fontWeight: 700, color: TIPO_COLORS[t.tipo || 'normal'] }}>
                              {TIPO_LABELS[t.tipo || 'normal']}
                            </span>
                            {t.tipo !== 'libre' && (
                              <span style={{ fontSize: 9, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
                                {t.horaInicio}–{t.horaFin}
                              </span>
                            )}
                            {t.centro && (
                              <span style={{ fontSize: 8, color: 'var(--text4)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.centro}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 16, color: 'rgba(255,255,255,.12)' }}>+</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* Totals row */}
            {emps.length > 0 && (
              <tr>
                <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Total horas</td>
                {dayTotals.map((mins, i) => (
                  <td key={weekDates[i]} style={{ textAlign: 'center', padding: '6px 4px' }}>
                    <span style={{ fontSize: 10, color: mins > 0 ? 'var(--text3)' : 'var(--text4)', fontVariantNumeric: 'tabular-nums' }}>
                      {mins > 0 ? `${Math.floor(mins / 60)}h${mins % 60 ? p2(mins % 60) + 'm' : ''}` : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {emps.length === 0 && (
        <div className="empty-premium">
          <div className="empty-premium-icon">
            <svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round"/></svg>
          </div>
          <div className="empty-premium-title">Sin empleados activos</div>
          <div className="empty-premium-sub">Los empleados activos aparecerán aquí para planificar sus turnos</div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div style={{ background: 'var(--bg-700)', borderRadius: 16, border: '1px solid rgba(255,255,255,.1)', padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {emps.find(e => e.id === modal.empId)?.name || modal.empId}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fds(modal.fecha)}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Tipo de turno</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(TIPO_LABELS).map(([tipo, label]) => (
                    <button
                      key={tipo}
                      onClick={() => setForm(f => ({ ...f, tipo }))}
                      style={{
                        flex: 1,
                        padding: '7px 4px',
                        borderRadius: 8,
                        border: `1px solid ${form.tipo === tipo ? TIPO_COLORS[tipo] : 'rgba(255,255,255,.1)'}`,
                        background: form.tipo === tipo ? TIPO_BG[tipo] : 'rgba(255,255,255,.03)',
                        color: form.tipo === tipo ? TIPO_COLORS[tipo] : 'var(--text3)',
                        fontSize: 11,
                        fontWeight: form.tipo === tipo ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {form.tipo !== 'libre' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Hora inicio</label>
                    <input
                      type="time"
                      value={form.horaInicio}
                      onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))}
                      style={{ width: '100%', background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '7px 10px', color: 'var(--text1)', fontSize: 13, fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Hora fin</label>
                    <input
                      type="time"
                      value={form.horaFin}
                      onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))}
                      style={{ width: '100%', background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '7px 10px', color: 'var(--text1)', fontSize: 13, fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              )}

              {centros.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Centro de trabajo</label>
                  <select
                    value={form.centro}
                    onChange={e => setForm(f => ({ ...f, centro: e.target.value }))}
                    style={{ width: '100%', background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '7px 10px', color: 'var(--text1)', fontSize: 13, fontFamily: 'inherit' }}
                  >
                    <option value="">Sin especificar</option>
                    {centros.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Ej: turno partido, formación…"
                  style={{ width: '100%', background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '7px 10px', color: 'var(--text1)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {modal.existing && (
                  <button
                    onClick={deleteTurno}
                    style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                )}
                <button
                  onClick={saveTurno}
                  style={{ flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {modal.existing ? 'Guardar cambios' : 'Añadir turno'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
