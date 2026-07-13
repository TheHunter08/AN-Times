import { useState } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconLock, IconMail, IconEye, IconEyeOff, IconClock, IconShield, IconDevice } from '../components/Icons.js'

export type LoginMode = 'pin' | 'email'

export interface EmpOption { id: string; name: string; dept?: string; pinLen?: number }

export interface LoginProps {
  // PIN
  employees?: EmpOption[]
  pin?: string
  selectedEmpId?: string
  onSelectEmp?: (id: string) => void
  onPinKey?: (k: string) => void
  onPinDel?: () => void
  pinError?: string
  pinShaking?: boolean
  pinLocked?: boolean
  bioAvailable?: boolean
  empHasBio?: boolean
  onBioLogin?: () => void
  bioLoading?: boolean
  // Email
  onLogin?: (email: string, password: string) => void
  onForgotPassword?: (email: string) => void
  resetLoading?: boolean
  emailLoading?: boolean
  emailError?: string
  // Mode
  mode?: LoginMode
  onSetMode?: (m: LoginMode) => void
  loading?: boolean
  error?: string
  online?: boolean
  lastSyncLabel?: string
}

const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export function Login({
  employees = [], pin = '', selectedEmpId = '', onSelectEmp, onPinKey, onPinDel,
  pinError, pinShaking, pinLocked, bioAvailable, empHasBio, onBioLogin, bioLoading,
  onLogin, onForgotPassword, resetLoading, emailLoading, emailError,
  mode = 'pin', onSetMode,
  loading, error, online = true, lastSyncLabel,
}: LoginProps) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin?.(email, password)
  }

  const selEmp = employees.find(e => e.id === selectedEmpId)
  const visibleEmployees = employees.length > 8 && !employeeSearch.trim()
    ? employees.filter(e => e.id === selectedEmpId)
    : employees.filter(e => `${e.name} ${e.dept || ''}`.toLocaleLowerCase('es').includes(employeeSearch.trim().toLocaleLowerCase('es')))
  const pinDotCount = Math.min(6, Math.max(4, selEmp?.pinLen || 4))

  return (
    <div className="v7-login-shell" style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      background: colors.bg[900], position: 'relative', overflow: 'hidden',
      fontFamily: 'Inter, SF Pro Display, -apple-system, sans-serif',
    }}>
      {/* Glows de fondo */}
      <div className="uiv2-login-glow-a" style={{
        position: 'absolute', top: -160, left: -160, width: 520, height: 520,
        borderRadius: '50%', background: 'var(--uiv2-primary-dim)', filter: 'blur(110px)', pointerEvents: 'none',
      }} />
      <div className="uiv2-login-glow-b" style={{
        position: 'absolute', bottom: -100, right: -100, width: 400, height: 400,
        borderRadius: '50%', background: 'var(--uiv2-accent-dim)', filter: 'blur(90px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
      }} />

      <aside className="v7-login-brand-panel" aria-label="TIMES INC Workforce Operating System">
        <div className="v7-brand-mark">T</div>
        <div>
          <div className="v7-brand-kicker">TIMES INC</div>
          <h1>Control horario y gestión de equipos.</h1>
          <p>Accede a tu jornada o al panel correspondiente. Tu rol se detecta automáticamente.</p>
        </div>
        <div className="v7-brand-points">
          <span><IconShield width={17} height={17} /> Acceso protegido</span>
          <span><IconClock width={17} height={17} /> Registro en tiempo real</span>
          <span><IconDevice width={17} height={17} /> Disponible como PWA</span>
        </div>
      </aside>

      <main className="v7-login-main">
      <div className="v7-login-form-wrap" style={{ position: 'relative', width: '100%', maxWidth: 420, padding: '0 20px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="uiv2-logo-float" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 60, height: 60, borderRadius: 20,
            background: colors.gradients.brand,
            boxShadow: '0 0 0 1px var(--uiv2-border-default), 0 16px 42px var(--uiv2-primary-glow)',
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: '-2px' }}>T</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 650, color: colors.text[900], letterSpacing: '-1px' }}>
            TIMES <span style={{ color: colors.primary.light }}>INC</span>
          </div>
          <div style={{ fontSize: 12.5, color: colors.text[500], marginTop: 4 }}>Control horario y gestión de equipos</div>
        </div>

        {/* Toggle PIN / Email */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 18,
          background: colors.bg[700], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.lg, padding: 4,
        }}>
          {(['pin', 'email'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onSetMode?.(m)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: radius.md, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                transition: 'all .18s ease',
                background: mode === m ? colors.primary.base : 'transparent',
                color: mode === m ? '#fff' : colors.text[500],
                boxShadow: mode === m ? '0 6px 18px var(--uiv2-primary-glow)' : 'none',
              }}
            >
              {m === 'pin' ? <><IconShield width={13} height={13} /> PIN</> : <><IconMail width={13} height={13} /> Email</>}
            </button>
          ))}
        </div>

        {/* ── PIN MODE ───────────────────────────────────────────────── */}
        {mode === 'pin' && (
          <div tabIndex={0} onKeyDown={e => {
            if (/^\d$/.test(e.key)) { e.preventDefault(); onPinKey?.(e.key) }
            if (e.key === 'Backspace') { e.preventDefault(); onPinDel?.() }
          }} style={{
            borderRadius: radius.xl, background: colors.bg[700],
            border: `1px solid ${colors.border.default}`,
            padding: '22px 22px 18px',
            boxShadow: '0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)',
          }}>
            {/* Selector de empleado */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 8 }}>
                Empleado
              </label>
              {employees.length > 8 && (
                <input
                  type="search"
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder="Busca tu nombre o centro"
                  autoComplete="off"
                  aria-label="Buscar perfil de empleado"
                  style={{ width:'100%', boxSizing:'border-box', minHeight:42, marginBottom:9, padding:'0 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[600], color:colors.text[900], fontSize:13 }}
                />
              )}
              {employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '14px', fontSize: 12.5, color: colors.text[400] }}>
                  Cargando empleados…
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxHeight: 130, overflowY: 'auto' }}>
                  {visibleEmployees.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEmp?.(e.id)}
                      aria-pressed={selectedEmpId === e.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px 5px 5px', borderRadius: radius.pill, border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                        transition: 'all .15s',
                        background: selectedEmpId === e.id ? colors.primary.dim : colors.bg[600],
                        color: selectedEmpId === e.id ? colors.primary.light : colors.text[700],
                        outline: selectedEmpId === e.id ? `1.5px solid ${colors.primary.base}55` : 'none',
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: selectedEmpId === e.id ? colors.primary.base : colors.bg[500],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9.5, fontWeight: 800, color: selectedEmpId === e.id ? '#fff' : colors.text[600],
                        border: `1px solid ${selectedEmpId === e.id ? colors.primary.base + '60' : colors.border.subtle}`,
                      }}>
                        {e.name.slice(0,1).toUpperCase()}
                      </span>
                      {e.name.split(' ')[0]}
                    </button>
                  ))}
                  {employees.length > 8 && !employeeSearch.trim() && !selectedEmpId && <div style={{ padding:'10px 4px', color:colors.text[400], fontSize:12 }}>Escribe tu nombre para mostrar el perfil.</div>}
                </div>
              )}
            </div>

            {/* PIN dots */}
            {selectedEmpId && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
                  {Array.from({ length: pinDotCount }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <div
                        key={i}
                        className={pinShaking ? 'uiv2-pin-shake' : ''}
                        style={{
                          width: 13, height: 13, borderRadius: '50%',
                          border: `2px solid ${filled ? colors.primary.base : colors.border.default}`,
                          background: filled ? colors.primary.base : 'transparent',
                          boxShadow: filled ? `0 0 8px ${colors.primary.base}70` : 'none',
                          transition: 'all .15s',
                        }}
                      />
                    )
                  })}
                </div>

                {/* Error */}
                {pinError && (
                  <div role="alert" aria-live="assertive" style={{
                    padding: '8px 12px', borderRadius: radius.sm, marginBottom: 12,
                    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                    color: '#F87171', fontSize: 11.5, textAlign: 'center',
                  }}>
                    {pinError}
                  </div>
                )}

                {/* Biometría prioritaria */}
                {bioAvailable && empHasBio && !pinLocked && (
                  <button type="button" onClick={onBioLogin} disabled={bioLoading} style={{ width:'100%', marginBottom:12, padding:'12px', borderRadius:radius.md, border:`1px solid ${colors.primary.base}`, background:colors.primary.dim, color:colors.primary.light, fontSize:13, fontWeight:700, cursor:bioLoading?'wait':'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                    <IconShield width={17} height={17} /> {bioLoading ? 'Verificando…' : 'Usar Face ID, Touch ID o huella'}
                  </button>
                )}

                {/* Teclado PIN */}
                {!pinLocked && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {PIN_KEYS.map((k, i) => {
                      if (!k) return <div key={i} />
                      const isDel = k === '⌫'
                      return (
                        <button
                          key={k + i}
                          type="button"
                          onClick={() => isDel ? onPinDel?.() : onPinKey?.(k)}
                          style={{
                            padding: '14px 0', borderRadius: radius.md,
                            background: isDel ? 'transparent' : colors.bg[600],
                            color: isDel ? colors.text[500] : colors.text[900],
                            fontSize: isDel ? 20 : 20, fontWeight: isDel ? 400 : 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            border: isDel ? 'none' : `1px solid ${colors.border.subtle}`,
                            transition: 'all .12s',
                          }}
                          className="uiv2-pin-key"
                        >
                          {k}
                        </button>
                      )
                    })}
                  </div>
                )}

              </>
            )}

            {!selectedEmpId && employees.length > 0 && (
              <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12.5, color: colors.text[400] }}>
                Selecciona tu nombre para introducir el PIN
              </div>
            )}
          </div>
        )}

        {/* ── EMAIL MODE ─────────────────────────────────────────────── */}
        {mode === 'email' && (
          <div style={{
            borderRadius: radius.xl, background: colors.bg[700],
            border: `1px solid ${colors.border.default}`,
            padding: '26px 24px',
            boxShadow: '0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)',
          }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: colors.text[900], letterSpacing: '-.4px', marginBottom: 4 }}>
                Accede a TIMES INC
              </div>
              <div style={{ fontSize: 12, color: colors.text[500] }}>
                Detectaremos automáticamente tu perfil y permisos.
              </div>
            </div>

            <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], display: 'flex' }}>
                    <IconMail width={13} height={13} />
                  </span>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="tu@empresa.com" required autoComplete="email"
                    className="uiv2-login-input"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 33, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
                      borderRadius: radius.sm, border: `1px solid ${colors.border.default}`,
                      background: colors.bg[600], color: colors.text[900],
                      fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = colors.primary.base}
                    onBlur={e => e.target.style.borderColor = colors.border.default}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Contraseña
                  </label>
                  <button type="button" disabled={resetLoading || !email} onClick={() => onForgotPassword?.(email)} style={{ fontSize: 10.5, color: colors.primary.light, background: 'none', border: 'none', cursor:resetLoading||!email?'default':'pointer', opacity:!email ? .5 : 1, padding: 0 }}>
                    {resetLoading ? 'Enviando…' : '¿La olvidaste?'}
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], display: 'flex' }}>
                    <IconLock width={13} height={13} />
                  </span>
                  <input
                    type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="uiv2-login-input"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 33, paddingRight: 40, paddingTop: 10, paddingBottom: 10,
                      borderRadius: radius.sm, border: `1px solid ${colors.border.default}`,
                      background: colors.bg[600], color: colors.text[900],
                      fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = colors.primary.base}
                    onBlur={e => e.target.style.borderColor = colors.border.default}
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} style={{
                    position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: colors.text[500], cursor: 'pointer', padding: 3, display: 'flex',
                  }}>
                    {showPass ? <IconEyeOff width={13} height={13} /> : <IconEye width={13} height={13} />}
                  </button>
                </div>
              </div>

              {(emailError || error) && (
                <div role="alert" aria-live="assertive" style={{
                  padding: '9px 12px', borderRadius: radius.sm,
                  background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)',
                  color: '#F87171', fontSize: 12,
                }}>
                  {emailError || error}
                </div>
              )}

              <button
                type="submit"
                disabled={emailLoading || loading || !email || !password}
                className="uiv2-login-submit"
                style={{
                  marginTop: 4, padding: '12px', borderRadius: radius.md, border: 'none',
                  background: emailLoading || loading || !email || !password
                    ? colors.bg[400]
                    : colors.gradients.brand,
                  color: emailLoading || loading || !email || !password ? colors.text[500] : '#fff',
                  fontSize: 13.5, fontWeight: 800, cursor: emailLoading || loading ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: emailLoading || loading || !email || !password ? 'none' : '0 10px 28px var(--uiv2-primary-glow)',
                  transition: 'all .2s',
                }}
              >
                {emailLoading || loading ? 'Entrando…' : 'Continuar'}
              </button>
            </form>
          </div>
        )}

        {/* Trust badges */}
        <div role="status" aria-live="polite" style={{ marginTop:16, padding:'9px 12px', borderRadius:radius.md, border:`1px solid ${online ? 'rgba(16,185,129,.24)' : 'rgba(245,158,11,.3)'}`, background:online?'rgba(16,185,129,.07)':'rgba(245,158,11,.08)', color:online?colors.semantic.green:colors.semantic.orange, fontSize:11.5, textAlign:'center', fontWeight:650 }}>
          {online ? `Con conexión${lastSyncLabel ? ` · Última sincronización ${lastSyncLabel}` : ''}` : 'Sin cobertura · El acceso con PIN sigue disponible; el email requiere conexión'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 20 }}>
          {[
            { icon: <IconShield width={10} height={10} />, label: 'Cifrado SSL' },
            { icon: <IconDevice width={10} height={10} />, label: 'Funciona sin cobertura' },
            { icon: <IconClock  width={10} height={10} />, label: 'RD 8/2019' },
          ].map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.text[300] }}>
              {b.icon} {b.label}
            </div>
          ))}
        </div>
      </div>
      </main>

      <style>{`
        @keyframes uiv2LoginGlowA { 0%,100%{transform:scale(1) translate(0,0);} 50%{transform:scale(1.08) translate(20px,10px);} }
        @keyframes uiv2LoginGlowB { 0%,100%{transform:scale(1) translate(0,0);} 50%{transform:scale(1.06) translate(-15px,-10px);} }
        .uiv2-login-glow-a { animation: uiv2LoginGlowA 10s ease-in-out infinite; }
        .uiv2-login-glow-b { animation: uiv2LoginGlowB 12s ease-in-out infinite; }
        @keyframes uiv2LogoFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-4px);} }
        .uiv2-logo-float { animation: uiv2LogoFloat 4s ease-in-out infinite; }
        .uiv2-login-input { transition: border-color .15s; }
        .uiv2-login-input::placeholder { color: ${colors.text[300]}; }
        .uiv2-login-submit:not(:disabled):hover { filter: brightness(1.1); transform: translateY(-1px); }
        .uiv2-login-submit:not(:disabled):active { transform: scale(.98); }
        .uiv2-pin-key:hover { background: var(--uiv2-primary-dim) !important; border-color: var(--uiv2-border-strong) !important; }
        .uiv2-pin-key:active { transform: scale(.96); background: var(--uiv2-primary-glow) !important; }
        @keyframes uiv2PinShake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-6px);} 40%{transform:translateX(6px);} 60%{transform:translateX(-4px);} 80%{transform:translateX(4px);} }
        .uiv2-pin-shake { animation: uiv2PinShake .4s cubic-bezier(.36,.07,.19,.97); }
        .v7-login-brand-panel { display:none; }
        .v7-login-main { position:relative; z-index:1; flex:1; display:flex; align-items:center; justify-content:center; padding:48px 24px; }
        @media (min-width: 960px) {
          .v7-login-shell { justify-content:stretch !important; }
          .v7-login-brand-panel { display:flex; width:min(46vw,680px); flex-direction:column; justify-content:space-between; padding:56px 64px; position:relative; z-index:1; border-right:1px solid var(--border-subtle); background:linear-gradient(180deg,rgba(53,104,255,.08),transparent 45%),#080b12; }
          .v7-brand-mark { width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#2450e6,#3568ff 58%,#7c5cff); color:#fff; font-size:24px; font-weight:700; box-shadow:0 12px 36px rgba(53,104,255,.25); }
          .v7-brand-kicker { color:#8dadff; font-size:12px; font-weight:700; letter-spacing:.12em; margin-bottom:16px; }
          .v7-login-brand-panel h1 { margin:0; max-width:520px; color:#f7f9fc; font-size:clamp(36px,4vw,56px); line-height:1.06; letter-spacing:-.045em; font-weight:600; }
          .v7-login-brand-panel p { max-width:500px; margin:22px 0 0; color:#aeb8ca; font-size:15px; line-height:1.65; }
          .v7-brand-points { display:flex; flex-wrap:wrap; gap:12px 24px; color:#77839a; font-size:12px; }
          .v7-brand-points span { display:flex; align-items:center; gap:8px; }
          .v7-login-main { min-width:460px; }
        }
        @media (max-width: 520px) {
          .v7-login-main { padding:calc(24px + env(safe-area-inset-top)) 0 calc(20px + env(safe-area-inset-bottom)); align-items:flex-start; overflow-y:auto; }
          .v7-login-form-wrap { padding-inline:16px !important; }
          .uiv2-logo-float { width:52px !important; height:52px !important; border-radius:16px !important; }
        }
      `}</style>
    </div>
  )
}
