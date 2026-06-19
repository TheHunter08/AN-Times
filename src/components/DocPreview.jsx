import { useState, useEffect, useRef } from 'react'
import { fds, ftime, mhm, calcMin } from '../utils/time.js'

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
      <div style={{ width:'100%', padding:'24px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)' }}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--primary-light)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)', textAlign:'center' }}>{title || 'Documento PDF'}</div>
        <div style={{ display:'flex', gap:8, width:'100%', maxWidth:280 }}>
          <button onClick={openPdf} style={{ flex:1, padding:'10px 12px', fontSize:12, fontWeight:700, background:'var(--primary)', color:'#fff', border:'none', borderRadius:'var(--r)', cursor:'pointer' }}>
            Abrir PDF
          </button>
          <button onClick={downloadPdf} style={{ flex:1, padding:'10px 12px', fontSize:12, fontWeight:700, background:'var(--bg-400)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--r)', cursor:'pointer' }}>
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
        style={{ width:'100%', height:'50vh', border:'1px solid var(--border)', borderRadius:8, background:'#fff' }}
      />
      <button onClick={openPdf} style={{ position:'absolute', top:8, right:8, padding:'5px 10px', fontSize:11, fontWeight:600, background:'rgba(0,0,0,.7)', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', backdropFilter:'blur(4px)' }}>
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
        : <div style={{ width:'100%', height:'50vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)', color:'var(--text3)', fontSize:13 }}>Cargando documento…</div>
    }
    return <img src={d.fileData} alt={d.titulo} style={{ width:'100%', maxHeight:'50vh', objectFit:'contain', borderRadius:8, border:'1px solid var(--border)', background:'#fff' }} />
  }
  if (d.url) {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isPdfUrl = d.url.toLowerCase().includes('.pdf') || d.url.includes('application%2Fpdf')
    if (isIOS || isPdfUrl) {
      return (
        <div style={{ width:'100%', padding:'24px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)' }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--primary-light)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)', textAlign:'center' }}>{d.titulo || 'Documento'}</div>
          <div style={{ display:'flex', gap:8, width:'100%', maxWidth:280 }}>
            <a href={d.url} target="_blank" rel="noreferrer" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'10px 12px', fontSize:12, fontWeight:700, background:'var(--primary)', color:'#fff', borderRadius:'var(--r)', textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              Abrir
            </a>
            <a href={d.url} download={d.titulo || 'documento'} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'10px 12px', fontSize:12, fontWeight:700, background:'var(--bg-400)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--r)', textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              Descargar
            </a>
          </div>
        </div>
      )
    }
    return <iframe src={d.url} title={d.titulo} style={{ width:'100%', height:'50vh', border:'1px solid var(--border)', borderRadius:8, background:'#fff' }} />
  }
  if (d.tipo === 'jornada' && d.mes) {
    const recs = (db.records || []).filter(r => r.empId === empId && r.fin && r.inicio.startsWith(d.mes)).sort((a,b) => a.inicio.localeCompare(b.inicio))
    const total = recs.reduce((s, r) => s + calcMin(r), 0)
    return (
      <div style={{ maxHeight:'50vh', overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
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
        <div style={{ padding:'10px 14px', fontWeight:700, borderTop:'1px solid var(--border)' }}>Total: {mhm(total)}</div>
      </div>
    )
  }
  return <div className="empty">Sin contenido adjunto</div>
}
