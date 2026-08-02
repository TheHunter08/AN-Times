import { useState, useEffect } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y.js'

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)', dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)', glow: 'rgba(53,104,255,.25)' },
  text: { 900: 'var(--text-primary)', 700: 'var(--text-secondary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
}
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)' }

const STORAGE_KEY = 'an_times_privacy_v1'

export function usePrivacyAccepted() {
  return (() => { try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return true } })()
}

export default function PrivacyModal() {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  // El aviso es obligatorio antes de continuar. Sin callback de cierre,
  // Escape no lo omite, pero el hook sí aplica foco inicial y focus trap.
  const dialogRef = useDialogA11y(visible)

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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        aria-describedby="privacy-description"
        tabIndex={-1}
        style={{
          width:'100%', maxWidth:520,
          background: colors.bg[600], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`,
          border:`1px solid ${colors.border.default}`, boxShadow:'0 -12px 48px rgba(0,0,0,.6)',
          animation:'slideUp .3s cubic-bezier(.16,1,.3,1)',
          padding:'0 0 32px'
        }}>
        <div style={{ padding:'14px 20px 0', textAlign:'center' }}>
          <div style={{ width:36, height:4, borderRadius:2, background: colors.border.default, margin:'0 auto 16px' }}/>
        </div>

        <div style={{ padding:'0 20px 12px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${colors.border.subtle}` }}>
          <div style={{ width:40, height:40, borderRadius: radius.md, background: colors.primary.dim, border:`1px solid ${colors.primary.glow}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={colors.primary.light} strokeWidth="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div id="privacy-title" style={{ fontSize:15, fontWeight:800, color: colors.text[900] }}>Privacidad y datos</div>
            <div style={{ fontSize:12, color: colors.text[500] }}>LOPDGDD · RGPD · RDL 8/2019</div>
          </div>
        </div>

        <div
          id="privacy-description"
          style={{ maxHeight:220, overflowY:'auto', padding:'14px 20px', fontSize:12.5, color: colors.text[500], lineHeight:1.8, WebkitOverflowScrolling:'touch' }}>
          <p style={{ marginBottom:10 }}>
            Tu empresa es la responsable del tratamiento y utiliza <strong style={{ color: colors.text[700] }}>TIMES INC</strong>
            {' '}para registrar la jornada y gestionar la relación laboral. Puedes pedir sus datos de contacto al administrador.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color: colors.text[700] }}>Datos que se recogen:</strong> nombre, fichajes de entrada/salida,
            pausas, centro de trabajo, vacaciones, gastos y documentos firmados. Si autorizas la ubicación, la app puede
            consultarla mientras la pantalla de empleado está abierta para mostrar avisos de geovalla. No se guarda un recorrido;
            sí pueden guardarse las coordenadas de entrada y salida asociadas al fichaje.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color: colors.text[700] }}>Finalidad y base jurídica:</strong> cumplimiento de la obligación legal
            de registro de jornada y gestión de la relación laboral. Este aviso informa del tratamiento; no convierte en
            consentimiento lo que se base en una obligación legal.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color: colors.text[700] }}>Conservación y proveedores:</strong> los registros de jornada se conservan
            durante al menos cuatro años. La empresa usa proveedores técnicos, incluido Supabase, para prestar el servicio.
            Si se muestra la meteorología, se envía una ubicación aproximada a Open-Meteo y se conserva solo durante la sesión.
          </p>
          <p style={{ marginBottom:10 }}>
            <strong style={{ color: colors.text[700] }}>Tus derechos:</strong> puedes solicitar acceso, rectificación, supresión,
            limitación u oposición cuando corresponda, contactando con tu empresa. También puedes reclamar ante la AEPD.
          </p>
          <p style={{ color: colors.text[300], fontSize:11 }}>
            Al continuar confirmas que has recibido y leído esta información.
            Versión del aviso: 1.1 · {new Date().getFullYear()}
          </p>
        </div>

        <div style={{ padding:'12px 20px 0' }}>
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:14 }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              aria-describedby="privacy-description"
              style={{ width:18, height:18, marginTop:1, flexShrink:0, accentColor: colors.primary.base, cursor:'pointer' }}/>
            <span style={{ fontSize:13, color: colors.text[700], lineHeight:1.5 }}>
              He leído la información sobre privacidad y el uso de la ubicación.
            </span>
          </label>
          <button
            disabled={!checked}
            onClick={accept}
            style={{
              width:'100%', padding:'14px', borderRadius: radius.md,
              background: checked ? 'var(--gradient-brand)' : colors.bg[400],
              color: checked ? '#fff' : colors.text[300],
              border: checked ? 'none' : `1px solid ${colors.border.default}`,
              fontWeight:700, fontSize:14, cursor: checked ? 'pointer' : 'not-allowed',
              fontFamily:'inherit', transition:'opacity .2s'
            }}>
            {checked ? 'Confirmar y continuar' : 'Marca la casilla para continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
