import { useState } from 'react';
import { gid } from '../utils/time.js';

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)', dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)' },
  semantic: { green: 'var(--success-400)', orange: 'var(--warning-400)', red: 'var(--danger-400)' },
  text: { 900: 'var(--text-primary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
};
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', pill: 'var(--radius-pill)' };
const toneSoft = (color, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

// value debe coincidir con las claves TIPO_LABELS/TIPO_COLORS de PanelDenuncias.jsx
// (admin) — antes 'seguridad en obra' aquí vs 'seguridad' allí no casaban nunca,
// así que esas denuncias mostraban el icono/color genérico en el panel del admin.
const TIPOS = [
  { value: 'acoso',          label: 'Acoso' },
  { value: 'fraude',         label: 'Fraude' },
  { value: 'seguridad',      label: 'Seguridad en obra' },
  { value: 'discriminacion', label: 'Discriminación' },
  { value: 'otro',           label: 'Otro' },
];

// estado debe coincidir con los valores que escribe PanelDenuncias.jsx (admin):
// 'nueva' | 'en_proceso' | 'resuelta' — antes se comprobaba 'en revisión' (con
// espacio y tilde), que nunca coincidía, así que el empleado veía el string
// crudo "en_proceso" en vez de "En revisión".
function estadoLabel(estado) {
  if (estado === 'nueva')      return { text: 'Recibida',    color: colors.semantic.orange };
  if (estado === 'en_proceso') return { text: 'En revisión', color: colors.primary.light };
  if (estado === 'resuelta')   return { text: 'Resuelta',    color: colors.semantic.green };
  return                              { text: estado,        color: colors.text[500] };
}

function genAnonId() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36).padStart(2,'0')).join('').slice(0,8).toUpperCase();
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: colors.bg[400],
  border: `1px solid ${colors.border.default}`,
  borderRadius: radius.md,
  color: colors.text[900],
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  color: colors.text[500],
  fontSize: 11,
  marginBottom: 5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
};

export default function TabDenuncia({ db, u, toast, saveDB, onBack }) {
  // Form state
  const [tipo, setTipo] = useState('acoso');
  const [mensaje, setMensaje] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState(null);

  // Track state
  const [trackCode, setTrackCode] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (mensaje.trim().length < 20) {
      toast && toast('El mensaje debe tener al menos 20 caracteres', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const anonId = genAnonId();
      const nueva = {
        id: gid(),
        anonId,
        tipo,
        mensaje: mensaje.trim(),
        ts: new Date().toISOString(),
        estado: 'nueva',
        respuesta: null,
      };
      // saveDB(partial) mínimo vía función de estado fresco, no el objeto db
      // completo del cierre del render: saveDB calcula qué se "borró" comparando
      // contra el estado más fresco del store, campo a campo — pasar aquí un
      // `db` desactualizado hacía que CUALQUIER dato llegado por sync mientras
      // tanto se interpretara como borrado a propósito y se eliminase de verdad
      // del servidor al enviar esta denuncia.
      await saveDB(freshDb => ({ denuncias: [...(freshDb.denuncias || []), nueva] }));
      setSubmittedCode(anonId);
      setMensaje('');
      setTipo('acoso');
    } catch (err) {
      console.error('Error al guardar denuncia:', err);
      toast && toast('Error al enviar la denuncia. Inténtalo de nuevo.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleTrack() {
    const code = trackCode.trim().toUpperCase();
    if (!code) return;
    const found = (db.denuncias || []).find((d) => d.anonId === code);
    if (!found) {
      setTrackResult(null);
      setTrackError('No se encontró ninguna denuncia con ese código.');
    } else {
      setTrackResult(found);
      setTrackError('');
    }
  }

  return (
    <div style={{ padding: 'var(--space-4)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 520, margin: '0 auto' }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: '2px 0', fontSize: 14, fontWeight: 600, minHeight: 44, alignSelf: 'flex-start' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a Perfil
        </button>
      )}

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${toneSoft(colors.primary.base, 12)}, ${toneSoft(colors.primary.base, 4)})`,
        border: `1px solid ${toneSoft(colors.primary.base, 25)}`,
        borderRadius: radius.xl,
        padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>🔒</span>
          <h1 style={{ margin: 0, fontSize: 'var(--font-heading-md)', fontWeight: 'var(--font-semibold)', color: colors.text[900] }}>
            Canal de denuncias anónimo
          </h1>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: colors.text[500], lineHeight: 1.5 }}>
          Este canal es completamente anónimo y cumple con la{' '}
          <strong style={{ color: colors.primary.light }}>Directiva UE 2019/1937</strong> sobre
          protección de personas que informen sobre infracciones del Derecho de la Unión.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: toneSoft(colors.semantic.green, 10), border: `1px solid ${toneSoft(colors.semantic.green, 25)}`,
          borderRadius: radius.sm, padding: '4px 10px', fontSize: 11.5, color: colors.semantic.green, fontWeight: 700,
        }}>
          ✓ Tu identidad está protegida. TIMES INC no puede identificarte.
        </div>
      </div>

      {/* Submission success */}
      {submittedCode && (
        <div style={{ background: toneSoft(colors.semantic.green, 10), border: `1.5px solid ${toneSoft(colors.semantic.green, 35)}`, borderRadius: radius.xl, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <p style={{ margin: '0 0 12px', color: colors.text[900], fontWeight: 700, fontSize: 14 }}>
            Denuncia enviada correctamente
          </p>
          <p style={{ margin: '0 0 8px', color: colors.text[500], fontSize: 12.5 }}>
            Guarda este código para consultar el estado:
          </p>
          <div style={{ background: colors.bg[400], borderRadius: radius.md, padding: 12, fontSize: 28, fontWeight: 900, letterSpacing: '.2em', color: colors.semantic.green, fontFamily: 'monospace', marginBottom: 12 }}>
            {submittedCode}
          </div>
          <p style={{ margin: 0, color: colors.text[300], fontSize: 11.5 }}>
            Sin este código no podrás consultar el estado de tu denuncia.
          </p>
          <button
            onClick={() => setSubmittedCode(null)}
            style={{ marginTop: 14, background: 'none', border: `1px solid ${colors.border.default}`, borderRadius: radius.sm, color: colors.text[500], fontSize: 12.5, padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Enviar otra denuncia
          </button>
        </div>
      )}

      {/* New report form */}
      {!submittedCode && (
        <form onSubmit={handleSubmit} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, color: colors.text[900], fontWeight: 700 }}>
            Nueva denuncia
          </h3>

          <div>
            <label style={labelStyle}>Tipo de irregularidad</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Descripción *{' '}
              <span style={{ color: mensaje.length < 20 ? colors.semantic.red : colors.semantic.green, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                ({mensaje.length} / mín. 20 caracteres)
              </span>
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={5}
              placeholder="Describe la situación con el mayor detalle posible. No incluyas tu nombre ni datos que puedan identificarte."
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              required
            />
          </div>

          <div style={{ background: toneSoft(colors.semantic.red, 6), border: `1px solid ${toneSoft(colors.semantic.red, 15)}`, borderRadius: radius.sm, padding: '10px 12px', fontSize: 11.5, color: colors.text[500], lineHeight: 1.5 }}>
            ⚠️ No incluyas tu nombre, número de empleado ni ningún dato que pueda identificarte.
            Esta denuncia se enviará sin ningún vínculo a tu cuenta.
          </div>

          <button
            type="submit"
            disabled={submitting || mensaje.trim().length < 20}
            style={{
              background: mensaje.trim().length >= 20 ? 'var(--gradient-brand)' : colors.bg[400],
              border: 'none', borderRadius: radius.md,
              color: mensaje.trim().length >= 20 ? '#fff' : colors.text[300],
              fontWeight: 700, fontSize: 14, padding: 13,
              cursor: submitting || mensaje.trim().length < 20 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'opacity .2s',
            }}
          >
            {submitting ? 'Enviando…' : 'Enviar denuncia de forma anónima'}
          </button>
        </form>
      )}

      {/* Track status */}
      <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14.5, color: colors.text[900], fontWeight: 700 }}>
          Consultar estado
        </h3>
        <p style={{ margin: '0 0 12px', color: colors.text[500], fontSize: 12.5 }}>
          Introduce el código de 6 caracteres que recibiste al enviar tu denuncia.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 15, letterSpacing: '.1em', textTransform: 'uppercase' }}
            type="text"
            placeholder="XXXXXX"
            maxLength={6}
            value={trackCode}
            onChange={(e) => {
              setTrackCode(e.target.value.toUpperCase());
              setTrackResult(null);
              setTrackError('');
            }}
          />
          <button
            onClick={handleTrack}
            type="button"
            style={{ background: colors.primary.base, border: 'none', borderRadius: radius.md, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '10px 18px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
          >
            Buscar
          </button>
        </div>

        {trackError && (
          <p style={{ marginTop: 10, color: colors.semantic.red, fontSize: 13 }}>{trackError}</p>
        )}

        {trackResult && (() => {
          const { text, color } = estadoLabel(trackResult.estado);
          return (
            <div style={{ marginTop: 14, background: colors.bg[400], borderRadius: radius.md, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: colors.text[500], fontSize: 12.5 }}>
                  Código: <strong style={{ color: colors.text[900], fontFamily: 'monospace' }}>{trackResult.anonId}</strong>
                </span>
                <span style={{ background: toneSoft(color, 14), color, borderRadius: radius.sm, padding: '2px 10px', fontSize: 11.5, fontWeight: 700 }}>
                  {text}
                </span>
              </div>
              <p style={{ margin: '0 0 6px', color: colors.text[500], fontSize: 12 }}>
                Tipo: <span style={{ color: colors.text[900], textTransform: 'capitalize' }}>{trackResult.tipo}</span>
              </p>
              <p style={{ margin: '0 0 6px', color: colors.text[500], fontSize: 12 }}>
                Enviada: {new Date(trackResult.ts).toLocaleDateString('es')}
              </p>
              {trackResult.respuesta && (
                <div style={{ marginTop: 10, background: toneSoft(colors.primary.base, 10), border: `1px solid ${toneSoft(colors.primary.base, 20)}`, borderRadius: radius.sm, padding: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: colors.primary.light, fontWeight: 700 }}>
                    Respuesta del equipo:
                  </p>
                  <p style={{ margin: 0, fontSize: 13.5, color: colors.text[900] }}>
                    {trackResult.respuesta}
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* EU Directive badge */}
      <div style={{ textAlign: 'center', color: colors.text[300], fontSize: 11, lineHeight: 1.5 }}>
        Conforme a la Directiva UE 2019/1937 del Parlamento Europeo
        <br />
        sobre la protección de las personas que informen sobre infracciones
      </div>
    </div>
  );
}
