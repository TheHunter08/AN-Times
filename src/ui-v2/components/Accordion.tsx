import { useState } from 'react'
import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export interface AccordionItem {
  id: string
  title: ReactNode
  content: ReactNode
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const isOpen = item.id === openId
        return (
          <div key={item.id} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.md, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: colors.text[900],
              }}
            >
              {item.title}
              <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: transition(['transform']) }}>⌄</span>
            </button>
            {isOpen && <div style={{ padding: '0 16px 16px', fontSize: 13, color: colors.text[700] }}>{item.content}</div>}
          </div>
        )
      })}
    </div>
  )
}
