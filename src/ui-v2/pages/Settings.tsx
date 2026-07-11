import type { ReactNode } from 'react'
import { Card } from '../components/Card.js'
import { Input } from '../components/Input.js'
import { Button } from '../components/Button.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'

export interface SettingsSection {
  id: string
  title: string
  description?: string
  content: ReactNode
}

export interface SettingsProps {
  sections: SettingsSection[]
  onSave: () => void
  saving?: boolean
}

export function Settings({ sections, onSave, saving }: SettingsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PageTitle>Ajustes</PageTitle>
        <Button onClick={onSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
      </div>
      {sections.map(s => (
        <Card key={s.id} title={s.title}>
          {s.description && <div style={{ fontSize: 12, color: colors.text[500], marginBottom: 14 }}>{s.description}</div>}
          {s.content}
        </Card>
      ))}
    </div>
  )
}

// Ejemplo de campo reutilizable para secciones de ajustes.
export function SettingsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Input label={label} value={value} onChange={e => onChange(e.target.value)} />
}
