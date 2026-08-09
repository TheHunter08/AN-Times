import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { colors } from '../design-system/colors'
import { IconArrowRight, IconSearch, IconTrendUp, IconX } from './Icons.js'

export interface CommandCenterCommand {
  id: string
  label: string
  detail: string
  group: string
  keywords?: string
  badge?: number
  icon?: ReactNode
  run: () => void
}

interface OperationalSignal {
  id: string
  label: string
  value: number
  detail: string
  page: string
  tone: string
}

interface OperationalPulse {
  score: number
  level: string
  tone: string
  signals: OperationalSignal[]
  nextAction: { label: string; detail: string; page: string }
  reviewEstimate: string
  explanation: string
}

interface CommandCenterProps {
  visible: boolean
  commands: CommandCenterCommand[]
  pulse: OperationalPulse
  onClose: () => void
  onNavigate: (page: string) => void
}

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export function CommandCenter({ visible, commands, pulse, onClose, onNavigate }: CommandCenterProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogA11y(visible, onClose)

  const matches = useMemo(() => {
    const needle = fold(query.trim())
    if (!needle) return commands.slice(0, 12)
    return commands.filter(command => fold(`${command.label} ${command.detail} ${command.group} ${command.keywords || ''}`).includes(needle)).slice(0, 18)
  }, [commands, query])

  useEffect(() => {
    if (!visible) return
    setQuery('')
    setSelected(0)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
    }
  }, [visible])

  useEffect(() => setSelected(0), [query])

  if (!visible) return null

  const run = (command: CommandCenterCommand) => {
    command.run()
    onClose()
  }

  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected(value => Math.min(value + 1, Math.max(0, matches.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected(value => Math.max(0, value - 1))
    } else if (event.key === 'Enter' && matches[selected]) {
      event.preventDefault()
      run(matches[selected])
    }
  }

  const navigate = (page: string) => {
    onNavigate(page)
    onClose()
  }

  return (
    <div className="ti-command-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="ti-command-center" role="dialog" aria-modal="true" aria-labelledby="ti-command-title" tabIndex={-1}>
        <header className="ti-command-head">
          <div>
            <span className="ti-command-eyebrow"><IconTrendUp width={13} height={13} /> Nexo operativo · motor local</span>
            <h2 id="ti-command-title">Centro de mando</h2>
          </div>
          <button type="button" className="ti-command-close" onClick={onClose} aria-label="Cerrar centro de mando"><IconX /></button>
        </header>

        <div className="ti-command-pulse">
          <div className={`ti-command-score is-${pulse.tone}`} aria-label={`Pulso operativo ${pulse.score} de 100, ${pulse.level}`}>
            <strong>{pulse.score}</strong><span>/100</span>
          </div>
          <div className="ti-command-pulse-copy">
            <span>Pulso operativo · {pulse.level}</span>
            <strong>{pulse.nextAction.label}</strong>
            <small>{pulse.nextAction.detail}</small>
          </div>
          <button type="button" className="ti-command-next" onClick={() => navigate(pulse.nextAction.page)}>
            Resolver ahora <IconArrowRight width={15} height={15} />
          </button>
        </div>

        <div className="ti-command-signals" aria-label="Señales operativas">
          {pulse.signals.map(signal => (
            <button type="button" key={signal.id} onClick={() => navigate(signal.page)}>
              <span className={`ti-command-dot is-${signal.tone}`} />
              <span><strong>{signal.value}</strong>{signal.label}</span>
              <small>{signal.detail}</small>
            </button>
          ))}
        </div>

        <div className="ti-command-search">
          <IconSearch width={18} height={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleKeys}
            placeholder="Ir a una sección, empleado o acción…"
            aria-label="Buscar comandos"
            aria-controls="ti-command-results"
            aria-activedescendant={matches[selected] ? `ti-command-${matches[selected].id}` : undefined}
          />
          <kbd>ESC</kbd>
        </div>

        <div id="ti-command-results" className="ti-command-results" role="listbox" aria-label="Comandos disponibles">
          {matches.map((command, index) => (
            <button
              type="button"
              id={`ti-command-${command.id}`}
              role="option"
              aria-selected={selected === index}
              className={selected === index ? 'is-selected' : ''}
              key={command.id}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(command)}
            >
              <span className="ti-command-icon">{command.icon || <IconArrowRight width={16} height={16} />}</span>
              <span className="ti-command-label"><strong>{command.label}</strong><small>{command.detail}</small></span>
              {command.badge ? <span className="ti-command-badge">{command.badge}</span> : null}
              <span className="ti-command-group">{command.group}</span>
            </button>
          ))}
          {!matches.length && <div className="ti-command-empty">No hay coincidencias. Prueba con “horas”, “equipo” o un nombre.</div>}
        </div>

        <footer className="ti-command-footer">
          <span>{pulse.reviewEstimate}</span>
          <span title={pulse.explanation}>Cálculo explicable · sin enviar datos</span>
        </footer>
      </section>
      <style>{`
        .ti-command-layer{position:fixed;inset:0;z-index:1200;display:grid;place-items:start center;padding:clamp(18px,8vh,74px) 16px;background:rgba(2,4,10,.72);backdrop-filter:blur(12px);animation:ti-command-in 160ms ease-out}
        .ti-command-center{width:min(820px,100%);max-height:min(760px,calc(100dvh - 36px));display:flex;flex-direction:column;overflow:hidden;border:1px solid ${colors.border.default};border-radius:20px;background:${colors.bg[700]};color:${colors.text[900]};box-shadow:0 28px 90px rgba(0,0,0,.48),0 0 0 1px ${colors.primary.glow};outline:none}
        .ti-command-head{display:flex;align-items:flex-start;justify-content:space-between;padding:22px 24px 15px}.ti-command-head h2{margin:5px 0 0;font-size:22px;letter-spacing:-.04em}.ti-command-eyebrow{display:flex;align-items:center;gap:6px;color:${colors.primary.light};font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.ti-command-close{display:grid;place-items:center;width:34px;height:34px;border:1px solid ${colors.border.subtle};border-radius:10px;background:${colors.bg[600]};color:${colors.text[600]};cursor:pointer}
        .ti-command-pulse{margin:0 18px 14px;padding:16px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;border:1px solid ${colors.primary.glow};border-radius:15px;background:linear-gradient(100deg,${colors.primary.dim},transparent 70%)}.ti-command-score{width:66px;height:66px;display:grid;place-content:center;text-align:center;border-radius:50%;border:2px solid ${colors.primary.base};background:${colors.bg[800]}}.ti-command-score strong{font-size:21px;line-height:1}.ti-command-score span{font-size:9px;color:${colors.text[500]}}.ti-command-score.is-green{border-color:${colors.semantic.green}}.ti-command-score.is-orange{border-color:${colors.semantic.orange}}.ti-command-score.is-red{border-color:${colors.semantic.red}}.ti-command-pulse-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.ti-command-pulse-copy>span{font-size:10px;font-weight:750;color:${colors.text[500]};text-transform:uppercase;letter-spacing:.06em}.ti-command-pulse-copy strong{font-size:15px}.ti-command-pulse-copy small{color:${colors.text[600]};line-height:1.35}.ti-command-next{display:flex;align-items:center;gap:6px;padding:9px 12px;border:1px solid ${colors.primary.glow};border-radius:10px;background:${colors.primary.base};color:white;font:700 11px inherit;cursor:pointer}
        .ti-command-signals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 18px 14px}.ti-command-signals button{text-align:left;min-width:0;padding:11px;border:1px solid ${colors.border.subtle};border-radius:12px;background:${colors.bg[600]};color:${colors.text[700]};cursor:pointer}.ti-command-signals button:hover{border-color:${colors.border.default};background:${colors.bg[500]}}.ti-command-signals button>span:nth-child(2){display:flex;align-items:baseline;gap:6px;font-size:10px}.ti-command-signals strong{font-size:17px;color:${colors.text[900]}}.ti-command-signals small{display:block;margin-top:4px;color:${colors.text[500]};font-size:9px;line-height:1.25}.ti-command-dot{display:block;width:6px;height:6px;margin-bottom:7px;border-radius:50%;background:${colors.primary.base};box-shadow:0 0 9px currentColor}.ti-command-dot.is-green{background:${colors.semantic.green}}.ti-command-dot.is-orange{background:${colors.semantic.orange}}.ti-command-dot.is-red{background:${colors.semantic.red}}
        .ti-command-search{margin:0 18px;display:flex;align-items:center;gap:10px;padding:0 13px;border:1px solid ${colors.border.default};border-radius:12px;background:${colors.bg[800]};color:${colors.text[500]}}.ti-command-search:focus-within{border-color:${colors.primary.base};box-shadow:0 0 0 3px ${colors.primary.glow}}.ti-command-search input{width:100%;height:46px;border:0;outline:0;background:transparent;color:${colors.text[900]};font:500 14px inherit}.ti-command-search input::placeholder{color:${colors.text[400]}}.ti-command-search kbd{padding:3px 6px;border:1px solid ${colors.border.default};border-radius:5px;color:${colors.text[500]};font-size:8px;background:${colors.bg[600]}}
        .ti-command-results{min-height:86px;overflow:auto;padding:9px 18px 12px}.ti-command-results>button{width:100%;display:grid;grid-template-columns:32px 1fr auto auto;align-items:center;gap:10px;padding:9px;border:0;border-radius:10px;background:transparent;color:${colors.text[700]};font:inherit;text-align:left;cursor:pointer}.ti-command-results>button.is-selected{background:${colors.primary.dim};color:${colors.text[900]}}.ti-command-icon{display:grid;place-items:center;width:32px;height:32px;border:1px solid ${colors.border.subtle};border-radius:9px;background:${colors.bg[600]};color:${colors.primary.light}}.ti-command-label{min-width:0;display:flex;flex-direction:column;gap:2px}.ti-command-label strong{font-size:12px}.ti-command-label small{overflow:hidden;color:${colors.text[500]};font-size:10px;text-overflow:ellipsis;white-space:nowrap}.ti-command-group{color:${colors.text[400]};font-size:9px;text-transform:uppercase;letter-spacing:.04em}.ti-command-badge{min-width:21px;padding:3px 6px;border-radius:10px;background:${colors.semantic.orange};color:#fff;font-size:9px;font-weight:800;text-align:center}.ti-command-empty{padding:25px;text-align:center;color:${colors.text[500]};font-size:12px}
        .ti-command-footer{display:flex;justify-content:space-between;gap:12px;padding:10px 20px;border-top:1px solid ${colors.border.subtle};color:${colors.text[400]};font-size:9px}.ti-command-footer span:last-child{color:${colors.primary.light}}
        @keyframes ti-command-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
        @media(max-width:680px){.ti-command-layer{padding:8px}.ti-command-center{max-height:calc(100dvh - 16px);border-radius:16px}.ti-command-head{padding:18px 16px 12px}.ti-command-pulse{grid-template-columns:auto 1fr;margin:0 10px 10px;padding:12px}.ti-command-next{grid-column:1/-1;justify-content:center}.ti-command-signals{grid-template-columns:repeat(2,1fr);padding:0 10px 10px}.ti-command-search{margin:0 10px}.ti-command-results{padding:8px 10px}.ti-command-group{display:none}.ti-command-results>button{grid-template-columns:32px 1fr auto}.ti-command-footer{padding:9px 12px}.ti-command-footer span:last-child{display:none}}
        @media(prefers-reduced-motion:reduce){.ti-command-layer{animation:none}}
      `}</style>
    </div>
  )
}
