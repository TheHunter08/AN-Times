import { useState } from 'react';
import { gid, today } from '../utils/time.js';
import { resizeImageToDataUrl } from '../utils/imageResize.js';

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)', dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)' },
  semantic: { green: 'var(--success-400)', orange: 'var(--warning-400)', red: 'var(--danger-400)' },
  text: { 900: 'var(--text-primary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
};
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', pill: 'var(--radius-pill)' };
const toneSoft = (color, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

const CATEGORIAS = ['dieta', 'transporte', 'material', 'otro'];

function estadoTone(estado) {
  if (estado === 'aprobado')  return colors.semantic.green;
  if (estado === 'rechazado') return colors.semantic.red;
  return colors.semantic.orange;
}

function todayYMD() {
  return today();
}

function fmt(n) {
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TabGastos({ db, u, toast, saveDB, onBack }) {
  const [open, setOpen] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState(todayYMD());
  const [categoria, setCategoria] = useState('dieta');
  const [foto, setFoto] = useState(null);       // base64 string
  const [fotoPreview, setFotoPreview] = useState(null);
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const misGastos = (db.gastos || [])
    .filter((g) => g.empId === u.id)
    .sort((a, b) => (b.ts||'').localeCompare(a.ts||''));

  // Monthly stats
  const thisMonth = today().slice(0, 7);
  const gastosEsteMes = misGastos.filter((g) => g.fecha.startsWith(thisMonth));
  const aprobadosMes = gastosEsteMes
    .filter((g) => g.estado === 'aprobado')
    .reduce((s, g) => s + g.importe, 0);
  const pendientesMes = gastosEsteMes
    .filter((g) => g.estado === 'pendiente')
    .reduce((s, g) => s + g.importe, 0);

  async function handleFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    // Límite generoso solo para no intentar procesar un archivo absurdo — el
    // redimensionado real de abajo es lo que mantiene el tamaño guardado bajo,
    // no este chequeo. Antes se guardaba el archivo original entero en base64
    // (hasta 500KB) dentro del JSON único de la app — con varios gastos con
    // foto, eso se acumula sin límite en localStorage/Supabase, y un fallo de
    // cuota al guardar se tragaba en silencio (solo console.error).
    if (file.size > 15 * 1024 * 1024) {
      toast && toast('La imagen es demasiado grande', 'error');
      e.target.value = '';
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1200, 0.75);
      setFoto(dataUrl);
      setFotoPreview(dataUrl);
    } catch {
      toast && toast('Error al cargar la imagen', 'error');
    }
  }

  function resetForm() {
    setConcepto('');
    setImporte('');
    setFecha(todayYMD());
    setCategoria('dieta');
    setFoto(null);
    setFotoPreview(null);
    setNotas('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!concepto.trim()) { toast && toast('Indica el concepto', 'error'); return; }
    if (!importe || +importe <= 0) { toast && toast('El importe debe ser mayor que 0', 'error'); return; }
    setSubmitting(true);
    try {
      const nuevo = {
        id: gid(),
        empId: u.id,
        empName: u.name,
        concepto: concepto.trim(),
        importe: +importe,
        fecha,
        foto: foto || null,
        estado: 'pendiente',
        ts: new Date().toISOString(),
        categoria,
        notas: notas.trim(),
      };
      // saveDB(partial) mínimo vía función de estado fresco, no el objeto db
      // completo del cierre del render: saveDB calcula qué se "borró" comparando
      // contra el estado más fresco del store, campo a campo — pasar aquí un
      // `db` desactualizado (esta pantalla puede tardar unos segundos, con foto
      // de por medio) hacía que CUALQUIER dato llegado por sync mientras tanto
      // (un chat, otro gasto, una solicitud...) se interpretara como borrado a
      // propósito y se eliminase de verdad del servidor al subir este gasto.
      await saveDB(freshDb => ({ gastos: [...(freshDb.gastos || []), nuevo] }));
      toast && toast('Gasto enviado correctamente', 'success');
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error('Error al guardar gasto:', err);
      toast && toast('Error al guardar el gasto. Inténtalo de nuevo.', 'error');
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div style={{ padding: 'var(--space-4)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 520, margin: '0 auto' }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: '2px 0', fontSize: 14, fontWeight: 600, minHeight: 44, alignSelf: 'flex-start' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a Perfil
        </button>
      )}

      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ margin: 0, color: colors.text[900], fontSize: 'var(--font-heading-xl)', fontWeight: 'var(--font-semibold)', letterSpacing: '-.035em' }}>Mis gastos</h1>
        <p style={{ margin: 0, color: colors.text[500], fontSize: 'var(--font-body-sm)' }}>Registra dietas, transporte y material para reembolso.</p>
      </header>

      {/* Stats row */}
      {misGastos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.semantic.green, letterSpacing: '-.7px' }}>{fmt(aprobadosMes)} €</div>
            <div style={{ fontSize: 10, color: colors.text[500], marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Aprobados este mes</div>
          </div>
          <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.semantic.orange, letterSpacing: '-.7px' }}>{fmt(pendientesMes)} €</div>
            <div style={{ fontSize: 10, color: colors.text[500], marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Pendientes este mes</div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', minHeight: 48, padding: '12px 20px', borderRadius: radius.md,
          border: open ? `1px solid ${colors.border.default}` : 'none',
          background: open ? colors.bg[600] : 'var(--gradient-brand)',
          color: open ? colors.text[700] || colors.text[900] : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', boxShadow: open ? 'none' : 'var(--shadow-brand)',
        }}
      >
        {open ? 'Cancelar' : (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Nuevo gasto
          </>
        )}
      </button>

      {/* Inline form */}
      {open && (
        <form onSubmit={handleSubmit} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Concepto *</label>
            <input style={inputStyle} type="text" placeholder="¿Qué fue?" value={concepto} onChange={(e) => setConcepto(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Importe € *</label>
              <input style={inputStyle} type="number" placeholder="0.00" step="0.01" min="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input style={inputStyle} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Categoría</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Foto / ticket (opcional)</label>
            <input style={{ ...inputStyle, padding: '8px 12px' }} type="file" accept="image/*" onChange={handleFoto} />
            {fotoPreview && (
              <img src={fotoPreview} alt="preview" style={{ marginTop: 8, width: 80, height: 80, objectFit: 'cover', borderRadius: radius.sm, border: `1px solid ${colors.border.default}` }} />
            )}
          </div>

          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} placeholder="Información adicional..." value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: 'var(--gradient-brand)', border: 'none', borderRadius: radius.md,
              color: '#fff', fontWeight: 700, fontSize: 14, padding: 12,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Enviando…' : 'Enviar gasto'}
          </button>
        </form>
      )}

      {/* Gastos list */}
      {misGastos.length === 0 ? (
        <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: colors.bg[400], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={colors.text[500]} strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.text[900], marginBottom: 6 }}>Sin gastos</div>
          <div style={{ fontSize: 12, color: colors.text[500] }}>No has registrado ningún gasto todavía</div>
        </div>
      ) : (
        <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, overflow: 'hidden' }}>
          {misGastos.map((g, i) => (
            <div key={g.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderTop: i > 0 ? `1px solid ${colors.border.subtle}` : 'none' }}>
              {g.foto && (
                <img src={g.foto} alt="ticket" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: radius.sm, flexShrink: 0, border: `1px solid ${colors.border.default}` }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: colors.text[900], fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.concepto}</span>
                  <span style={{ color: colors.text[900], fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{fmt(g.importe)} €</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ background: colors.primary.dim, color: colors.primary.light, borderRadius: radius.pill, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize' }}>{g.categoria}</span>
                  <span style={{ background: toneSoft(estadoTone(g.estado), 12), color: estadoTone(g.estado), borderRadius: radius.pill, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize' }}>{g.estado}</span>
                  <span style={{ color: colors.text[300], fontSize: 11, marginLeft: 'auto' }}>{g.fecha}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
