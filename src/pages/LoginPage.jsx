import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { loadFirebase, signInEmail, signInGoogle, resetPassword, isFirebaseReady, AUTH_ERRORS } from '../services/authService.js'
import { ADMIN_PIN } from '../config/constants.js'
import { sortedEmps } from '../utils/time.js'
import { hashPin, isPinHashed, verifyPin, getLockoutState, recordFailedAttempt, clearLockout, PIN_MAX_ATTEMPTS } from '../utils/pinSecurity.js'

export default function LoginPage() {
  const { db, setSession, setScreen, toast, fetchDB, saveDB } = useAppStore()
  const [mode, setMode] = useState('pin')
  const [pin, setPin] = useState('')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [passVisible, setPassVisible] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [logoTaps, setLogoTaps] = useState(0)
  const [showAdminBtn, setShowAdminBtn] = useState(false)
  const [mounted, setMounted] = useState(false)

  const emps = sortedEmps(db)

  useEffect(() => {
    try {
      const rem = JSON.parse(localStorage.getItem('an_times_rem') || 'null')
      if (rem?.empId) setSelectedEmpId(rem.empId)
    } catch {}
  }, [])

  useEffect(() => { fetchDB() }, [])

  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  // Mostrar bloqueo si el empleado ya está en lockout
  useEffect(() => {
    if (!selectedEmpId) { setErr(''); return }
    const emp = (db.employees || []).find(e => e.id === selectedEmpId)
    if (!emp) return
    const lk = getLockoutState(emp.id)
    if (lk.locked) setErr(`Bloqueado ${lk.remainingMin} min por exceso de intentos`)
    else setErr('')
  }, [selectedEmpId, db])

  const verifyingRef = useRef(false)

  const doLogin = useCallback((emp) => {
    const ses = {
      user: emp,
      isAdmin: emp.role === 'jefe_obra',
      isEnc: emp.role === 'encargado',
      isJO: emp.role === 'jefe_obra'
    }
    setSession(ses)
    try { localStorage.setItem('an_times_rem', JSON.stringify({ empId: emp.id })) } catch {}
    if (ses.isAdmin) setScreen('admin', true)
    else setScreen('emp', true)
    toast('Bienvenido, ' + emp.name.split(' ')[0])
  }, [setSession, setScreen, toast])

  const doAdminLogin = useCallback(() => {
    setSession({ user: null, isAdmin: true, isEnc: false, isJO: false })
    setScreen('admin', true)
    toast('Modo admin activado')
  }, [setSession, setScreen, toast])

  const findEmployeeByEmail = async (fbEmail) => {
    const normalized = fbEmail?.toLowerCase()
    if (!normalized) return null
    await fetchDB()
    const freshDB = useAppStore.getState().db
    return (freshDB.employees || []).find(e => e.email?.toLowerCase() === normalized) || null
  }

  const handlePin = useCallback(async (k) => {
    if (pin.length >= 6 || verifyingRef.current) return
    const newPin = pin + k
    setPin(newPin)
    setErr('')
    if (newPin.length < 4) return

    // Admin PIN — env var, comparación directa
    if (!selectedEmpId) {
      if (newPin === ADMIN_PIN) { doAdminLogin(); setPin(''); return }
      if (newPin.length >= ADMIN_PIN.length) {
        setShaking(true); setErr('PIN incorrecto')
        if (navigator.vibrate) navigator.vibrate(200)
        setTimeout(() => { setShaking(false); setPin('') }, 450)
      }
      return
    }

    const emp = (db.employees || []).find(e => e.id === selectedEmpId)
    if (!emp) return

    const lkState = getLockoutState(emp.id)
    if (lkState.locked) {
      setErr(`Bloqueado ${lkState.remainingMin} min por exceso de intentos`)
      setPin(''); return
    }

    // Disparar verificación al llegar a la longitud correcta
    const expectedLen = isPinHashed(emp.pin) ? (emp.pinLen || 4) : (emp.pin?.length || 4)
    if (newPin.length < expectedLen) return

    verifyingRef.current = true
    const ok = await verifyPin(newPin, emp.pin, emp.id)
    verifyingRef.current = false

    if (ok) {
      clearLockout(emp.id)
      // Migrar PIN en texto plano → hash automáticamente
      if (!isPinHashed(emp.pin)) {
        const hashed = await hashPin(newPin, emp.id)
        const emps2 = (db.employees || []).map(e => e.id === emp.id ? { ...e, pin: hashed, pinLen: newPin.length } : e)
        useAppStore.getState().saveDB({ employees: emps2 })
      }
      doLogin(emp)
      setPin('')
    } else {
      const lk = recordFailedAttempt(emp.id)
      setShaking(true)
      if (lk.locked) setErr(`Demasiados intentos. Bloqueado ${lk.remainingMin} min.`)
      else setErr(`PIN incorrecto (${lk.remaining} intentos restantes)`)
      if (navigator.vibrate) navigator.vibrate(200)
      setTimeout(() => { setShaking(false); setPin('') }, 450)
    }
  }, [pin, selectedEmpId, db, doLogin, doAdminLogin])

  const handlePinDel = () => { setPin(p => p.slice(0, -1)); setErr('') }

  const doEmailLogin = async () => {
    setErr('')
    if (!email || !pass) { setErr('Introduce tu email y contraseña'); return }
    setLoading(true)
    if (!isFirebaseReady()) {
      await new Promise(res => { const t = setTimeout(res, 10000); loadFirebase(() => { clearTimeout(t); res() }) })
    }
    if (!isFirebaseReady()) { setErr('Sin conexión con Firebase. Usa el PIN.'); setLoading(false); return }
    try {
      const result = await signInEmail(email, pass)
      const fbUser = result.user
      const emp = await findEmployeeByEmail(fbUser.email)
      if (emp) doLogin(emp)
      else if (['admin@times-inc.com', 'admin@timesync.app'].includes(fbUser.email?.toLowerCase())) doAdminLogin()
      else setErr('Tu cuenta no está registrada. Contacta al administrador.')
    } catch (ex) {
      setErr(AUTH_ERRORS[ex.code] || ex.message || 'Error al iniciar sesión')
    }
    setLoading(false)
  }

  const doGoogleLogin = async () => {
    setErr('')
    setLoading(true)
    if (!isFirebaseReady()) {
      await new Promise(res => { const t = setTimeout(res, 10000); loadFirebase(() => { clearTimeout(t); res() }) })
    }
    if (!isFirebaseReady()) { setErr('Sin conexión.'); setLoading(false); return }
    try {
      const result = await signInGoogle()
      const fbUser = result.user
      const emp = await findEmployeeByEmail(fbUser.email)
      if (emp) doLogin(emp)
      else setErr('Cuenta no registrada. Contacta al administrador.')
    } catch (ex) {
      if (AUTH_ERRORS[ex.code] !== null) setErr(AUTH_ERRORS[ex.code] || 'Error Google: ' + (ex.message || ex.code))
    }
    setLoading(false)
  }

  const doForgot = async () => {
    setErr(''); setForgotSent(false)
    if (!forgotEmail) { setErr('Introduce tu email'); return }
    setLoading(true)
    if (!isFirebaseReady()) {
      await new Promise(res => { const t = setTimeout(res, 10000); loadFirebase(() => { clearTimeout(t); res() }) })
    }
    try {
      await resetPassword(forgotEmail)
      setForgotSent(true)
      setTimeout(() => setMode('email'), 4000)
    } catch (ex) {
      setErr(AUTH_ERRORS[ex.code] || 'Error al enviar. Intenta de nuevo.')
    }
    setLoading(false)
  }

  const handleLogoTap = () => {
    const next = logoTaps + 1
    setLogoTaps(next)
    setTimeout(() => setLogoTaps(0), 800)
    if (next >= 3) { setLogoTaps(0); setShowAdminBtn(true) }
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  const KEY_LABELS = { '1':'','2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ','':'','0':'+','⌫':'' }

  return (
    <div className="screen active" id="sLogin">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-orb login-orb-4" />
        <div className="login-grid" />
      </div>

      <div className={`login-wrap${mounted ? ' login-mounted' : ''}`}>
        {/* Logo */}
        <div className="login-logo-row" onClick={handleLogoTap}>
          <div className="login-logo-icon">
            <LogoSVG />
          </div>
          <div className="login-logo-text">
            <div className="login-logo-name">TIMES <span>INC</span></div>
            <div className="login-logo-sub">Control de jornada laboral</div>
          </div>
        </div>

        {/* Glass card */}
        <div className="login-card">
          {/* Mode tabs */}
          <div className="login-tabs">
            {[['pin', 'PIN'], ['email', 'Email']].map(([m, lbl]) => (
              <button key={m}
                className={`login-tab${mode === m ? ' active' : ''}`}
                onClick={() => { setMode(m); setErr('') }}
                aria-label={`Acceder con ${lbl}`}>
                {m === 'pin' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                {m === 'email' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
                {lbl}
              </button>
            ))}
          </div>

          {/* PIN mode */}
          {mode === 'pin' && (
            <div className="login-pin-section">
              <div className="login-select-wrap">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text3)" strokeWidth="2" className="login-select-ico"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <select
                  className="login-select"
                  value={selectedEmpId}
                  onChange={e => { setSelectedEmpId(e.target.value); setPin(''); setErr('') }}
                  aria-label="Selecciona empleado">
                  <option value="">Selecciona tu nombre</option>
                  {emps.map(e => (
                    <option key={e.id} value={e.id}>{e.name}{e.role === 'encargado' ? ' ⭐' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="login-pin-label">Introduce tu PIN</div>

              <div className={`login-dots${shaking ? ' shake' : ''}`} role="status" aria-label={`PIN: ${pin.length} de 4 dígitos`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`login-dot${i < pin.length ? ' filled' : ''}${shaking ? ' error' : ''}`} />
                ))}
              </div>

              {err && <div className="login-err" role="alert">{err}</div>}

              <div className="login-numpad" role="group" aria-label="Teclado numérico">
                {KEYS.map((k, idx) => (
                  <button key={idx}
                    className={`login-key${k === '⌫' ? ' login-key-del' : ''}${k === '' ? ' login-key-empty' : ''}`}
                    onClick={() => k === '⌫' ? handlePinDel() : k !== '' ? handlePin(k) : null}
                    disabled={k === ''}
                    aria-label={k === '⌫' ? 'Borrar' : k === '' ? '' : `Tecla ${k}`}>
                    {k === '⌫' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                        <line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
                      </svg>
                    ) : k === '' ? '' : (
                      <>
                        <span className="login-key-num">{k}</span>
                        {KEY_LABELS[k] && <span className="login-key-letters">{KEY_LABELS[k]}</span>}
                      </>
                    )}
                  </button>
                ))}
              </div>

              {showAdminBtn && (
                <button className="login-admin-btn"
                  onClick={() => { if (pin === ADMIN_PIN) { doAdminLogin(); setPin('') } else { setErr('PIN admin incorrecto') } }}>
                  Acceso administrador
                </button>
              )}
            </div>
          )}

          {/* Email mode */}
          {mode === 'email' && (
            <div className="login-email-section">
              <div className="login-input-group">
                <div className="login-input-row">
                  <span className="login-input-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                  <input type="email" placeholder="correo@empresa.com" value={email}
                    onChange={e => { setEmail(e.target.value); setErr('') }}
                    onKeyDown={e => e.key === 'Enter' && document.getElementById('passInput')?.focus()}
                    aria-label="Email" autoComplete="email" />
                </div>
                <div className="login-input-divider" />
                <div className="login-input-row">
                  <span className="login-input-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input id="passInput" type={passVisible ? 'text' : 'password'} placeholder="Contraseña"
                    value={pass}
                    onChange={e => { setPass(e.target.value); setErr('') }}
                    onKeyDown={e => e.key === 'Enter' && doEmailLogin()}
                    aria-label="Contraseña" autoComplete="current-password" />
                  <button className="login-eye-btn" onClick={() => setPassVisible(v => !v)} type="button" aria-label={passVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {passVisible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {err && <div className="login-err" role="alert">{err}</div>}

              <button className="login-submit-btn" onClick={doEmailLogin} disabled={loading}>
                {loading ? (
                  <><span className="login-spinner" /> Verificando...</>
                ) : 'Iniciar sesión'}
              </button>

              <div className="login-divider-row">
                <span className="login-divider-line" />
                <span className="login-divider-text">o continúa con</span>
                <span className="login-divider-line" />
              </div>

              <button className="login-google-btn" onClick={doGoogleLogin} disabled={loading}>
                <svg width="17" height="17" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuar con Google
              </button>

              <button className="login-link-btn"
                onClick={() => { setMode('forgot'); setForgotEmail(email); setErr(''); setForgotSent(false) }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {/* Forgot mode */}
          {mode === 'forgot' && (
            <div className="login-email-section">
              <div className="login-forgot-header">
                <div className="login-forgot-title">Restablecer contraseña</div>
                <div className="login-forgot-sub">Te enviaremos un enlace por email</div>
              </div>
              <div className="login-input-group">
                <div className="login-input-row">
                  <span className="login-input-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                  <input type="email" placeholder="correo@empresa.com" value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); setErr('') }}
                    aria-label="Email para recuperación" autoComplete="email" />
                </div>
              </div>
              {err && <div className="login-err" role="alert">{err}</div>}
              {forgotSent && <div className="login-success" role="status">Enlace enviado. Revisa tu email.</div>}
              <button className="login-submit-btn" onClick={doForgot} disabled={loading}>
                {loading ? <><span className="login-spinner" /> Enviando...</> : 'Enviar enlace'}
              </button>
              <button className="login-link-btn" onClick={() => { setMode('email'); setErr('') }}>
                ← Volver al inicio de sesión
              </button>
            </div>
          )}
        </div>

        {/* Secure badge */}
        <div className="login-secure-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Conexión segura</span>
        </div>

        <div className="login-footer">
          <span>TIMES INC v2.1</span>
          <span className="login-footer-dot" />
          <span>Control de jornada</span>
        </div>
      </div>
    </div>
  )
}

function LogoSVG() {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="lgLogin" x1="0" y1="0" x2="44" y2="44">
          <stop offset="0%" stopColor="#7C5CFF" />
          <stop offset="55%" stopColor="#5E6AD2" />
          <stop offset="100%" stopColor="#3B4BD6" />
        </linearGradient>
        <linearGradient id="lgAccent" x1="0" y1="0" x2="44" y2="44">
          <stop offset="0%" stopColor="#7DF9FF" />
          <stop offset="100%" stopColor="#00D2FF" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="12" fill="url(#lgLogin)" />
      <rect x="11.5" y="14.5" width="21" height="4.4" rx="2.2" fill="white" />
      <rect x="19.8" y="14.5" width="4.4" height="15.5" rx="2.2" fill="white" />
      <path d="M 30 19.8 A 7.2 7.2 0 1 1 26.8 27" fill="none" stroke="url(#lgAccent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="19.8" r="1.1" fill="url(#lgAccent)" />
    </svg>
  )
}
