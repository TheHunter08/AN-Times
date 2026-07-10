import { useState } from 'react';
import { gid, today } from '../utils/time.js';
import { resizeImageToDataUrl } from '../utils/imageResize.js';

const CATEGORIAS = ['dieta', 'transporte', 'material', 'otro'];

function estadoBadgeStyle(estado) {
  if (estado === 'aprobado')  return { background: 'rgba(34,197,94,.15)',  color: 'var(--green)' };
  if (estado === 'rechazado') return { background: 'rgba(239,68,68,.15)',  color: 'var(--danger)' };
  return                             { background: 'rgba(245,158,11,.15)', color: '#f59e0b' };
}

function categoriaBadgeStyle() {
  return { background: 'rgba(99,102,241,.15)', color: 'var(--primary-light)' };
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

  return (
    <div style={{ padding: '16px', paddingBottom: '32px' }}>
      {onBack && (
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:'10px 0 14px', fontSize:14, fontWeight:600, minHeight:44 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a Perfil
        </button>
      )}
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text1)', fontWeight: 700 }}>
          Mis gastos
        </h3>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: open ? 'var(--bg-700)' : 'var(--primary)',
            border: 'none',
            borderRadius: '10px',
            color: '#fff',
            fontWeight: 600,
            fontSize: '.85rem',
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          {open ? 'Cancelar' : '+ Nuevo gasto'}
        </button>
      </div>

      {/* Inline form */}
      {open && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--bg-800)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div>
            <label style={labelStyle}>Concepto *</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="¿Qué fue?"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Importe € *</label>
              <input
                style={inputStyle}
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input
                style={inputStyle}
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Categoría</label>
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Foto / ticket (opcional)</label>
            <input
              style={{ ...inputStyle, padding: '8px 12px' }}
              type="file"
              accept="image/*"
              onChange={handleFoto}
            />
            {fotoPreview && (
              <img
                src={fotoPreview}
                alt="preview"
                style={{
                  marginTop: '8px',
                  width: '80px',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,.1)',
                }}
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea
              style={{ ...inputStyle, resize: 'none' }}
              rows={2}
              placeholder="Información adicional..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: 'var(--primary)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '.95rem',
              padding: '12px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar gasto'}
          </button>
        </form>
      )}

      {/* Gastos list */}
      {misGastos.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--text4)',
            fontSize: '.9rem',
            marginTop: '32px',
          }}
        >
          No has registrado ningún gasto todavía
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {misGastos.map((g) => (
            <div
              key={g.id}
              style={{
                background: 'var(--bg-800)',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              {/* Thumbnail */}
              {g.foto && (
                <img
                  src={g.foto}
                  alt="ticket"
                  style={{
                    width: '52px',
                    height: '52px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,.08)',
                  }}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <span
                    style={{
                      color: 'var(--text1)',
                      fontWeight: 600,
                      fontSize: '.95rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.concepto}
                  </span>
                  <span
                    style={{
                      color: 'var(--text1)',
                      fontWeight: 700,
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    €{fmt(g.importe)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span
                    style={{
                      ...categoriaBadgeStyle(),
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '.72rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {g.categoria}
                  </span>
                  <span
                    style={{
                      ...estadoBadgeStyle(g.estado),
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '.72rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {g.estado}
                  </span>
                  <span style={{ color: 'var(--text4)', fontSize: '.75rem', marginLeft: 'auto' }}>
                    {g.fecha}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly stats */}
      {misGastos.length > 0 && (
        <div
          style={{
            marginTop: '20px',
            background: 'var(--bg-800)',
            borderRadius: '12px',
            padding: '12px 16px',
            color: 'var(--text3)',
            fontSize: '.85rem',
            textAlign: 'center',
          }}
        >
          Este mes:{' '}
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>€{fmt(aprobadosMes)} aprobados</span>
          {' · '}
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>€{fmt(pendientesMes)} pendientes</span>
        </div>
      )}
    </div>
  );
}
