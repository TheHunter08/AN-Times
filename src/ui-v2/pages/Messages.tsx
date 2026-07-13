import { useState, useRef, useEffect } from 'react'
import { Avatar } from '../components/Avatar.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconSend, IconSearch, IconChat } from '../components/Icons.js'

export interface DemoMessage {
  id: string
  from: 'admin' | 'emp'
  text: string
  time: string
}

export interface DemoConversation {
  empId: string
  empName: string
  dept: string
  unread: number
  lastMessage: string
  lastTime: string
  messages: DemoMessage[]
  online?: boolean
}

export interface MessagesProps {
  conversations: DemoConversation[]
  adminName?: string
  onSend?: (empId: string, text: string) => void
}

export function Messages({ conversations, onSend }: MessagesProps) {
  const [selId, setSelId]   = useState(conversations[0]?.empId ?? null)
  const [text, setText]     = useState('')
  const [msgs, setMsgs]     = useState<Record<string, DemoMessage[]>>(
    () => Object.fromEntries(conversations.map(c => [c.empId, c.messages]))
  )
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const sel     = conversations.find(c => c.empId === selId)
  const selMsgs = selId ? (msgs[selId] ?? []) : []
  const filtered = conversations.filter(c =>
    (c.empName + c.dept).toLowerCase().includes(search.toLowerCase())
  )
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selId, selMsgs.length])

  const send = () => {
    const t = text.trim()
    if (!t || !selId) return
    const msg: DemoMessage = { id: Date.now().toString(), from: 'admin', text: t, time: 'Ahora' }
    setMsgs(prev => ({ ...prev, [selId]: [...(prev[selId] ?? []), msg] }))
    onSend?.(selId, t)
    setText('')
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 21, fontWeight: 600, color: colors.text[900], letterSpacing: '-.4px' }}>Mensajes</div>
            {totalUnread > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: radius.pill, background: colors.primary.base, color: '#fff', fontSize: 11, fontWeight: 800 }}>
                {totalUnread}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: colors.text[400], marginTop: 3 }}>Chat interno con el equipo</div>
        </div>
      </div>

      {/* Chat panel */}
      <div style={{
        display: 'flex', flex: 1, minHeight: 540,
        borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}`,
        overflow: 'hidden', background: colors.bg[700],
        boxShadow: '0 4px 24px rgba(0,0,0,.25)',
      }}>

        {/* LEFT: conversation list */}
        <div style={{ width: 270, flexShrink: 0, borderRight: `1px solid ${colors.border.subtle}`, display: 'flex', flexDirection: 'column', background: colors.bg[800] }}>
          {/* Search */}
          <div style={{ padding: '14px 12px 8px' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: colors.text[400], display: 'flex', pointerEvents: 'none' }}>
                <IconSearch width={13} height={13} />
              </span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversación…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8,
                  borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`,
                  background: colors.bg[700], color: colors.text[900],
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(c => {
              const isActive = selId === c.empId
              return (
                <button
                  key={c.empId}
                  onClick={() => setSelId(c.empId)}
                  className="uiv2-msg-conv-btn"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    background: isActive ? colors.bg[600] : 'transparent',
                    borderLeft: `3px solid ${isActive ? colors.primary.base : 'transparent'}`,
                    transition: 'all .12s',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={c.empName} size={38} />
                    {c.online && (
                      <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: colors.semantic.green, border: `2px solid ${colors.bg[800]}` }} />
                    )}
                    {c.unread > 0 && (
                      <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, background: colors.primary.base, color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${colors.bg[800]}` }}>{c.unread}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: c.unread > 0 ? 800 : 600, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.empName}</span>
                      <span style={{ fontSize: 10, color: colors.text[300], flexShrink: 0 }}>{c.lastTime}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: c.unread > 0 ? colors.text[600] : colors.text[400], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2, fontWeight: c.unread > 0 ? 600 : 400 }}>
                      {c.lastMessage}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT: chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {sel ? (
            <>
              {/* Chat header */}
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.border.subtle}`, display: 'flex', alignItems: 'center', gap: 12, background: colors.bg[700] }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={sel.empName} size={36} />
                  {sel.online && (
                    <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: colors.semantic.green, border: `2px solid ${colors.bg[700]}` }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: colors.text[900], letterSpacing: '-.2px' }}>{sel.empName}</div>
                  <div style={{ fontSize: 11.5, color: sel.online ? colors.semantic.green : colors.text[400], marginTop: 1 }}>
                    {sel.online ? '● En línea' : sel.dept}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 8, background: `linear-gradient(180deg, ${colors.bg[800]} 0%, ${colors.bg[700]} 100%)` }}>
                {selMsgs.map((m, i) => {
                  const isAdmin = m.from === 'admin'
                  const prevFrom = i > 0 ? selMsgs[i-1].from : null
                  const grouped = prevFrom === m.from
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 8 }}>
                      {!isAdmin && !grouped && (
                        <div style={{ width: 28, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end', marginBottom: 4 }}>
                          <Avatar name={sel.empName} size={24} />
                        </div>
                      )}
                      {!isAdmin && grouped && <div style={{ width: 36, flexShrink: 0 }} />}
                      <div style={{
                        maxWidth: '68%',
                        padding: '10px 14px',
                        borderRadius: isAdmin
                          ? `${radius.lg} ${radius.sm} ${radius.sm} ${radius.lg}`
                          : `${radius.sm} ${radius.lg} ${radius.lg} ${radius.sm}`,
                        background: isAdmin
                          ? colors.gradients.brand
                          : colors.bg[500],
                        color: isAdmin ? '#fff' : colors.text[900],
                        fontSize: 13.5, lineHeight: 1.55,
                        boxShadow: isAdmin ? '0 6px 18px var(--uiv2-primary-glow)' : '0 2px 8px rgba(0,0,0,.16)',
                      }}>
                        {m.text}
                        <div style={{ fontSize: 10, opacity: .65, marginTop: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.time}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.border.subtle}`, display: 'flex', gap: 10, alignItems: 'flex-end', background: colors.bg[700] }}>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Escribe un mensaje… (Enter para enviar)"
                  rows={1}
                  style={{
                    flex: 1, resize: 'none',
                    padding: '10px 14px', borderRadius: radius.lg,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.bg[600], color: colors.text[900],
                    fontSize: 13.5, fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
                    transition: 'border-color .15s',
                  }}
                  className="uiv2-msg-input"
                />
                <button
                  onClick={send}
                  disabled={!text.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 42, height: 42, borderRadius: radius.lg, border: 'none',
                    background: text.trim() ? colors.gradients.brand : colors.bg[500],
                    color: text.trim() ? '#fff' : colors.text[300],
                    cursor: text.trim() ? 'pointer' : 'default',
                    flexShrink: 0, transition: 'all .15s',
                    boxShadow: text.trim() ? '0 6px 18px var(--uiv2-primary-glow)' : 'none',
                  }}
                >
                  <IconSend width={16} height={16} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: colors.text[400] }}>
              <div style={{ width: 56, height: 56, borderRadius: radius.xl, background: colors.primary.dim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary.light }}>
                <IconChat width={24} height={24} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[700] }}>Sin conversación seleccionada</div>
              <div style={{ fontSize: 12, color: colors.text[400] }}>Elige un empleado de la lista</div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .uiv2-msg-conv-btn:hover { background: ${colors.bg[600]} !important; }
        .uiv2-msg-input:focus { border-color: ${colors.primary.base} !important; }
      `}</style>
    </div>
  )
}
