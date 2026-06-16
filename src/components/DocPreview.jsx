import { fds, ftime, mhm, calcMin } from '../utils/time.js'

export function DocPreview({ d, db, empId }) {
  if (d.fileData) {
    const isPdf = d.fileData.startsWith('data:application/pdf')
    return isPdf
      ? <iframe src={d.fileData} title={d.titulo} style={{ width:'100%', height:'50vh', border:'1px solid var(--border)', borderRadius:8, background:'#fff' }} />
      : <img src={d.fileData} alt={d.titulo} style={{ width:'100%', maxHeight:'50vh', objectFit:'contain', borderRadius:8, border:'1px solid var(--border)', background:'#fff' }} />
  }
  if (d.url) {
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
