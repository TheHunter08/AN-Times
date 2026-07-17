import { useState, useEffect, useRef } from 'react'
import { fds, ftime, mhm, calcMin, localDateStr } from '../utils/time.js'

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)' },
  text: { 900: 'var(--text-primary)', 700: 'var(--text-secondary)', 500: 'var(--text-tertiary)' },
  border: { default: 'var(--border-default)' },
}
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)' }

function useBlobUrl(dataUrl) {
  const [blobUrl, setBlobUrl] = useState(null)
  const urlRef = useRef(null)
  useEffect(() => {
    if (!dataUrl || !dataUrl.startsWith('data:')) { setBlobUrl(null); return }
    try {
      const [header, b64] = dataUrl.split(',')
      const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setBlobUrl(url)
    } catch { setBlobUrl(null) }
    return () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null } }
  }, [dataUrl])
  return blobUrl
}

function PdfViewer({ blobUrl, title }) {
  const [failed, setFailed] = useState(false)

  const openPdf = () => { if (blobUrl) window.open(blobUrl, '_blank') }
  const downloadPdf = () => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = (title || 'documento') + '.pdf'
    a.click()
  }

  if (failed || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    return (
      <div style={{ width:'100%', padding:'24px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, background: colors.bg[600], borderRadius: radius.sm, border:`1px solid ${colors.border.default}` }}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={colors.primary.light} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <div style={{ fontSize:13, fontWeight:600, color: colors.text[700], textAlign:'center' }}>{title || 'Documento PDF'}</div>
        <div style={{ display:'flex', gap:8, width:'100%', maxWidth:280 }}>
          <button onClick={openPdf} style={{ flex:1, padding:'10px 12px', fontSize:12, fontWeight:700, background: colors.primary.base, color:'#fff', border:'none', borderRadius: radius.md, cursor:'pointer', fontFamily:'inherit' }}>
            Abrir PDF
          </button>
          <button onClick={downloadPdf} style={{ flex:1, padding:'10px 12px', fontSize:12, fontWeight:700, background: colors.bg[400], color: colors.text[700], border:`1px solid ${colors.border.default}`, borderRadius: radius.md, cursor:'pointer', fontFamily:'inherit' }}>
            Descargar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position:'relative' }}>
      <iframe
        src={blobUrl}
        title={title}
        onError={() => setFailed(true)}
        onLoad={(e) => {
          try {
            const doc = e.target.contentDocument
            if (doc && doc.body && doc.body.children.length === 0 && doc.body.innerText === '') setFailed(true)
          } catch {}
        }}
        style={{ width:'100%', height:'50vh', border:`1px solid ${colors.border.default}`, borderRadius: radius.sm, background: '#fff' }}
      />
      <button onClick={openPdf} style={{ position:'absolute', top:8, right:8, padding:'5px 10px', fontSize:11, fontWeight:600, background:'rgba(0,0,0,.7)', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', backdropFilter:'blur(4px)', fontFamily:'inherit' }}>
        ↗ Abrir
      </button>
    </div>
  )
}

export function DocPreview({ d, db, empId }) {
  const blobUrl = useBlobUrl(d.fileData)

  if (d.fileData) {
    const isPdf = d.fileData.startsWith('data:application/pdf')
    if (isPdf) {
      return blobUrl
        ? <PdfViewer blobUrl={blobUrl} title={d.titulo} />
        : <div style={{ width:'100%', height:'50vh', display:'flex', alignItems:'center', justifyContent:'center', background: colors.bg[600], borderRadius: radius.sm, border:`1px solid ${colors.border.default}`, color: colors.text[500], fontSize:13 }}>Cargando documento…</div>
    }
    // Imagen — mostrar previsualización + botón de descarga
    const mime = d.fileData.split(';')[0].split(':')[1] || 'image/jpeg'
    const ext = mime === 'image/png' ? '.png' : mime === 'image/gif' ? '.gif' : '.jpg'
    const imgName = ((d.fileName || d.titulo || 'imagen').replace(/\.[^.]+$/, '')) + ext
    const downloadImg = () => {
      const a = document.createElement('a')
      a.href = d.fileData
      a.download = imgName
      a.click()
    }
    return (
      <div>
        <img src={d.fileData} alt={d.titulo} style={{ width:'100%', maxHeight:'50vh', objectFit:'contain', borderRadius: radius.sm, border:`1px solid ${colors.border.default}`, background:'#fff', display:'block' }} />
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <button onClick={() => window.open(d.fileData, '_blank')}
            style={{ flex:1, padding:'9px 12px', fontSize:12, fontWeight:700, background: colors.bg[400], color: colors.text[700], border:`1px solid ${colors.border.default}`, borderRadius: radius.md, cursor:'pointer', fontFamily:'inherit' }}>
            ↗ Abrir
          </button>
          <button onClick={downloadImg}
            style={{ flex:1, padding:'9px 12px', fontSize:12, fontWeight:700, background: colors.primary.base, color:'#fff', border:'none', borderRadius: radius.md, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar
          </button>
        </div>
      </div>
    )
  }
  if (d.url) {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isPdfUrl = d.url.toLowerCase().includes('.pdf') || d.url.includes('application%2Fpdf')
    if (isIOS || isPdfUrl) {
      return (
        <div style={{ width:'100%', padding:'24px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, background: colors.bg[600], borderRadius: radius.sm, border:`1px solid ${colors.border.default}` }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={colors.primary.light} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style={{ fontSize:13, fontWeight:600, color: colors.text[700], textAlign:'center' }}>{d.titulo || 'Documento'}</div>
          <div style={{ display:'flex', gap:8, width:'100%', maxWidth:280 }}>
            <a href={d.url} target="_blank" rel="noreferrer" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'10px 12px', fontSize:12, fontWeight:700, background: colors.primary.base, color:'#fff', borderRadius: radius.md, textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              Abrir
            </a>
            <a href={d.url} download={d.titulo || 'documento'} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'10px 12px', fontSize:12, fontWeight:700, background: colors.bg[400], color: colors.text[700], border:`1px solid ${colors.border.default}`, borderRadius: radius.md, textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              Descargar
            </a>
          </div>
        </div>
      )
    }
    return <iframe src={d.url} title={d.titulo} sandbox="allow-same-origin allow-scripts allow-popups" style={{ width:'100%', height:'50vh', border:`1px solid ${colors.border.default}`, borderRadius: radius.sm, background:'#fff' }} />
  }
  if (d.tipo === 'jornada' && d.mes) {
    // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(d.mes)): inicio se guarda
    // en UTC, d.mes es local — un fichaje nocturno se quedaba fuera del informe del mes.
    const recs = (db.records || []).filter(r => r.empId === empId && r.fin && r.inicio && localDateStr(new Date(r.inicio)).startsWith(d.mes)).sort((a,b) => (a.inicio||'').localeCompare(b.inicio||''))
    const total = recs.reduce((s, r) => s + calcMin(r), 0)
    return (
      <div style={{ maxHeight:'50vh', overflowY:'auto', border:`1px solid ${colors.border.default}`, borderRadius: radius.sm }}>
        <table className="adm-table" style={{ fontSize:12 }}>
          <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead>
          <tbody>
            {recs.map(r => (
              <tr key={r.id}>
                <td>{fds(r.inicio)}</td>
                <td>{ftime(r.inicio)}</td>
                <td>{ftime(r.fin)}</td>
                <td style={{ fontWeight:700 }}>{mhm(calcMin(r))}</td>
              </tr>
            ))}
            {!recs.length && <tr><td colSpan={4} className="empty">Sin fichajes este mes</td></tr>}
          </tbody>
        </table>
        <div style={{ padding:'10px 14px', fontWeight:700, borderTop:`1px solid ${colors.border.default}` }}>Total: {mhm(total)}</div>
      </div>
    )
  }
  return <div className="empty">Sin contenido adjunto</div>
}
