// Página "Gastos" — versión ui-v2. Misma lógica que TabGastos.jsx (legacy),
// relocalizada y restilizada con los tokens v7.
import { useState, useEffect } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent } from 'react'
import { gid, today } from '../../utils/time.js'
import { resizeImageToDataUrl } from '../../utils/imageResize.js'
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'
import { supabase } from '../../services/dataServiceV2.js'
import { queuePush } from '../../services/dataService.js'
import { createNotification } from '../../utils/notifications.js'
import { GASTOS_BUCKET } from '../../config/constants.js'

const CATEGORIAS = ['dieta', 'transporte', 'material', 'otro']


function estadoBadgeStyle(estado: string) {
  if (estado === 'aprobado') return { background: 'var(--success-soft)', color: colors.semantic.green }
  if (estado === 'rechazado') return { background: 'var(--danger-soft)', color: colors.semantic.red }
  return { background: 'var(--warning-soft)', color: colors.semantic.orange }
}

function categoriaBadgeStyle() {
  return { background: 'color-mix(in srgb, var(--brand-500) 15%, transparent)', color: colors.primary.light }
}

function fmt(n: number) {
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Convierte el data URL que produce resizeImageToDataUrl en un Blob subible
// a Storage — mismo decodificado base64→bytes que usa DocPreview.jsx.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export interface EmployeeGastosProps { db: any; u: any; toast: (...args: any[]) => void; saveDB: (updater: any) => void; onBack?: () => void }

export function EmployeeGastos({ db, u, toast, saveDB, onBack }: EmployeeGastosProps) {
  const [open, setOpen] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(today())
  const [categoria, setCategoria] = useState('dieta')
  const [foto, setFoto] = useState<string | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({})

  const misGastos = (db.gastos || [])
    .filter((g: any) => g.empId === u.id)
    .sort((a: any, b: any) => (b.ts || '').localeCompare(a.ts || ''))

  const thisMonth = today().slice(0, 7)
  const gastosEsteMes = misGastos.filter((g: any) => String(g.fecha || g.ts || '').slice(0, 7) === thisMonth)
  const aprobadosMes = gastosEsteMes.filter((g: any) => g.estado === 'aprobado').reduce((s: number, g: any) => s + (Number(g.importe) || 0), 0)
  const pendientesMes = gastosEsteMes.filter((g: any) => g.estado === 'pendiente').reduce((s: number, g: any) => s + (Number(g.importe) || 0), 0)

  // Las fotos subidas a Storage viven en un bucket privado — hay que pedir
  // una URL firmada de corta duración para poder mostrarlas como miniatura.
  // Los gastos antiguos (o subidos sin conexión) siguen con `foto` en base64
  // y no necesitan esto.
  const pendingFotoIds = misGastos.filter((g: any) => g.fotoPath && !(g.id in signedUrls)).map((g: any) => g.id).join(',')
  useEffect(() => {
    if (!pendingFotoIds || !supabase) return
    let cancelled = false
    const ids = pendingFotoIds.split(',')
    ;(async () => {
      // No se cachea `null` en caso de fallo (a diferencia de un éxito): un
      // error puntual de red dejaba la miniatura sin cargar para siempre,
      // porque pendingFotoIds excluye cualquier id ya presente en
      // signedUrls aunque su valor fuera null — así, sin caché de fallo, se
      // reintenta en el siguiente render en vez de solo tras recargar la página.
      const entries = (await Promise.all(ids.map(async (id: string) => {
        const g = misGastos.find((x: any) => x.id === id)
        if (!g) return null
        try {
          const { data, error } = await supabase.storage.from(GASTOS_BUCKET).createSignedUrl(g.fotoPath, 3600)
          return error || !data?.signedUrl ? null : [id, data.signedUrl]
        } catch { return null }
      }))).filter(Boolean) as [string, string][]
      if (!cancelled && entries.length) setSignedUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    })()
    return () => { cancelled = true }
  }, [pendingFotoIds])

  async function handleFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      toast?.('La imagen es demasiado grande', 4000, 'err')
      e.target.value = ''
      return
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1200, 0.75)
      setFoto(dataUrl)
      setFotoPreview(dataUrl)
    } catch {
      toast?.('Error al cargar la imagen', 4000, 'err')
    }
  }

  function resetForm() {
    setConcepto(''); setImporte(''); setFecha(today()); setCategoria('dieta')
    setFoto(null); setFotoPreview(null); setNotas('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!concepto.trim()) { toast?.('Indica el concepto', 3500, 'err'); return }
    if (!importe || +importe <= 0) { toast?.('El importe debe ser mayor que 0', 3500, 'err'); return }
    setSubmitting(true)
    try {
      const nowIso = new Date().toISOString()
      const nuevo: any = {
        id: gid(), empId: u.id, empName: u.name, concepto: concepto.trim(), importe: +importe,
        fecha, foto: null, fotoPath: null, estado: 'pendiente', ts: nowIso, _upd: nowIso, categoria, notas: notas.trim(),
      }
      // Preferimos Storage (cuota separada, 1 GB) sobre guardar la foto en
      // base64 dentro del JSONB de app_data (se come la cuota de base de
      // datos, 500 MB) — mismo criterio que documentos y PDFs de cierre. Si
      // falla la subida (sin conexión, bucket no configurado todavía), cae
      // al comportamiento anterior en vez de bloquear el envío del gasto.
      if (foto && supabase) {
        try {
          const blob = dataUrlToBlob(foto)
          const ext = blob.type === 'image/png' ? 'png' : 'jpg'
          const path = `${u.id}/${nuevo.id}.${ext}`
          const { error } = await supabase.storage.from(GASTOS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: true })
          if (!error) nuevo.fotoPath = path
          else { console.warn('[gastos] No se pudo subir la foto a Storage, se guarda en base64:', error.message); nuevo.foto = foto }
        } catch (uploadErr: any) {
          console.warn('[gastos] Error al subir la foto a Storage, se guarda en base64:', uploadErr?.message)
          nuevo.foto = foto
        }
      } else if (foto) {
        nuevo.foto = foto
      }
      // A diferencia de vacaciones/cierre/documentos, enviar un gasto no
      // avisaba al admin de ninguna forma — solo se enteraba si entraba
      // manualmente a la pantalla de gastos, retrasando el reembolso.
      const noti = createNotification({ empId: '__admin__', action: 'Nuevo gasto pendiente', detail: `${u.name}: ${concepto.trim()} · ${fmt(+importe)} €`, dedupeKey: `gasto:${nuevo.id}:pendiente`, ts: nowIso })
      await saveDB((freshDb: any) => ({ gastos: [...(freshDb.gastos || []), nuevo], notis: [...(freshDb.notis || []), noti] }))
      queuePush('__admin__', noti.action, noti.detail, 'times-gasto', '/?go=admin:gastos', `gasto:${nuevo.id}:pendiente`)
      toast?.('Gasto enviado correctamente', 3000, 'ok')
      resetForm()
      setOpen(false)
    } catch (err) {
      console.error('Error al guardar gasto:', err)
      toast?.('Error al guardar el gasto. Inténtalo de nuevo.', 4500, 'err')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: colors.bg[700],
    border: `1px solid ${colors.border.default}`, borderRadius: 10, color: colors.text[900],
    fontSize: '.9rem', padding: '10px 12px', outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle: CSSProperties = { display: 'block', color: colors.text[500], fontSize: '.78rem', marginBottom: 4, fontWeight: 600 }

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: '10px 0 14px', fontSize: 14, fontWeight: 600, minHeight: 44 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Volver a Perfil
        </button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: colors.text[900], fontWeight: 700 }}>Mis gastos</h3>
        <button onClick={() => setOpen(v => !v)} style={{
          background: open ? colors.bg[700] : colors.primary.base, border: 'none', borderRadius: 10, color: '#fff',
          fontWeight: 700, fontSize: '.85rem', padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {open ? 'Cancelar' : '+ Nuevo gasto'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ background: colors.bg[600], borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Concepto *</label>
            <input style={inputStyle} type="text" placeholder="¿Qué fue?" value={concepto} onChange={e => setConcepto(e.target.value)} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Importe € *</label>
              <input style={inputStyle} type="number" placeholder="0.00" step="0.01" min="0.01" value={importe} onChange={e => setImporte(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input style={inputStyle} type="date" value={fecha} max={today()} onChange={e => setFecha(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Categoría</label>
            <select style={{ ...inputStyle, appearance: 'none' }} value={categoria} onChange={e => setCategoria(e.target.value)}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Foto / ticket (opcional)</label>
            <input style={{ ...inputStyle, padding: '8px 12px' }} type="file" accept="image/*" onChange={handleFoto} />
            {fotoPreview && <img src={fotoPreview} alt="preview" style={{ marginTop: 8, width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${colors.border.default}` }} />}
          </div>
          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} placeholder="Información adicional..." value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting} style={{
            background: colors.primary.base, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700,
            fontSize: '.95rem', padding: 12, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit',
          }}>
            {submitting ? 'Enviando...' : 'Enviar gasto'}
          </button>
        </form>
      )}

      {misGastos.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.text[300], fontSize: '.9rem', marginTop: 32 }}>
          No has registrado ningún gasto todavía
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {misGastos.map((g: any) => {
            const thumbSrc = g.foto || (g.fotoPath ? signedUrls[g.id] : null)
            return (
            <div key={g.id} style={{ background: colors.bg[600], borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {thumbSrc && <img src={thumbSrc} alt="ticket" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${colors.border.default}` }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: colors.text[900], fontWeight: 600, fontSize: '.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.concepto}</span>
                  <span style={{ color: colors.text[900], fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>€{fmt(g.importe)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ ...categoriaBadgeStyle(), borderRadius: 6, padding: '2px 8px', fontSize: '.72rem', fontWeight: 700, textTransform: 'capitalize' }}>{g.categoria}</span>
                  <span style={{ ...estadoBadgeStyle(g.estado), borderRadius: 6, padding: '2px 8px', fontSize: '.72rem', fontWeight: 700, textTransform: 'capitalize' }}>{g.estado}</span>
                  <span style={{ color: colors.text[300], fontSize: '.75rem', marginLeft: 'auto' }}>{g.fecha}</span>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {misGastos.length > 0 && (
        <div style={{ marginTop: 20, background: colors.bg[600], borderRadius: 12, padding: '12px 16px', color: colors.text[500], fontSize: '.85rem', textAlign: 'center' }}>
          Este mes:{' '}
          <span style={{ color: colors.semantic.green, fontWeight: 700 }}>€{fmt(aprobadosMes)} aprobados</span>
          {' · '}
          <span style={{ color: colors.semantic.orange, fontWeight: 700 }}>€{fmt(pendientesMes)} pendientes</span>
        </div>
      )}
    </div>
  )
}
