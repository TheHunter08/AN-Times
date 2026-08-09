import { IconArrowRight, IconCheck, IconShield } from './Icons.js'
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'

interface ActivationStep {
  id: string
  title: string
  detail: string
  complete: boolean
  action: string | null
}

interface ActivationModel {
  steps: ActivationStep[]
  completed: number
  total: number
  progress: number
  ready: boolean
  summary: string
  next: ActivationStep | null
}

export function ActivationPath({ model, onAction }: { model: ActivationModel; onAction: (action: string) => void }) {
  return (
    <section className="employee-activation" aria-labelledby="employee-activation-title">
      <div className="employee-activation__head">
        <div className="employee-activation__score" style={{ background:`conic-gradient(${model.ready ? colors.semantic.green : colors.primary.base} ${model.progress}%, ${colors.border.subtle} 0)` }}>
          <span><strong>{model.progress}%</strong><small>protegida</small></span>
        </div>
        <div className="employee-activation__intro">
          <span><IconShield width={14} height={14} /> Ruta de activación</span>
          <h2 id="employee-activation-title">{model.summary}</h2>
          <p>{model.ready ? 'Tu perfil cumple todos los pasos de acceso y recuperación.' : 'Completa la ruta para disponer de recuperación, firma y avisos fiables.'}</p>
        </div>
        {model.next?.action && (
          <button type="button" className="employee-activation__continue" onClick={() => onAction(model.next!.action!)}>
            Continuar <IconArrowRight width={14} height={14} />
          </button>
        )}
      </div>

      <ol className="employee-activation__steps">
        {model.steps.map((step, index) => (
          <li key={step.id} data-complete={step.complete || undefined}>
            <span className="employee-activation__index" aria-hidden="true">{step.complete ? <IconCheck width={13} height={13} /> : index + 1}</span>
            <span className="employee-activation__copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
            {!step.complete && step.action && (
              <button type="button" onClick={() => onAction(step.action!)} aria-label={`Completar: ${step.title}`}>Abrir</button>
            )}
            {!step.complete && !step.action && <span className="employee-activation__admin">Requiere admin</span>}
          </li>
        ))}
      </ol>

      <footer><span>Diagnóstico local</span><span>Sin mostrar credenciales</span></footer>
      <style>{`
        .employee-activation{margin:0 16px;padding:18px;border:1px solid ${toneSoft(colors.primary.base,28)};border-radius:${radius['2xl']};background:linear-gradient(145deg,${toneSoft(colors.primary.base,11)},transparent 58%),var(--bg-card);box-shadow:var(--shadow-sm)}
        .employee-activation__head{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px}.employee-activation__score{width:66px;height:66px;display:grid;place-items:center;border-radius:50%}.employee-activation__score>span{width:56px;height:56px;display:grid;place-content:center;border-radius:50%;background:var(--bg-card);text-align:center}.employee-activation__score strong{display:block;color:${colors.text[900]};font-size:15px;line-height:1}.employee-activation__score small{margin-top:3px;color:${colors.text[500]};font-size:7px;text-transform:uppercase}.employee-activation__intro>span{display:flex;align-items:center;gap:6px;color:${colors.primary.light};font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.employee-activation__intro h2{margin:5px 0 3px;color:${colors.text[900]};font-size:15px;letter-spacing:-.03em}.employee-activation__intro p{margin:0;color:${colors.text[500]};font-size:9.5px;line-height:1.4}.employee-activation__continue{display:flex;align-items:center;gap:5px;padding:8px 10px;border:1px solid ${toneSoft(colors.primary.base,30)};border-radius:${radius.md};background:${colors.primary.base};color:#fff;font:700 10px inherit;cursor:pointer}
        .employee-activation__steps{margin:16px 0 0;padding:0;display:grid;gap:7px;list-style:none}.employee-activation__steps li{min-width:0;display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:9px;padding:9px;border:1px solid ${colors.border.subtle};border-radius:${radius.md};background:${colors.bg[600]}}.employee-activation__steps li[data-complete="true"]{opacity:.74}.employee-activation__index{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:${toneSoft(colors.primary.base,14)};color:${colors.primary.light};font-size:9px;font-weight:800}.employee-activation__steps li[data-complete="true"] .employee-activation__index{background:var(--success-soft);color:${colors.semantic.green}}.employee-activation__copy{min-width:0}.employee-activation__copy strong{display:block;color:${colors.text[800]};font-size:11px}.employee-activation__copy small{display:block;margin-top:2px;overflow:hidden;color:${colors.text[500]};font-size:8.5px;text-overflow:ellipsis;white-space:nowrap}.employee-activation__steps li>button{padding:5px 8px;border:1px solid ${colors.border.default};border-radius:${radius.sm};background:${colors.bg[500]};color:${colors.text[700]};font:700 9px inherit;cursor:pointer}.employee-activation__admin{color:${colors.semantic.orange};font-size:8px;font-weight:700}.employee-activation footer{display:flex;justify-content:space-between;margin-top:11px;padding-top:9px;border-top:1px solid ${colors.border.subtle};color:${colors.text[500]};font-size:8px}.employee-activation footer span:last-child{color:${colors.primary.light}}
        @media(max-width:430px){.employee-activation{padding:14px}.employee-activation__head{grid-template-columns:auto 1fr}.employee-activation__continue{grid-column:1/-1;justify-content:center}.employee-activation__copy small{white-space:normal;line-height:1.25}.employee-activation__steps li{grid-template-columns:25px 1fr auto}}
      `}</style>
    </section>
  )
}
