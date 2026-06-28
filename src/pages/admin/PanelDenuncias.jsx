import { useState, useMemo } from 'react'
import { gid, fds } from '../../utils/time.js'
import { auditLog } from '../../services/dataService.js'

const TIPO_LABELS = {
  acoso: 'Acoso',
  fraude: 'Fraude',
  seguridad: 'Seguridad',
  discriminacion: 'Discriminación',
  otro: 'Otro',
}

const TIPO_COLORS = {
  acoso: '#ef4444',
  fraude: '#f59e0b',
  seguridad: '#6366f1',
  discriminacion: '#ec4899',
  otro: '#64748b',
}

const ESTADO_COLORS = {
  nueva: '#ef4444',
  en_proceso: '#f59e0b',
  resuelta: '#22c55e',
}

const ESTADO_BG = {
  nueva: 'rgba(239,68,68,.13)',
  en_proceso: 'rgba(245,158,11,.13)',
  resuelta: 'rgba(34,197,94,.13)',
}

const ESTADO_LABELS = {
  nueva: 'Nueva',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
}

const PRIORIDAD_COLORS = {
  alta: '#ef4444',
  media: '#f59e0b',
  baja: '#6366f1',
}

export default function PanelDenuncias({ db, toast, saveDB, session }) {
  const [filterEstado, setFilterEstado] = useState('todos')
  const [filterTipo, setFilterTipo] = useState('todos')
  const [expandedId, setExpandedId] = useState(null)
  const [respuestas, setRespuestas] = useState({}) // id -> text being edited

  const who = session?.user?.name || 'Admin'
  const denuncias = useMemo(
    () => (db.denuncias || []).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')),
    [db.denuncias]
  )

  const filtered = useMemo(() => {
    return denuncias.filter(d => {
      if (filterEstado !== 'todos' && d.estado !== filterEstado) return false
      if (filterTipo !== 'todos' && d.tipo !== filterTipo) return false
      return true
    })
  }, [denuncias, filterEstado, filterTipo])

  const counts = useMemo(() => ({
    total: denuncias.length,
    nueva: denuncias.filter(d => d.estado === 'nueva').length,
    en_proceso: denuncias.filter(d => d.estado === 'en_proceso').length,
    resuelta: denuncias.filter(d => d.estado === 'resuelta').length,
  }), [denuncias])

  const updateDenuncia = (id, changes) => {
    const updated = denuncias.map(d => d.id === id ? { ...d, ...changes, updatedAt: new Date().toISOString(), updatedBy: who } : d)
    const d = denuncias.find(x => x.id === id)
    const withAudit = auditLog(db, 'Denuncia actualizada', `${d?.anonId || id}: ${Object.keys(changes).join(', ')}`, who)
    saveDB({ denuncias: updated, audit: withAudit.audit })
  }

  const saveRespuesta = (d) => {
    const texto = (respuestas[d.id] || '').trim()
    if (!texto) { toast('Escribe una respuesta', 3000, 'err'); return }
    updateDenuncia(d.id, { respuesta: texto, estado: d.estado === 'nueva' ? 'en_proceso' : d.estado })
    setRespuestas(prev => { const n = { ...prev }; delete n[d.id]; return n })
    toast('Respuesta guardada', 3000, 'ok')
  }

  const changeEstado = (id, estado) => {
    updateDenuncia(id, { estado })
    toast(`Estado cambiado a "${ESTADO_LABELS[estado]}"`, 2500, 'ok')
  }

  const allTipos = [...new Set(denuncias.map(d => d.tipo))]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Canal de Denuncias</h1>
          <div className="adm-panel-sub" style={{ marginTop: 2 }}>
            {counts.nueva} nuevas · {counts.total} total
          </div>
        </div>
      </div>

      {/* Legal notice */}
      <div style={{
        background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 12,
        padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 22, flexShrink: 0 }}>⚖️</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)', marginBottom: 4 }}>
            Canal obligatorio — Directiva UE 2019/1937
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            Este canal anónimo es obligatorio para empresas de más de 50 empleados según la Directiva (UE) 2019/1937 sobre protección de denunciantes, transpuesta al ordenamiento español. <strong style={{ color: 'var(--text2)' }}>El administrador no puede identificar al denunciante</strong> — solo se almacena un código anónimo que el empleado puede usar para hacer seguimiento. Las denuncias deben resolverse en un plazo máximo de 3 meses.
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total', value: counts.total, color: 'var(--text2)', bg: 'rgba(255,255,255,.04)' },
          { label: 'Nuevas', value: counts.nueva, color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
          { label: 'En proceso', value: counts.en_proceso, color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
          { label: 'Resueltas', value: counts.resuelta, color: '#22c55e', bg: 'rgba(34,197,94,.1)' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['todos', 'nueva', 'en_proceso', 'resuelta'].map(e => (
            <button
              key={e}
              onClick={() => setFilterEstado(e)}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, transition: 'all .15s',
                border: `1px solid ${filterEstado === e ? (ESTADO_COLORS[e] || 'var(--primary)') : 'rgba(255,255,255,.1)'}`,
                background: filterEstado === e ? (ESTADO_BG[e] || 'rgba(99,102,241,.15)') : 'transparent',
                color: filterEstado === e ? (ESTADO_COLORS[e] || 'var(--primary)') : 'var(--text3)',
                fontWeight: filterEstado === e ? 700 : 400,
              }}
            >
              {e === 'todos' ? 'Todos' : ESTADO_LABELS[e]}
            </button>
          ))}
        </div>
        {allTipos.length > 1 && (
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--text2)', fontSize: 11, fontFamily: 'inherit', marginLeft: 'auto' }}
          >
            <option value="todos">Todos los tipos</option>
            {allTipos.map(t => <option key={t} value={t}>{TIPO_LABELS[t] || t}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <div className="empty-premium">
            <div className="empty-premium-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div className="empty-premium-title">
              {denuncias.length === 0 ? 'Sin denuncias recibidas' : 'Sin denuncias con este filtro'}
            </div>
            <div className="empty-premium-sub">
              {denuncias.length === 0
                ? 'Los empleados pueden enviar denuncias anónimas desde la app'
                : 'Prueba a cambiar los filtros'}
            </div>
          </div>
        )}

        {filtered.map(d => {
          const isExpanded = expandedId === d.id
          const editingResp = respuestas[d.id] !== undefined
          return (
            <div
              key={d.id}
              style={{
                background: 'rgba(255,255,255,.03)',
                border: `1px solid ${isExpanded ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.07)'}`,
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'border-color .15s',
              }}
            >
              {/* Header */}
              <div
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}
                onClick={() => setExpandedId(isExpanded ? null : d.id)}
              >
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${TIPO_COLORS[d.tipo] || '#64748b'}22`,
                  border: `1px solid ${TIPO_COLORS[d.tipo] || '#64748b'}44`,
                  fontSize: 18,
                }}>
                  {d.tipo === 'acoso' ? '⚠️' : d.tipo === 'fraude' ? '💰' : d.tipo === 'seguridad' ? '🔒' : d.tipo === 'discriminacion' ? '🏳️' : '📋'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badges row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {/* AnonId */}
                    <span style={{
                      fontSize: 11, fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(255,255,255,.07)', color: 'var(--text2)', border: '1px solid rgba(255,255,255,.1)',
                      letterSpacing: '.5px',
                    }}>
                      #{d.anonId || '??????'}
                    </span>
                    {/* Tipo */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: `${TIPO_COLORS[d.tipo] || '#64748b'}22`,
                      color: TIPO_COLORS[d.tipo] || '#64748b',
                      border: `1px solid ${TIPO_COLORS[d.tipo] || '#64748b'}44`,
                    }}>
                      {TIPO_LABELS[d.tipo] || d.tipo}
                    </span>
                    {/* Estado */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: ESTADO_BG[d.estado] || 'rgba(255,255,255,.06)',
                      color: ESTADO_COLORS[d.estado] || 'var(--text3)',
                      border: `1px solid ${(ESTADO_COLORS[d.estado] || '#888') + '44'}`,
                    }}>
                      {ESTADO_LABELS[d.estado] || d.estado}
                    </span>
                    {/* Prioridad */}
                    {d.prioridad && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: `${PRIORIDAD_COLORS[d.prioridad] || '#888'}15`,
                        color: PRIORIDAD_COLORS[d.prioridad] || '#888',
                        border: `1px solid ${(PRIORIDAD_COLORS[d.prioridad] || '#888') + '33'}`,
                        textTransform: 'uppercase', letterSpacing: '.4px',
                      }}>
                        {d.prioridad}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text4)', marginLeft: 'auto' }}>{fds(d.ts)}</span>
                  </div>
                  {/* Mensaje preview */}
                  <div style={{
                    fontSize: 12, color: 'var(--text3)', lineHeight: 1.5,
                    overflow: isExpanded ? 'visible' : 'hidden',
                    display: isExpanded ? 'block' : '-webkit-box',
                    WebkitLineClamp: isExpanded ? 'unset' : 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {d.mensaje}
                  </div>
                  {d.respuesta && !isExpanded && (
                    <div style={{ fontSize: 10, color: '#22c55e', marginTop: 4, fontWeight: 600 }}>✓ Con respuesta del admin</div>
                  )}
                </div>

                <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--text4)', marginTop: 2 }}>
                  {isExpanded ? '▲' : '▼'}
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,.05)', marginTop: 0, paddingTop: 14 }}>

                  {/* Full message */}
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,.06)' }}>
                    {d.mensaje}
                  </div>

                  {/* Admin response */}
                  {d.respuesta && !editingResp && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                        ✓ Respuesta del administrador
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, padding: '10px 12px', background: 'rgba(34,197,94,.07)', borderRadius: 8, border: '1px solid rgba(34,197,94,.2)' }}>
                        {d.respuesta}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text4)' }}>
                        {d.updatedAt ? `Actualizado ${fds(d.updatedAt)}` : ''}
                        {d.updatedBy ? ` por ${d.updatedBy}` : ''}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRespuestas(prev => ({ ...prev, [d.id]: d.respuesta || '' })) }}
                        style={{ marginTop: 6, fontSize: 11, color: 'var(--text4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                      >
                        Editar respuesta
                      </button>
                    </div>
                  )}

                  {/* Response editor */}
                  {(!d.respuesta || editingResp) && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                        {d.respuesta ? 'Editar respuesta' : 'Añadir respuesta'}
                        <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text4)' }}>
                          (el denunciante la verá con su código #{d.anonId})
                        </span>
                      </div>
                      <textarea
                        value={respuestas[d.id] !== undefined ? respuestas[d.id] : (d.respuesta || '')}
                        onChange={e => setRespuestas(prev => ({ ...prev, [d.id]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        placeholder="Escribe aquí la respuesta para el denunciante…"
                        rows={3}
                        maxLength={1000}
                        style={{
                          width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 80,
                          background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8,
                          padding: '9px 12px', color: 'var(--text1)', fontSize: 12, fontFamily: 'inherit',
                          lineHeight: 1.5,
                        }}
                        onFocus={() => {
                          if (respuestas[d.id] === undefined) {
                            setRespuestas(prev => ({ ...prev, [d.id]: d.respuesta || '' }))
                          }
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                        {editingResp && (
                          <button
                            onClick={e => { e.stopPropagation(); setRespuestas(prev => { const n = { ...prev }; delete n[d.id]; return n }) }}
                            style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'var(--text3)', fontSize: 11, cursor: 'pointer' }}
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); saveRespuesta(d) }}
                          style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Guardar respuesta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Estado changer */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
                      Cambiar estado
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['nueva', 'en_proceso', 'resuelta'].map(estado => (
                        <button
                          key={estado}
                          onClick={e => { e.stopPropagation(); changeEstado(d.id, estado) }}
                          style={{
                            flex: 1, minWidth: 80, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: d.estado === estado ? 700 : 400, transition: 'all .15s',
                            border: `1px solid ${d.estado === estado ? ESTADO_COLORS[estado] : 'rgba(255,255,255,.1)'}`,
                            background: d.estado === estado ? ESTADO_BG[estado] : 'transparent',
                            color: d.estado === estado ? ESTADO_COLORS[estado] : 'var(--text3)',
                          }}
                        >
                          {ESTADO_LABELS[estado]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Privacy notice */}
                  <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(99,102,241,.07)', borderRadius: 8, border: '1px solid rgba(99,102,241,.15)', fontSize: 10, color: 'var(--text4)', lineHeight: 1.5 }}>
                    🔒 <strong style={{ color: 'var(--text3)' }}>Canal anónimo:</strong> No hay datos de identidad asociados a esta denuncia. El denunciante puede consultar el estado y esta respuesta usando el código <strong style={{ color: 'var(--text2)', fontFamily: 'monospace' }}>#{d.anonId}</strong>.
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {denuncias.length > 0 && (
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,.05)', fontSize: 11, color: 'var(--text4)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text3)' }}>Marco legal:</strong> Directiva (UE) 2019/1937 — obligatoria para empresas con 50+ empleados. Plazo máximo de acuse de recibo: 7 días. Plazo máximo de resolución: 3 meses. Las denuncias deben conservarse durante el tiempo necesario para la investigación respetando el RGPD.
        </div>
      )}
    </div>
  )
}
