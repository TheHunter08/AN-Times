import { useState } from 'react'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconFileText, IconDownload, IconPlus } from '../components/Icons.js'
import { ProductState } from '../components/ProductState.js'

export interface DocumentItem {
  id: string
  name: string
  category: 'contrato' | 'nomina' | 'certificado' | 'otro'
  empName: string
  size: string
  uploadedOn: string
  expiresOn?: string
  onDownload?: (id: string) => void
  onPreview?: (id: string) => void
}

export interface DocumentsProps {
  items: DocumentItem[]
  onUpload?: () => void
}

const catLabel: Record<DocumentItem['category'], string> = {
  contrato: 'Contrato', nomina: 'Nómina', certificado: 'Certificado', otro: 'Otro',
}
const catTone: Record<DocumentItem['category'], 'purple' | 'orange' | 'green' | 'gray'> = {
  contrato: 'purple', nomina: 'orange', certificado: 'green', otro: 'gray',
}
const catColor: Record<DocumentItem['category'], string> = {
  contrato: colors.primary.light,
  nomina:   colors.accent.base,
  certificado: colors.semantic.green,
  otro: colors.text[500],
}
const catBg: Record<DocumentItem['category'], string> = {
  contrato: colors.primary.dim,
  nomina: colors.accent.dim,
  certificado: 'rgba(16,185,129,.14)',
  otro: 'rgba(148,163,184,.10)',
}

export function Documents({ items, onUpload }: DocumentsProps) {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<DocumentItem['category'] | 'all'>('all')

  const filtered = items
    .filter(d => cat === 'all' || d.category === cat)
    .filter(d => (d.name + d.empName).toLowerCase().includes(search.toLowerCase()))

  const cats = ['all', 'contrato', 'nomina', 'certificado', 'otro'] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Documentos</PageTitle>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Search placeholder="Buscar documento o empleado…" value={search} onChange={e => setSearch(e.target.value)} />
          <Button size="md" icon={<IconPlus width={15} height={15} />} onClick={onUpload}>Subir documento</Button>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{
            padding: '5px 13px', borderRadius: radius.pill,
            border: `1px solid ${cat === c ? colors.primary.base : colors.border.subtle}`,
            background: cat === c ? colors.primary.dim : 'transparent',
            color: cat === c ? colors.primary.light : colors.text[500],
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {c === 'all' ? `Todos (${items.length})` : catLabel[c as DocumentItem['category']]}
          </button>
        ))}
      </div>

      {/* Document grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {filtered.map(doc => {
          const expiryDays = doc.expiresOn ? Math.ceil((new Date(`${doc.expiresOn}T23:59:59`).getTime() - Date.now()) / 86400000) : null
          const expiryColor = expiryDays !== null && expiryDays < 0 ? colors.semantic.red : expiryDays !== null && expiryDays <= 30 ? colors.semantic.orange : colors.text[300]
          return (
          <div key={doc.id} className="uiv2-document-card" onClick={() => doc.onPreview?.(doc.id)} style={{ borderRadius: radius.md, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color .15s, transform .15s', cursor:'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: radius.sm, background: catBg[doc.category], color: catColor[doc.category], flexShrink: 0 }}>
                <IconFileText width={17} height={17} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                <Badge tone={catTone[doc.category]}>{catLabel[doc.category]}</Badge>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: colors.text[500] }}>{doc.empName}</div>
            {doc.expiresOn && <div style={{ fontSize:11, fontWeight:650, color:expiryColor }}>{expiryDays !== null && expiryDays < 0 ? 'Documento caducado' : expiryDays !== null && expiryDays <= 30 ? `Caduca en ${expiryDays} días` : `Caduca el ${new Date(`${doc.expiresOn}T12:00:00`).toLocaleDateString('es-ES')}`}</div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: colors.text[300] }}>{doc.size} · {doc.uploadedOn}</span>
              <div style={{ display:'flex', gap:6 }}><button onClick={event => { event.stopPropagation(); doc.onPreview?.(doc.id) }} style={{ padding:'6px 9px', borderRadius:radius.xs, border:`1px solid ${colors.border.subtle}`, background:'transparent', color:colors.text[700], fontSize:11.5, cursor:'pointer' }}>Ver</button><button onClick={event => { event.stopPropagation(); doc.onDownload?.(doc.id) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: radius.xs, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <IconDownload width={12} height={12} /> Descargar
              </button></div>
            </div>
          </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1' }}><ProductState compact title="No encontramos documentos" description="Prueba con otra búsqueda o categoría." actionLabel={items.length === 0 ? 'Subir primer documento' : undefined} onAction={items.length === 0 ? onUpload : undefined} /></div>
        )}
      </div>
    </div>
  )
}
