import { useState, useEffect } from 'react'

const STORAGE_KEY = 'an_times_privacy_v1'

export function usePrivacyAccepted() {
  return (() => { try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return true } })()
}

export default function PrivacyModal() {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') setVisible(true)
    } catch { }
  }, [])

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,.7)',
      backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)',
      display:'flex', alignItems:'flex-end', justifyContent:'center'
    }}>
      <div style={{
        width:'100%', maxWidth:520,
        background:'var(--bg-700)', borderRadius:'20px 20px 0 0',
        border:'1px solid var(--border2)', boxShadow:'0 -12px 48px rgba(0,0,0,.6)',
        animation:'slideUp .3s cubic-bezier(.16,1,.3,1)',
        padding:'0 0 32px'
      }}>
        {/* Handle */}
        <div style={{ padding:'14px 20px 0', textAlign:'center' }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'var(--border3)', margin:'0 auto 16px' }}/>
        </div>

        {/* Header */}
        <div style={{ padding:'0 20px 12px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)' }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>Privacidad y datos</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>LOPD · RGPD · RDL 8/2019</div>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          onScroll={e => { if (e.target.scrollTop > 60) setScrolled(true) }}
          style={{ maxHeight:220, overflowY:'auto', padding:'14px 20px', fontSize:12.5, color:'var(--text3)', lineHeight:1.8, WebkitOverflowScrolling:'touch' }}>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color:'var(--text2)' }}>TIMES INC</strong> es un sistema de registro de jornada laboral
            desarrollado para el cumplimiento del <strong style={{ color:'var(--text2)' }}>Real Decreto-ley 8/2019</strong>
            {' '}que obliga a todas las empresas a registrar la jornada diaria de sus trabajadores.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color:'var(--text2)' }}>Datos que se recogen:</strong> nombre, fichajes de entrada/salida,
            ubicación GPS en el momento del fichaje (solo si la concedes), vacaciones y documentos firmados.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color:'var(--text2)' }}>Finalidad:</strong> cumplimiento de la obligación legal de registro
            de jornada y gestión laboral interna de la empresa.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color:'var(--text2)' }}>Almacenamiento:</strong> datos cifrados en servidores de Supabase
            (UE/GDPR). No se ceden a terceros.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color:'var(--text2)' }}>Derechos RGPD:</strong> puedes solicitar acceso, rectificación
            o supresión de tus datos contactando al administrador de tu empresa.
          </p>
          <p style={{ color:'var(--text4)', fontSize:11 }}>
            Al continuar aceptas el tratamiento de estos datos conforme a lo descrito.
            Versión de política: 1.0 · {new Date().getFullYear()}
          </p>
        </div>

        {/* Accept */}
        <div style={{ padding:'12px 20px 0' }}>
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:14 }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
              style={{ width:18, height:18, marginTop:1, flexShrink:0, accentColor:'var(--primary)', cursor:'pointer' }}/>
            <span style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
              He leído y acepto el tratamiento de mis datos personales según lo indicado.
            </span>
          </label>
          <button
            disabled={!checked}
            onClick={accept}
            style={{
              width:'100%', padding:'14px', borderRadius:12,
              background: checked ? 'var(--primary)' : 'var(--bg-500)',
              color: checked ? '#fff' : 'var(--text4)',
              border: checked ? 'none' : '1px solid var(--border)',
              fontWeight:700, fontSize:14, cursor: checked ? 'pointer' : 'not-allowed',
              fontFamily:'inherit', transition:'all .2s'
            }}>
            {checked ? 'Aceptar y continuar' : 'Marca la casilla para continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
