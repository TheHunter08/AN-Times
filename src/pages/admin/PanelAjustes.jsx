import { useState, useEffect, useMemo, useRef } from 'react'
import { auditLog } from '../../services/dataService.js'
import { resizeImageToDataUrl } from '../../utils/imageResize.js'

const COLOR_PRESETS = ['#6C63FF','#3B5BFF','#7c3aed','#0891b2','#059669','#dc2626','#d97706','#db2777']

function TimeList({ label, desc, times, onChange }) {
  const add    = ()    => onChange([...times, '09:00'])
  const remove = i     => onChange(times.filter((_, idx) => idx !== i))
  const update = (i,v) => onChange(times.map((t, idx) => idx === i ? v : t))
  return (
    <div>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8 }}>{label}</div>
      {desc && <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, opacity:.7 }}>{desc}</div>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        {times.map((t, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg-500)', borderRadius:10, padding:'6px 10px', border:'1px solid var(--border)' }}>
            <input type="time" value={t} onChange={e => update(i, e.target.value)}
              style={{ background:'none', border:'none', color:'var(--text)', fontSize:14, fontWeight:700, cursor:'pointer', outline:'none', width:80 }} />
            {times.length > 1 &&
              <button onClick={() => remove(i)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}>✕</button>
            }
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={add} style={{ fontSize:12 }}>+ Hora</button>
      </div>
    </div>
  )
}

function PanelAjustes({ db, toast, saveDB, session }) {
  const cfg = db.config || {}
  const [primaryColor, setPrimaryColor] = useState(cfg.primaryColor || '#6C63FF')
  const [companyName,  setCompanyName]  = useState(cfg.companyName  || db.empresas?.[0] || '')
  const [companyCif,   setCompanyCif]   = useState(cfg.companyCif || '')
  const [logoUploading, setLogoUploading] = useState(false)
  const [wdHoras, setWdHoras] = useState(cfg.wdMin ? String(Math.round(cfg.wdMin / 60 * 100) / 100) : '8')
  const [wkHoras, setWkHoras] = useState(cfg.wkMin ? String(Math.round(cfg.wkMin / 60 * 100) / 100) : '40')
  const [festivosExtra, setFestivosExtra] = useState(cfg.festivosExtra || {})
  const [usarFestivosMadrid, setUsarFestivosMadrid] = useState(cfg.usarFestivosMadrid !== false)
  const [newFestivoFecha, setNewFestivoFecha] = useState('')
  const [newFestivoNombre, setNewFestivoNombre] = useState('')
  const [reminders, setReminders] = useState({
    entrada:   cfg.reminders?.entrada?.length ? cfg.reminders.entrada : ['08:30'],
    salida:    cfg.reminders?.salida?.length  ? cfg.reminders.salida  : ['20:00'],
    semanal:   cfg.reminders?.semanal?.length ? cfg.reminders.semanal : ['17:00'],
    alertHoras: cfg.reminders?.alertHoras ?? 10,
  })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const backupRef = useRef(null)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `an-times-backup-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast('Backup descargado', 3000, 'ok')
  }

  const importBackup = e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.employees || !parsed.records) throw new Error('Formato inválido')
        saveDB(parsed)
        toast('Backup restaurado correctamente', 4000, 'ok')
      } catch {
        toast('Error: archivo no válido o corrupto', 4000, 'warn')
      }
    }
    reader.readAsText(file)
  }

  // Live preview: apply color as you change it
  useEffect(() => {
    document.documentElement.style.setProperty('--primary', primaryColor)
    document.documentElement.style.setProperty('--primary-glow', primaryColor + '30')
    document.documentElement.style.setProperty('--primary-dim', primaryColor + '22')
  }, [primaryColor])

  const save = () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    const wdMin = Math.round(parseFloat(wdHoras || '8') * 60) || 480
    const wkMin = Math.round(parseFloat(wkHoras || '40') * 60) || 2400
    const config = { ...cfg, primaryColor, companyName, companyCif: companyCif.trim().toUpperCase(), wdMin, wkMin, festivosExtra, usarFestivosMadrid, reminders }
    const withAudit = auditLog(db, 'Configuración guardada', companyName || 'Ajustes', session?.user?.name || 'Admin')
    saveDB({ config, audit: withAudit.audit })
    toast('Ajustes guardados', 3000, 'ok')
    setSaving(false)
    setTimeout(() => { savingRef.current = false }, 600)
  }

  const reset = () => {
    setPrimaryColor('#6C63FF')
    const config = { ...cfg, primaryColor: '', companyName }
    saveDB({ config })
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--primary-glow')
    document.documentElement.style.removeProperty('--primary-dim')
    toast('Color restablecido', 2000, 'ok')
  }

  // El logo se guarda al momento (no espera al botón "Guardar ajustes"): es una
  // operación de archivo, y perderla si el admin navega antes de guardar sería
  // una mala sorpresa.
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoUploading(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256, 0.88)
      saveDB({ config: { ...(db.config || {}), companyLogo: dataUrl } })
      toast('Logo actualizado', 2500, 'ok')
    } catch (err) {
      toast('No se pudo procesar la imagen: ' + (err?.message || err), 4000, 'err')
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = () => {
    const config = { ...(db.config || {}) }
    delete config.companyLogo
    saveDB({ config })
    toast('Logo eliminado', 2000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Ajustes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>Personalización de la aplicación</div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🏗️ Obras</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:60, height:60, borderRadius:14, background:'var(--bg-600)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
              {db.config?.companyLogo
                ? <img src={db.config.companyLogo} alt="Logo empresa" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                : <span style={{ fontSize:22, opacity:.35 }}>🏢</span>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Logo de la empresa</div>
              <div style={{ display:'flex', gap:8 }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer' }}>
                  {logoUploading ? 'Procesando…' : (db.config?.companyLogo ? 'Cambiar' : 'Subir logo')}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} style={{ display:'none' }} />
                </label>
                {db.config?.companyLogo && (
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={removeLogo}>Quitar</button>
                )}
              </div>
              <div style={{ fontSize:10, color:'var(--text4)', marginTop:5 }}>Aparece en la pantalla de acceso y en el menú. Se ajusta automáticamente.</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:2 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Nombre visible en la app</div>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={db.empresas?.[0] || 'Nombre de obra'}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>CIF empresa</div>
              <input value={companyCif} maxLength={12} onChange={e => setCompanyCif(e.target.value.toUpperCase())} placeholder="B12345678"
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Jornada diaria (horas)</div>
              <input type="number" min="1" max="24" step="0.5" value={wdHoras} onChange={e => setWdHoras(e.target.value)}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Jornada semanal (horas)</div>
              <input type="number" min="1" max="60" step="0.5" value={wkHoras} onChange={e => setWkHoras(e.target.value)}
                style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:14, boxSizing:'border-box' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">📅 Festivos personalizados</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'var(--text3)' }}>Festivos base de la Comunidad de Madrid</div>
          <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:12 }}>
            <input type="checkbox" checked={usarFestivosMadrid} onChange={e => setUsarFestivosMadrid(e.target.checked)}
              style={{ accentColor:'var(--primary)', width:15, height:15 }} />
            Incluir festivos Madrid
          </label>
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10 }}>Añade festivos propios de tu empresa o comunidad autónoma.</div>
        {Object.entries(festivosExtra).sort(([a],[b]) => a.localeCompare(b)).map(([fecha, nombre]) => (
          <div key={fecha} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', flex:1 }}>{fecha}</div>
            <div style={{ fontSize:12, color:'var(--text3)', flex:2 }}>{nombre}</div>
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)', padding:'2px 8px' }}
              onClick={() => { const f = { ...festivosExtra }; delete f[fecha]; setFestivosExtra(f) }}>✕</button>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          <input type="date" value={newFestivoFecha} onChange={e => setNewFestivoFecha(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'7px 10px', fontSize:12 }} />
          <input value={newFestivoNombre} onChange={e => setNewFestivoNombre(e.target.value)} placeholder="Nombre del festivo"
            style={{ flex:1, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'7px 10px', fontSize:12 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (!newFestivoFecha || !newFestivoNombre.trim()) return
            setFestivosExtra(prev => ({ ...prev, [newFestivoFecha]: newFestivoNombre.trim() }))
            setNewFestivoFecha(''); setNewFestivoNombre('')
          }}>Añadir</button>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🎨 Color principal</div>
          <button className="btn btn-secondary btn-sm" onClick={reset} style={{ fontSize:11 }}>Restablecer</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:4 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
              style={{ width:48, height:48, borderRadius:10, border:'2px solid var(--border)', cursor:'pointer', padding:2, background:'none', flexShrink:0 }} />
            <input value={primaryColor} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setPrimaryColor(e.target.value) }}
              style={{ flex:1, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'10px 14px', fontSize:13, fontFamily:'monospace' }} />
            <div style={{ width:48, height:48, borderRadius:10, background: primaryColor, flexShrink:0, border:'1px solid var(--border)' }} />
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {COLOR_PRESETS.map(c => (
              <div key={c} onClick={() => setPrimaryColor(c)}
                style={{ width:32, height:32, borderRadius:9, background:c, cursor:'pointer',
                  border: c.toLowerCase() === primaryColor.toLowerCase() ? '3px solid white' : '2px solid transparent',
                  transition:'transform .15s, box-shadow .15s',
                  boxShadow: c.toLowerCase() === primaryColor.toLowerCase() ? `0 0 10px ${c}` : 'none' }}
                onMouseEnter={e => { e.currentTarget.style.transform='scale(1.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='' }} />
            ))}
          </div>

          <div style={{ padding:'12px 14px', background:'var(--bg-500)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, fontWeight:700, textTransform:'uppercase', letterSpacing:.5 }}>Vista previa</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-primary btn-sm">Botón primario</button>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', borderRadius:20, fontSize:11, fontWeight:700, color:'var(--primary-light)' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--primary)' }} />
                Chip
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-widget card-lift" style={{ marginBottom:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">🔔 Recordatorios automáticos</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:18, marginTop:4 }}>
          <TimeList
            label="Recordatorio de entrada"
            desc="Se envía si el empleado no ha fichado aún a esa hora (L–V)"
            times={reminders.entrada}
            onChange={v => setReminders(r => ({ ...r, entrada: v }))}
          />
          <TimeList
            label="Recordatorio de salida olvidada"
            desc="Se envía si el empleado tiene la jornada abierta a esa hora"
            times={reminders.salida}
            onChange={v => setReminders(r => ({ ...r, salida: v }))}
          />
          <TimeList
            label="Resumen semanal (viernes)"
            desc="Envía el resumen de horas de la semana cada viernes a esa hora"
            times={reminders.semanal}
            onChange={v => setReminders(r => ({ ...r, semanal: v }))}
          />
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, textTransform:'uppercase', letterSpacing:.8 }}>Alerta jornada muy larga</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, opacity:.7 }}>Avisa al admin si un empleado lleva más de X horas con la jornada abierta</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <input type="number" min="1" max="24" step="0.5"
                value={reminders.alertHoras}
                onChange={e => setReminders(r => ({ ...r, alertHoras: parseFloat(e.target.value) || 10 }))}
                style={{ width:80, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-500)', color:'var(--text)', padding:'6px 12px', fontSize:14, fontWeight:700 }} />
              <span style={{ fontSize:13, color:'var(--text2)' }}>horas</span>
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={save} style={{ width:'100%', padding:'14px' }}>
        {saving ? 'Guardando…' : '✓ Guardar ajustes'}
      </button>

      <div className="dash-widget card-lift" style={{ marginTop:20 }}>
        <div className="dash-widget-header">
          <div className="dash-widget-title">💾 Backup y restauración</div>
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:14 }}>
          Exporta todos los datos en formato JSON para hacer una copia de seguridad o migrar a otro entorno. Importar sobreescribe todos los datos actuales.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn btn-secondary" onClick={exportBackup} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar backup (JSON)
          </button>
          <button className="btn btn-secondary" onClick={() => backupRef.current?.click()} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar backup
          </button>
          <input ref={backupRef} type="file" accept=".json" style={{ display:'none' }} onChange={importBackup} />
        </div>
        <div style={{ fontSize:11, color:'var(--red)', marginTop:10, fontWeight:600 }}>
          ⚠ Importar reemplaza todos los datos actuales sin posibilidad de deshacer.
        </div>
      </div>
    </div>
  )
}

// ─── BUSCADOR GLOBAL ──────────────────────────────────────────────────────────
function SearchModal({ db, open, q, setQ, onClose, onNav }) {
  const inputRef = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  useModalBack(open, onClose)

  const results = useMemo(() => {
    if (!q || q.length < 1) return []
    const lq = q.toLowerCase()
    const emps = (db.employees || []).filter(e => !e.baja && e.name.toLowerCase().includes(lq)).slice(0, 4)
      .map(e => ({ type:'emp', label:e.name, sub:e.role==='encargado'?'Encargado':e.role==='jefe_obra'?'Jefe de Obra':'Empleado', panel:'empleados', color:e.color }))
    const recs = (db.records || []).filter(r => r.fin && (r.empName?.toLowerCase().includes(lq) || r.centro?.toLowerCase().includes(lq))).slice(0, 4)
      .map(r => ({ type:'rec', label:r.empName, sub:(r.centro||'')+ ' · '+(r.inicio?.slice(0,10)||''), panel:'fichajes' }))
    const obras = (db.obras || []).filter(o => o.nombre?.toLowerCase().includes(lq)).slice(0, 3)
      .map(o => ({ type:'obra', label:o.nombre, sub:o.estado||'activa', panel:'obras' }))
    const centros = (db.centrosTrabajo || []).filter(c => c.toLowerCase().includes(lq)).slice(0, 2)
      .map(c => ({ type:'centro', label:c, sub:'Centro de trabajo', panel:'obras' }))
    return [...emps, ...recs, ...obras, ...centros]
  }, [q, db])

  if (!open) return null
  return (
    <div className="modal-ov center" onClick={onClose} style={{ zIndex:1200 }}>
      <div className="modal center-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth:520, width:'calc(100% - 24px)', padding:0, overflow:'hidden' }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text4)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar empleados, fichajes, obras…"
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:15, color:'var(--text)', fontFamily:'inherit' }} />
          <kbd style={{ fontSize:10, padding:'2px 7px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:5, color:'var(--text4)', fontFamily:'monospace', flexShrink:0 }}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight:380, overflowY:'auto' }}>
          {!q && (
            <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--text4)', fontSize:13 }}>
              Escribe para buscar empleados, fichajes y obras
              <div style={{ marginTop:8, fontSize:11 }}>Atajo: <kbd style={{ padding:'2px 6px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:4, fontFamily:'monospace' }}>⌘K</kbd> · <kbd style={{ padding:'2px 6px', background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:4, fontFamily:'monospace' }}>Ctrl+K</kbd></div>
            </div>
          )}
          {q && !results.length && (
            <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--text4)', fontSize:13 }}>Sin resultados para "{q}"</div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => onNav(r.panel)} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', cursor:'pointer', transition:'background .1s', borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-600)'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <div style={{ width:34, height:34, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:r.type==='emp'?13:16, fontWeight:700, color:'#fff',
                background: r.type==='emp'?(r.color||'var(--primary)'):r.type==='rec'?'var(--primary-dim)':r.type==='obra'?'rgba(0,212,255,.1)':'var(--green-dim)' }}>
                {r.type==='emp' ? (r.label||'?').slice(0,2).toUpperCase() : r.type==='rec' ? '⏱' : r.type==='obra' ? '🏗' : '📍'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{r.sub}</div>
              </div>
              <div style={{ fontSize:10, color:'var(--text4)', fontWeight:700, letterSpacing:'.8px', textTransform:'uppercase', flexShrink:0 }}>{r.panel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

