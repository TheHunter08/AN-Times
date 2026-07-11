import { useState } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { IconLock, IconMail, IconEye, IconEyeOff, IconClock, IconShield, IconDevice, IconUsers, IconX } from '../components/Icons.js'

export type LoginMode = 'pin' | 'email'

export interface EmpOption { id: string; name: string; dept?: string }

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
  onLogin?: (email: string, password: string, role: 'admin' | 'employee') => void
  emailLoading?: boolean
  emailError?: string
  // Mode
  mode?: LoginMode
  onSetMode?: (m: LoginMode) => void
  loading?: boolean
  error?: string
}

const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export function Login({
  employees = [], pin = '', selectedEmpId = '', onSelectEmp, onPinKey, onPinDel,
  pinError, pinShaking, pinLocked, bioAvailable, empHasBio, onBioLogin, bioLoading,
  onLogin, emailLoading, emailError,
  mode = 'pin', onSetMode,
  loading, error,
}: LoginProps) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [role, setRole]         = useState<'admin' | 'employee'>('employee')

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin?.(email, password, role)
  }

  const selEmp = employees.find(e => e.id === selectedEmpId)

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: colors.bg[900], position: 'relative', overflow: 'hidden',
      fontFamily: 'Inter, SF Pro Display, -apple-system, sans-serif',
    }}>
      {/* Glows de fondo */}
      <div className="uiv2-login-glow-a" style={{
        position: 'absolute', top: -160, left: -160, width: 520, height: 520,
        borderRadius: '50%', background: 'rgba(124,58,237,0.16)', filter: 'blur(110px)', pointerEvents: 'none',
      }} />
      <div className="uiv2-login-glow-b" style={{
        position: 'absolute', bottom: -100, right: -100, width: 400, height: 400,
        borderRadius: '50%', background: 'rgba(59,130,246,0.11)', filter: 'blur(90px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 400, padding: '0 20px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="uiv2-logo-float" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 60, height: 60, borderRadius: 20,
            background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
            boxShadow: '0 0 0 1px rgba(124,58,237,.4), 0 0 40px rgba(124,58,237,.4)',
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: '-2px' }}>T</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: colors.text[900], letterSpacing: '-1.2px' }}>
            TIMES <span style={{ color: colors.primary.light }}>v5</span>
          </div>
          <div style={{ fontSize: 12.5, color: colors.text[500], marginTop: 4 }}>Control Horario · RD 8/2019</div>
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
                boxShadow: mode === m ? `0 4px 14px rgba(124,58,237,.4)` : 'none',
              }}
            >
              {m === 'pin' ? <><IconShield width={13} height={13} /> PIN</> : <><IconMail width={13} height={13} /> Email</>}
            </button>
          ))}
        </div>

        {/* ── PIN MODE ───────────────────────────────────────────────── */}
        {mode === 'pin' && (
          <div style={{
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
              {employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '14px', fontSize: 12.5, color: colors.text[400] }}>
                  Cargando empleados…
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxHeight: 130, overflowY: 'auto' }}>
                  {employees.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEmp?.(e.id)}
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
                </div>
              )}
            </div>

            {/* PIN dots */}
            {selectedEmpId && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
                  {Array.from({ length: 6 }).map((_, i) => {
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
                  <div style={{
                    padding: '8px 12px', borderRadius: radius.sm, marginBottom: 12,
                    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                    color: '#F87171', fontSize: 11.5, textAlign: 'center',
                  }}>
                    {pinError}
                  </div>
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
                            padding: '14px 0', borderRadius: radius.md, border: 'none',
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

                {/* Biometric */}
                {bioAvailable && empHasBio && !pinLocked && (
                  <button
                    type="button"
                    onClick={onBioLogin}
                    disabled={bioLoading}
                    style={{
                      width: '100%', marginTop: 12, padding: '10px', borderRadius: radius.md,
                      border: `1px solid ${colors.border.subtle}`, background: 'transparent',
                      color: colors.text[600], fontSize: 12.5, fontWeight: 600,
                      cursor: bioLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>👆</span>
                    {bioLoading ? 'Verificando…' : 'Acceso biométrico'}
                  </button>
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
            {/* Role selector */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 20,
              background: colors.bg[600], borderRadius: radius.md, padding: 4,
              border: `1px solid ${colors.border.subtle}`,
            }}>
              {(['employee', 'admin'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  style={{
                    padding: '7px 10px', borderRadius: radius.sm, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                    background: role === r ? colors.primary.base : 'transparent',
                    color: role === r ? '#fff' : colors.text[500],
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all .15s',
                  }}
                >
                  {r === 'employee' ? <><IconShield width={12} height={12} /> Empleado</> : <><IconUsers width={12} height={12} /> Admin</>}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: colors.text[900], letterSpacing: '-.4px', marginBottom: 4 }}>
                {role === 'admin' ? 'Panel de administración' : 'Accede a tu jornada'}
              </div>
              <div style={{ fontSize: 12, color: colors.text[500] }}>
                {role === 'admin' ? 'Gestiona equipos, fichajes y reportes' : 'Ficha, solicita permisos y consulta tu horario'}
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
                  <button type="button" style={{ fontSize: 10.5, color: colors.primary.light, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    ¿La olvidaste?
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
                <div style={{
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
                    : 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                  color: emailLoading || loading || !email || !password ? colors.text[500] : '#fff',
                  fontSize: 13.5, fontWeight: 800, cursor: emailLoading || loading ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: emailLoading || loading || !email || !password ? 'none' : '0 6px 24px rgba(124,58,237,.4)',
                  transition: 'all .2s',
                }}
              >
                {emailLoading || loading ? 'Entrando…' : role === 'admin' ? 'Acceder al panel' : 'Entrar a mi jornada'}
              </button>
            </form>
          </div>
        )}

        {/* Trust badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 20 }}>
          {[
            { icon: <IconShield width={10} height={10} />, label: 'Cifrado SSL' },
            { icon: <IconDevice width={10} height={10} />, label: 'PWA offline' },
            { icon: <IconClock  width={10} height={10} />, label: 'RD 8/2019' },
          ].map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.text[300] }}>
              {b.icon} {b.label}
            </div>
          ))}
        </div>
      </div>

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
        .uiv2-pin-key:hover { background: rgba(124,58,237,.15) !important; border-color: rgba(124,58,237,.4) !important; }
        .uiv2-pin-key:active { transform: scale(.94); background: rgba(124,58,237,.25) !important; }
        @keyframes uiv2PinShake { 0%,100%{transform:translateX(0);} 20%{transform:translateX(-6px);} 40%{transform:translateX(6px);} 60%{transform:translateX(-4px);} 80%{transform:translateX(4px);} }
        .uiv2-pin-shake { animation: uiv2PinShake .4s cubic-bezier(.36,.07,.19,.97); }
      `}</style>
    </div>
  )
}
