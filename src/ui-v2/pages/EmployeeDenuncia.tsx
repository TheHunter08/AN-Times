// Página "Denuncia" (canal ético anónimo) — versión ui-v2. Misma lógica que
// TabDenuncia.jsx (legacy), relocalizada y restilizada con los tokens v7.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../services/dataServiceV2.js'
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'

const TIPOS = [
  { value: 'acoso', label: 'Acoso' },
  { value: 'fraude', label: 'Fraude' },
  { value: 'seguridad', label: 'Seguridad en obra' },
  { value: 'discriminacion', label: 'Discriminación' },
  { value: 'otro', label: 'Otro' },
]


function estadoLabel(estado: string) {
  if (estado === 'nueva') return { text: 'Recibida', color: colors.semantic.orange }
  if (estado === 'en_proceso') return { text: 'En revisión', color: colors.primary.light }
  if (estado === 'resuelta') return { text: 'Resuelta', color: colors.semantic.green }
  return { text: estado, color: colors.text[500] }
}

function genAnonId() {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase()
}

const inputStyle: any = {
  width: '100%', boxSizing: 'border-box', background: colors.bg[700],
  border: `1px solid ${colors.border.default}`, borderRadius: 10, color: colors.text[900],
  fontSize: '.9rem', padding: '10px 12px', outline: 'none', fontFamily: 'inherit',
}
const labelStyle: any = { display: 'block', color: colors.text[500], fontSize: '.78rem', marginBottom: 4, fontWeight: 600 }

export interface EmployeeDenunciaProps { toast: (...args: any[]) => void; onBack?: () => void }

export function EmployeeDenuncia({ toast, onBack }: EmployeeDenunciaProps) {
  const [tipo, setTipo] = useState('acoso')
  const [mensaje, setMensaje] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedCode, setSubmittedCode] = useState<string | null>(null)

  const [trackCode, setTrackCode] = useState('')
  const [trackResult, setTrackResult] = useState<any>(null)
  const [trackError, setTrackError] = useState('')
  const [tracking, setTracking] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mensaje.trim().length < 20) {
      toast?.('El mensaje debe tener al menos 20 caracteres', 3500, 'err')
      return
    }
    setSubmitting(true)
    try {
      const anonId = genAnonId()
      // RPC en vez de saveDB: `denuncias` ya no se sincroniza al blob general
      // (ver migration-2026-07-18-denuncias-privadas.sql) — nadie más que un
      // admin real o quien tenga este código puede leerla.
      const { error } = await supabase.rpc('submit_denuncia', { p_anon_id: anonId, p_tipo: tipo, p_mensaje: mensaje.trim() })
      if (error) throw error
      setSubmittedCode(anonId)
      setMensaje('')
      setTipo('acoso')
    } catch (err) {
      console.error('Error al guardar denuncia:', err)
      toast?.('Error al enviar la denuncia. Inténtalo de nuevo.', 4500, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTrack() {
    const code = trackCode.trim().toUpperCase()
    if (!code) return
    setTracking(true)
    try {
      const { data, error } = await supabase.rpc('track_denuncia', { p_anon_id: code })
      if (error) throw error
      const found = data?.[0]
      if (!found) {
        setTrackResult(null)
        setTrackError('No se encontró ninguna denuncia con ese código.')
      } else {
        setTrackResult({ ...found, anonId: found.anon_id, ts: found.created_at })
        setTrackError('')
      }
    } catch (err) {
      console.error('Error al consultar denuncia:', err)
      setTrackResult(null)
      setTrackError('Error al consultar — inténtalo de nuevo.')
    } finally {
      setTracking(false)
    }
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: '10px 0 14px', fontSize: 14, fontWeight: 600, minHeight: 44 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Volver a Perfil
        </button>
      )}
      <div style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-500) 12%, transparent), color-mix(in srgb, var(--brand-500) 4%, transparent))',
        border: '1px solid color-mix(in srgb, var(--brand-500) 25%, transparent)', borderRadius: 14, padding: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>🔒</span>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: colors.text[900] }}>Canal de denuncias anónimo</h2>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: '.82rem', color: colors.text[500], lineHeight: 1.5 }}>
          Este canal es completamente anónimo y cumple con la{' '}
          <strong style={{ color: colors.primary.light }}>Directiva UE 2019/1937</strong> sobre
          protección de personas que informen sobre infracciones del Derecho de la Unión.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--success-soft)',
          border: '1px solid color-mix(in srgb, var(--success-400) 25%, transparent)', borderRadius: 8,
          padding: '4px 10px', fontSize: '.75rem', color: colors.semantic.green, fontWeight: 700,
        }}>
          ✓ Tu identidad está protegida. TIMES INC no puede identificarte.
        </div>
      </div>

      {submittedCode && (
        <div style={{ background: 'var(--success-soft)', border: '1.5px solid color-mix(in srgb, var(--success-400) 35%, transparent)', borderRadius: 14, padding: 20, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <p style={{ margin: '0 0 12px', color: colors.text[900], fontWeight: 700, fontSize: '.95rem' }}>Denuncia enviada correctamente</p>
          <p style={{ margin: '0 0 8px', color: colors.text[500], fontSize: '.82rem' }}>Guarda este código para consultar el estado:</p>
          <div style={{ background: colors.bg[700], borderRadius: 10, padding: 12, fontSize: '1.8rem', fontWeight: 900, letterSpacing: '.2em', color: colors.semantic.green, fontFamily: 'monospace', marginBottom: 12 }}>
            {submittedCode}
          </div>
          <p style={{ margin: 0, color: colors.text[300], fontSize: '.78rem' }}>Sin este código no podrás consultar el estado de tu denuncia.</p>
          <button onClick={() => setSubmittedCode(null)} style={{ marginTop: 14, background: 'none', border: `1px solid ${colors.border.default}`, borderRadius: 8, color: colors.text[500], fontSize: '.82rem', padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Enviar otra denuncia
          </button>
        </div>
      )}

      {!submittedCode && (
        <form onSubmit={handleSubmit} style={{ background: colors.bg[600], borderRadius: 14, padding: 16, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: '.95rem', color: colors.text[900], fontWeight: 700 }}>Nueva denuncia</h3>

          <div>
            <label style={labelStyle}>Tipo de irregularidad</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Descripción *{' '}
              <span style={{ color: mensaje.length < 20 ? colors.semantic.red : colors.semantic.green, fontWeight: 500 }}>
                ({mensaje.length} / mín. 20 caracteres)
              </span>
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }} rows={5}
              placeholder="Describe la situación con el mayor detalle posible. No incluyas tu nombre ni datos que puedan identificarte."
              value={mensaje} onChange={e => setMensaje(e.target.value)} required
            />
          </div>

          <div style={{ background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger-400) 15%, transparent)', borderRadius: 8, padding: '10px 12px', fontSize: '.78rem', color: colors.text[500], lineHeight: 1.5 }}>
            ⚠️ No incluyas tu nombre, número de empleado ni ningún dato que pueda identificarte.
            Esta denuncia se enviará sin ningún vínculo a tu cuenta.
          </div>

          <button type="submit" disabled={submitting || mensaje.trim().length < 20} style={{
            background: mensaje.trim().length >= 20 ? colors.primary.base : colors.bg[700],
            border: 'none', borderRadius: 10, color: mensaje.trim().length >= 20 ? '#fff' : colors.text[300],
            fontWeight: 700, fontSize: '.95rem', padding: 13, cursor: submitting || mensaje.trim().length < 20 ? 'not-allowed' : 'pointer',
            transition: 'background .2s', fontFamily: 'inherit',
          }}>
            {submitting ? 'Enviando...' : 'Enviar denuncia de forma anónima'}
          </button>
        </form>
      )}

      <div style={{ background: colors.bg[600], borderRadius: 14, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '.95rem', color: colors.text[900], fontWeight: 700 }}>Consultar estado</h3>
        <p style={{ margin: '0 0 12px', color: colors.text[500], fontSize: '.82rem' }}>
          Introduce el código de 8 caracteres que recibiste al enviar tu denuncia.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '.1em', textTransform: 'uppercase' }}
            type="text" placeholder="XXXXXXXX" maxLength={8} value={trackCode}
            onChange={e => { setTrackCode(e.target.value.toUpperCase()); setTrackResult(null); setTrackError('') }}
          />
          <button onClick={handleTrack} disabled={tracking} style={{ background: colors.primary.base, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: '.9rem', padding: '10px 18px', cursor: tracking ? 'not-allowed' : 'pointer', opacity: tracking ? .7 : 1, flexShrink: 0, fontFamily: 'inherit' }}>
            {tracking ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {trackError && <p style={{ marginTop: 10, color: colors.semantic.red, fontSize: '.85rem' }}>{trackError}</p>}

        {trackResult && (() => {
          const { text, color } = estadoLabel(trackResult.estado)
          return (
            <div style={{ marginTop: 14, background: colors.bg[700], borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: colors.text[500], fontSize: '.82rem' }}>
                  Código: <strong style={{ color: colors.text[900], fontFamily: 'monospace' }}>{trackResult.anonId}</strong>
                </span>
                <span style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color, borderRadius: 6, padding: '2px 10px', fontSize: '.75rem', fontWeight: 700 }}>
                  {text}
                </span>
              </div>
              <p style={{ margin: '0 0 6px', color: colors.text[500], fontSize: '.78rem' }}>
                Tipo: <span style={{ color: colors.text[900], textTransform: 'capitalize' }}>{trackResult.tipo}</span>
              </p>
              <p style={{ margin: '0 0 6px', color: colors.text[500], fontSize: '.78rem' }}>
                Enviada: {new Date(trackResult.ts).toLocaleDateString('es')}
              </p>
              {trackResult.respuesta && (
                <div style={{ marginTop: 10, background: 'color-mix(in srgb, var(--brand-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-500) 20%, transparent)', borderRadius: 8, padding: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '.78rem', color: colors.primary.light, fontWeight: 700 }}>Respuesta del equipo:</p>
                  <p style={{ margin: 0, fontSize: '.88rem', color: colors.text[900] }}>{trackResult.respuesta}</p>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', color: colors.text[300], fontSize: '.72rem', lineHeight: 1.5 }}>
        Conforme a la Directiva UE 2019/1937 del Parlamento Europeo
        <br />
        sobre la protección de las personas que informen sobre infracciones
      </div>
    </div>
  )
}
