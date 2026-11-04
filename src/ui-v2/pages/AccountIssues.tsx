import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Search } from '../components/Search.js'
import { ProductState } from '../components/ProductState.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconShield, IconMail, IconUsers } from '../components/Icons.js'

export type AccountIssueType = 'sin_correo' | 'correo_duplicado' | 'sin_identidad' | 'identidad_duplicada'

export interface AccountIssueItem {
  id: string
  name: string
  dept: string
  baja: boolean
  issues: AccountIssueType[]
}

export interface AccountIssuesProps {
  items: AccountIssueItem[]
  onOpen?: (item: AccountIssueItem) => void
}

const issueLabel: Record<AccountIssueType, { label: string; hint: string; tone: 'red' | 'orange' }> = {
  sin_correo: { label: 'Sin correo', hint: 'No tiene un correo de acceso válido configurado.', tone: 'orange' },
  correo_duplicado: { label: 'Correo duplicado', hint: 'Otro empleado usa el mismo correo de acceso.', tone: 'red' },
  sin_identidad: { label: 'Sin identidad vinculada', hint: 'Todavía no tiene una cuenta de acceso (Auth) activada o confirmada.', tone: 'orange' },
  identidad_duplicada: { label: 'Identidad duplicada', hint: 'Su cuenta de acceso (Auth) está vinculada a más de un empleado — requiere revisión manual.', tone: 'red' },
}

// Antes solo se podía ver CUÁNTAS cuentas tenían un problema (contador en
// Operaciones) o averiguar CUÁLES con un script CLI (scripts/
// audit-launch-readiness.mjs) — esta pantalla muestra el detalle en el panel.
export function AccountIssues({ items, onOpen }: AccountIssuesProps) {
  const [search, setSearch] = useState('')
  const filtered = items.filter(i => (i.name + i.dept).toLowerCase().includes(search.toLowerCase()))
  const duplicates = items.filter(i => i.issues.includes('correo_duplicado') || i.issues.includes('identidad_duplicada')).length
  const missing = items.filter(i => i.issues.includes('sin_correo') || i.issues.includes('sin_identidad')).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Cuentas con incidencia</PageTitle>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: colors.text[500] }}>Correos o identidades de acceso (Auth) huérfanas o duplicadas — necesario resolverlas antes de activar el acceso seguro para todos.</p>
        </div>
        <Search placeholder="Buscar empleado…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Cuentas afectadas', value: String(items.length), color: colors.text[700], bg: colors.bg[600], icon: <IconShield width={15} height={15} /> },
          { label: 'Duplicadas', value: String(duplicates), color: colors.semantic.red, bg: 'rgba(239,68,68,.10)', icon: <IconUsers width={15} height={15} /> },
          { label: 'Sin correo o identidad', value: String(missing), color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)', icon: <IconMail width={15} height={15} /> },
        ].map((k, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.text[500], marginBottom: 4 }}>{k.icon}{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, letterSpacing: '-.5px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <ProductState icon={<IconShield />} compact title={items.length === 0 ? 'Sin incidencias de cuenta' : 'No encontramos ninguna'} description={items.length === 0 ? 'Todos los empleados tienen un correo e identidad de acceso válidos y sin duplicar.' : 'Prueba con otra búsqueda.'} />
        )}
        {filtered.map(item => (
          <div
            key={item.id}
            role="button" tabIndex={0}
            onClick={() => onOpen?.(item)}
            onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && onOpen) { event.preventDefault(); onOpen(item) } }}
            aria-label={`${item.name}: ${item.issues.map(issue => issueLabel[issue].label).join(', ')}. Abrir perfil`}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: radius.md,
              background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, cursor: onOpen ? 'pointer' : 'default',
            }}
          >
            <Avatar name={item.name} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{item.name}</span>
                {item.baja && <Badge tone="gray">Baja</Badge>}
                {item.issues.map(issue => {
                  const meta = issueLabel[issue]
                  return (
                    <span key={issue} title={meta.hint} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: radius.pill, background: meta.tone === 'red' ? 'rgba(239,68,68,.14)' : 'rgba(245,158,11,.14)', color: meta.tone === 'red' ? colors.semantic.red : colors.semantic.orange, fontWeight: 700 }}>
                      {meta.label}
                    </span>
                  )
                })}
              </div>
              {item.dept && <div style={{ fontSize: 12, color: colors.text[500], marginTop: 3 }}>{item.dept}</div>}
            </div>
            {onOpen && <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary.light, flexShrink: 0 }}>Revisar →</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
