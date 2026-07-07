import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../../store/appStore.js'
import { gid, today } from '../../utils/time.js'
import { auditLog } from '../../services/dataService.js'
import { encodeCentroQR } from '../../utils/qr.js'

export default function PanelObras({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const [tab, setTab] = useState('obras')
  const [newObra, setNewObra] = useState('')
  const [newCentro, setNewCentro] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [expandedObra, setExpandedObra] = useState(null)
  const [geoCapturing, setGeoCapturing] = useState(null)
  const [qrCentro, setQrCentro] = useState(null)
  const qrCanvasRef = useRef(null)

  useEffect(() => {
    if (!qrCentro || !qrCanvasRef.current) return
    QRCode.toCanvas(qrCanvasRef.current, encodeCentroQR(qrCentro), { width: 240, margin: 2, color: { dark: '#0d0d18', light: '#ffffff' } }).catch(() => {})
  }, [qrCentro])

  const obras = db.obras || []
  const centros = db.centrosTrabajo || []
  const who = session?.user?.name || 'Admin'

  const addObra = () => {
    const n = newObra.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (obras.find(o => o.nombre === n)) { toast('Ya existe'); return }
    const obra = { id: gid(), nombre: n, direccion:'', estado:'activa', createdAt: today() }
    const withAudit = auditLog(db, 'Obra creada', n, who)
    saveDB({ obras: [...obras, obra], audit: withAudit.audit })
    setNewObra('')
    toast('Obra creada', 3000, 'ok')
  }

  const delObra = (id) => {
    showConfirm('¿Eliminar esta obra?', () => {
      const o = obras.find(x => x.id === id)
      const withAudit = auditLog(db, 'Obra eliminada', o?.nombre || '', who)
      saveDB({ obras: obras.filter(o => o.id !== id), audit: withAudit.audit })
      toast('Obra eliminada')
      if (expandedObra === id) setExpandedObra(null)
    })
  }

  const captureGeo = (obraId) => {
    if (!navigator.geolocation) { toast('GPS no disponible'); return }
    setGeoCapturing(obraId)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoCapturing(null)
        const coords = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), acc: Math.round(pos.coords.accuracy) }
        const updated = obras.map(o => o.id === obraId ? { ...o, coords } : o)
        const withAudit = auditLog(db, 'Geofence configurado', obras.find(o => o.id === obraId)?.nombre || '', who)
        saveDB({ obras: updated, audit: withAudit.audit })
        toast('📍 Ubicación GPS guardada', 3000, 'ok')
      },
      () => { setGeoCapturing(null); toast('No se pudo obtener GPS', 3000, 'err') },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const setRadio = (obraId, radio) => {
    const updated = obras.map(o => o.id === obraId ? { ...o, radio: Number(radio) } : o)
    saveDB({ obras: updated })
  }

  const setGpsRequired = (obraId, required) => {
    const updated = obras.map(o => o.id === obraId ? { ...o, gpsRequired: required } : o)
    saveDB({ obras: updated })
  }

  const clearGeo = (obraId) => {
    showConfirm('¿Quitar la geovalla de esta obra?', () => {
      const updated = obras.map(o => o.id === obraId ? { ...o, coords: undefined, radio: undefined } : o)
      saveDB({ obras: updated })
      toast('Geovalla eliminada')
    })
  }

  const addCentro = () => {
    const n = newCentro.trim()
    if (!n) { toast('Escribe un nombre'); return }
    if (centros.includes(n)) { toast('Ya existe'); return }
    const withAudit = auditLog(db, 'Centro de trabajo añadido', n, who)
    saveDB({ centrosTrabajo: [...centros, n], audit: withAudit.audit })
    setNewCentro('')
    toast('Centro añadido', 3000, 'ok')
  }

  const delCentro = (c) => {
    showConfirm(`¿Eliminar "${c}"?`, () => {
      const withAudit = auditLog(db, 'Centro de trabajo eliminado', c, who)
      saveDB({ centrosTrabajo: centros.filter(x => x !== c), audit: withAudit.audit })
      toast('Centro eliminado')
    })
  }

  const TABS = [{ id:'obras', label:'Obras' }, { id:'centros', label:'Centros de trabajo' }]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title gradient-text">{tab === 'obras' ? 'Obras' : 'Centros de trabajo'}</h1>
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`pill-tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Obras */}
      {tab === 'obras' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input style={{ flex:1 }} placeholder="Nombre de la obra…" value={newObra} onChange={e => setNewObra(e.target.value)} onKeyDown={e => e.key==='Enter'&&addObra()} />
            <button className="btn btn-primary" onClick={addObra}>+ Crear</button>
          </div>
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!obras.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="empty-premium-title">Sin obras creadas</div>
                <div className="empty-premium-sub">Crea tu primera obra para organizar los fichajes por proyecto</div>
              </div>
            )}
            {obras.map(o => (
              <div key={o.id} className="card-lift" style={{ background:'var(--bg-700)', borderRadius:'var(--r-lg)', border:`1px solid ${expandedObra===o.id ? 'var(--border2)' : 'var(--border)'}`, padding:'14px 16px', transition:'border-color .15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'var(--primary-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{o.nombre}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:'var(--text3)' }}>{(db.records||[]).filter(r=>r.centro===o.nombre&&r.fin).length} fichajes · {o.createdAt}</span>
                      <span className={`geo-badge ${o.coords ? 'active' : 'none'}`}>
                        {o.coords ? `📍 ${o.radio||200}m` : '📍 Sin geovalla'}
                      </span>
                    </div>
                  </div>
                  <span className={`badge ${o.estado==='activa'?'badge-green':'badge-gray'}`}>{o.estado}</span>
                  <button
                    className={`btn btn-sm ${expandedObra===o.id ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setExpandedObra(expandedObra===o.id ? null : o.id)}
                    title="Configurar geovalla"
                    style={{ fontSize:13, padding:'4px 10px' }}
                  >⚙️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => delObra(o.id)}>✕</button>
                </div>

                {expandedObra === o.id && (
                  <div className="obra-geo-panel">
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:'var(--text3)', marginBottom:2 }}>Geovalla GPS</div>
                    {o.coords ? (
                      <div className="obra-geo-coords">
                        <span>📍 {o.coords.lat}, {o.coords.lng} · ±{o.coords.acc||'?'}m</span>
                        <a href={`https://www.openstreetmap.org/?mlat=${o.coords.lat}&mlon=${o.coords.lng}&zoom=17`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--primary-light)', fontSize:11, textDecoration:'none' }}>Ver mapa ↗</a>
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--text4)', padding:'8px 12px', background:'var(--bg-800)', borderRadius:8, border:'1px solid var(--border)' }}>
                        Sin ubicación GPS. Pulsa "Fijar GPS" estando en la obra.
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Radio:</span>
                        <select
                          value={o.radio || 200}
                          onChange={e => setRadio(o.id, e.target.value)}
                          style={{ fontSize:12, padding:'4px 8px', borderRadius:6, width:'auto' }}
                        >
                          <option value={50}>50 m</option>
                          <option value={100}>100 m</option>
                          <option value={200}>200 m</option>
                          <option value={300}>300 m</option>
                          <option value={500}>500 m</option>
                          <option value={1000}>1 km</option>
                        </select>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => captureGeo(o.id)}
                        disabled={geoCapturing === o.id}
                        style={{ flex:1 }}
                      >
                        {geoCapturing === o.id ? '⌛ Obteniendo GPS…' : '📍 Fijar GPS aquí'}
                      </button>
                      {o.coords && (
                        <button className="btn btn-sm btn-danger" onClick={() => clearGeo(o.id)}>Quitar</button>
                      )}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 0' }}>
                      <input
                        type="checkbox"
                        checked={o.gpsRequired || false}
                        onChange={e => setGpsRequired(o.id, e.target.checked)}
                        style={{ width:15, height:15, accentColor:'var(--primary)', cursor:'pointer' }}
                      />
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>GPS obligatorio para fichar</span>
                      {o.gpsRequired && <span style={{ fontSize:10, fontWeight:700, color:'var(--red)', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10, padding:'1px 6px' }}>ACTIVO</span>}
                    </label>
                    <div style={{ fontSize:10, color:'var(--text4)', lineHeight:1.5 }}>
                      {o.gpsRequired
                        ? 'Los empleados no podrán fichar sin ubicación GPS activa.'
                        : 'Si el empleado ficha fuera del radio definido, recibirá un aviso de ubicación.'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Centros */}
      {tab === 'centros' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input style={{ flex:1 }} placeholder="Nombre del centro de trabajo…" value={newCentro} onChange={e => setNewCentro(e.target.value)} onKeyDown={e => e.key==='Enter'&&addCentro()} />
            <button className="btn btn-primary" onClick={addCentro}>+ Añadir</button>
          </div>
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!centros.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                <div className="empty-premium-title">Sin centros de trabajo</div>
                <div className="empty-premium-sub">Añade centros de trabajo para asignarlos a empleados</div>
              </div>
            )}
            {centros.map(c => (
              <div key={c} className="card-lift" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', borderRadius:'var(--r-lg)', border:'1px solid var(--border)' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(0,212,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{c}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                    {(db.records||[]).filter(r=>r.centro===c&&r.fin).length} fichajes registrados
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setQrCentro(c)}>QR</button>
                <button className="btn btn-sm btn-danger" onClick={() => delCentro(c)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {qrCentro && (
        <div className="modal-ov" onClick={() => setQrCentro(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>QR de fichaje</h2>
              <button onClick={() => setQrCentro(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{qrCentro}</div>
            <canvas ref={qrCanvasRef} style={{ borderRadius: 'var(--r)', background: '#fff', padding: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14 }}>
              Imprime este código y colócalo en el centro de trabajo. Los empleados lo escanean desde "Fichar con QR" para marcar entrada y salida.
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => window.print()}>Imprimir</button>
          </div>
        </div>
      )}
    </div>
  )
}
