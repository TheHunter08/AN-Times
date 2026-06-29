import { useState } from 'react';
import { gid } from '../utils/time.js';

const TIPOS = [
  { value: 'acoso',            label: 'Acoso' },
  { value: 'fraude',           label: 'Fraude' },
  { value: 'seguridad en obra', label: 'Seguridad en obra' },
  { value: 'discriminacion',   label: 'Discriminación' },
  { value: 'otro',             label: 'Otro' },
];

function estadoLabel(estado) {
  if (estado === 'nueva')       return { text: 'Recibida',   color: '#f59e0b' };
  if (estado === 'en revisión') return { text: 'En revisión', color: 'var(--primary-light)' };
  if (estado === 'resuelta')    return { text: 'Resuelta',   color: 'var(--green)' };
  return                               { text: estado,       color: 'var(--text3)' };
}

function genAnonId() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36).padStart(2,'0')).join('').slice(0,8).toUpperCase();
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-700)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: '10px',
  color: 'var(--text1)',
  fontSize: '.9rem',
  padding: '10px 12px',
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  color: 'var(--text3)',
  fontSize: '.78rem',
  marginBottom: '4px',
  fontWeight: 500,
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
      const updatedDB = { ...db, denuncias: [...(db.denuncias || []), nueva] };
      await saveDB(updatedDB);
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
    <div style={{ padding: '16px', paddingBottom: '40px' }}>
      {onBack && (
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:'10px 0 14px', fontSize:14, fontWeight:600, minHeight:44 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a Perfil
        </button>
      )}
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(99,102,241,.04))',
          border: '1px solid rgba(99,102,241,.25)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '1.4rem' }}>🔒</span>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text1)' }}>
            Canal de denuncias anónimo
          </h2>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: '.82rem', color: 'var(--text3)', lineHeight: 1.5 }}>
          Este canal es completamente anónimo y cumple con la{' '}
          <strong style={{ color: 'var(--primary-light)' }}>Directiva UE 2019/1937</strong> sobre
          protección de personas que informen sobre infracciones del Derecho de la Unión.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(34,197,94,.1)',
            border: '1px solid rgba(34,197,94,.25)',
            borderRadius: '8px',
            padding: '4px 10px',
            fontSize: '.75rem',
            color: 'var(--green)',
            fontWeight: 600,
          }}
        >
          ✓ Tu identidad está protegida. TIMES INC no puede identificarte.
        </div>
      </div>

      {/* Submission success */}
      {submittedCode && (
        <div
          style={{
            background: 'rgba(34,197,94,.1)',
            border: '1.5px solid rgba(34,197,94,.35)',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
          <p style={{ margin: '0 0 12px', color: 'var(--text1)', fontWeight: 600, fontSize: '.95rem' }}>
            Denuncia enviada correctamente
          </p>
          <p style={{ margin: '0 0 8px', color: 'var(--text3)', fontSize: '.82rem' }}>
            Guarda este código para consultar el estado:
          </p>
          <div
            style={{
              background: 'var(--bg-700)',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '1.8rem',
              fontWeight: 900,
              letterSpacing: '.2em',
              color: 'var(--green)',
              fontFamily: 'monospace',
              marginBottom: '12px',
            }}
          >
            {submittedCode}
          </div>
          <p style={{ margin: 0, color: 'var(--text4)', fontSize: '.78rem' }}>
            Sin este código no podrás consultar el estado de tu denuncia.
          </p>
          <button
            onClick={() => setSubmittedCode(null)}
            style={{
              marginTop: '14px',
              background: 'none',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: '8px',
              color: 'var(--text3)',
              fontSize: '.82rem',
              padding: '6px 16px',
              cursor: 'pointer',
            }}
          >
            Enviar otra denuncia
          </button>
        </div>
      )}

      {/* New report form */}
      {!submittedCode && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--bg-800)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '.95rem', color: 'var(--text1)', fontWeight: 700 }}>
            Nueva denuncia
          </h3>

          <div>
            <label style={labelStyle}>Tipo de irregularidad</label>
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Descripción *{' '}
              <span style={{ color: mensaje.length < 20 ? 'var(--danger)' : 'var(--green)', fontWeight: 400 }}>
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

          <div
            style={{
              background: 'rgba(239,68,68,.06)',
              border: '1px solid rgba(239,68,68,.15)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '.78rem',
              color: 'var(--text3)',
              lineHeight: 1.5,
            }}
          >
            ⚠️ No incluyas tu nombre, número de empleado ni ningún dato que pueda identificarte.
            Esta denuncia se enviará sin ningún vínculo a tu cuenta.
          </div>

          <button
            type="submit"
            disabled={submitting || mensaje.trim().length < 20}
            style={{
              background: mensaje.trim().length >= 20 ? 'var(--primary)' : 'var(--bg-700)',
              border: 'none',
              borderRadius: '10px',
              color: mensaje.trim().length >= 20 ? '#fff' : 'var(--text4)',
              fontWeight: 700,
              fontSize: '.95rem',
              padding: '13px',
              cursor: submitting || mensaje.trim().length < 20 ? 'not-allowed' : 'pointer',
              transition: 'background .2s',
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar denuncia de forma anónima'}
          </button>
        </form>
      )}

      {/* Track status */}
      <div
        style={{
          background: 'var(--bg-800)',
          borderRadius: '14px',
          padding: '16px',
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: '.95rem', color: 'var(--text1)', fontWeight: 700 }}>
          Consultar estado
        </h3>
        <p style={{ margin: '0 0 12px', color: 'var(--text3)', fontSize: '.82rem' }}>
          Introduce el código de 6 caracteres que recibiste al enviar tu denuncia.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            style={{
              ...inputStyle,
              flex: 1,
              fontFamily: 'monospace',
              fontSize: '1rem',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
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
            style={{
              background: 'var(--primary)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 600,
              fontSize: '.9rem',
              padding: '10px 18px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Buscar
          </button>
        </div>

        {trackError && (
          <p style={{ marginTop: '10px', color: 'var(--danger)', fontSize: '.85rem' }}>{trackError}</p>
        )}

        {trackResult && (() => {
          const { text, color } = estadoLabel(trackResult.estado);
          return (
            <div
              style={{
                marginTop: '14px',
                background: 'var(--bg-700)',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text3)', fontSize: '.82rem' }}>
                  Código: <strong style={{ color: 'var(--text1)', fontFamily: 'monospace' }}>{trackResult.anonId}</strong>
                </span>
                <span
                  style={{
                    background: `${color}22`,
                    color,
                    borderRadius: '6px',
                    padding: '2px 10px',
                    fontSize: '.75rem',
                    fontWeight: 700,
                  }}
                >
                  {text}
                </span>
              </div>
              <p style={{ margin: '0 0 6px', color: 'var(--text3)', fontSize: '.78rem' }}>
                Tipo: <span style={{ color: 'var(--text1)', textTransform: 'capitalize' }}>{trackResult.tipo}</span>
              </p>
              <p style={{ margin: '0 0 6px', color: 'var(--text3)', fontSize: '.78rem' }}>
                Enviada: {new Date(trackResult.ts).toLocaleDateString('es')}
              </p>
              {trackResult.respuesta && (
                <div
                  style={{
                    marginTop: '10px',
                    background: 'rgba(99,102,241,.1)',
                    border: '1px solid rgba(99,102,241,.2)',
                    borderRadius: '8px',
                    padding: '10px',
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontSize: '.78rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                    Respuesta del equipo:
                  </p>
                  <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--text1)' }}>
                    {trackResult.respuesta}
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* EU Directive badge */}
      <div
        style={{
          marginTop: '20px',
          textAlign: 'center',
          color: 'var(--text4)',
          fontSize: '.72rem',
          lineHeight: 1.5,
        }}
      >
        Conforme a la Directiva UE 2019/1937 del Parlamento Europeo
        <br />
        sobre la protección de las personas que informen sobre infracciones
      </div>
    </div>
  );
}
