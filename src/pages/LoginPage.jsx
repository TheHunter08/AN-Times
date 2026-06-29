import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { signInEmail, signInGoogle, resetPassword, updatePassword, isAuthReady, onAuthStateChange, signOut as authSignOut } from '../services/authService.js'
import { sortedEmps } from '../utils/time.js'
import { isPinHashed, needsRehash, verifyPin, getLockoutState, recordFailedAttempt, clearLockout, PIN_MAX_ATTEMPTS, hashPin, recordFailedAttempt as recordFailed } from '../utils/pinSecurity.js'
import { checkPlatformAuth, hasBiometric, authenticateBiometric, registerBiometric, clearBiometric } from '../utils/webauthn.js'

const EMAIL_LK_KEY = 'an_email_lk'
const EMAIL_MAX_ATTEMPTS = 5
const EMAIL_LOCKOUT_MS = 10 * 60 * 1000

function getEmailLockout() {
  try {
    const raw = localStorage.getItem(EMAIL_LK_KEY)
    if (!raw) return { locked: false, attempts: 0 }
    const d = JSON.parse(raw)
    if (d.until) {
      const remaining = d.until - Date.now()
      if (remaining > 0) return { locked: true, remainingSecs: Math.floor(remaining / 1000) }
      localStorage.removeItem(EMAIL_LK_KEY)
    }
    return { locked: false, attempts: d.attempts || 0 }
  } catch { return { locked: false, attempts: 0 } }
}

function recordEmailFailed() {
  try {
    const state = getEmailLockout()
    if (state.locked) return state
    const attempts = (state.attempts || 0) + 1
    if (attempts >= EMAIL_MAX_ATTEMPTS) {
      localStorage.setItem(EMAIL_LK_KEY, JSON.stringify({ until: Date.now() + EMAIL_LOCKOUT_MS }))
      return { locked: true, remainingSecs: Math.floor(EMAIL_LOCKOUT_MS / 1000) }
    }
    localStorage.setItem(EMAIL_LK_KEY, JSON.stringify({ attempts }))
    return { locked: false, attempts, remaining: EMAIL_MAX_ATTEMPTS - attempts }
  } catch { return { locked: false, attempts: 0 } }
}

function clearEmailLockout() {
  try { localStorage.removeItem(EMAIL_LK_KEY) } catch {}
}

export default function LoginPage() {
  const { db, setSession, setScreen, toast, saveDB } = useAppStore()
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
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [logoTaps, setLogoTaps] = useState(0)
  const [showAdminForm, setShowAdminForm] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminPassVisible, setAdminPassVisible] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminErr, setAdminErr] = useState('')
  const [mounted, setMounted] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioLoading, setBioLoading]     = useState(false)
  const [bioRegLoading, setBioRegLoading] = useState(false)
  const [empHasBio, setEmpHasBio] = useState(false)

  const emps = sortedEmps(db)

  useEffect(() => {
    try {
      const rem = JSON.parse(localStorage.getItem('an_times_rem') || 'null')
      if (rem?.empId) setSelectedEmpId(rem.empId)
    } catch {}
    try {
      const qrEmpId = localStorage.getItem('an_qr_emp')
      if (qrEmpId) { setSelectedEmpId(qrEmpId); localStorage.removeItem('an_qr_emp') }
    } catch {}
  }, [])


  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  useEffect(() => { checkPlatformAuth().then(setBioAvailable) }, [])

  useEffect(() => { setEmpHasBio(selectedEmpId ? hasBiometric(selectedEmpId) : false) }, [selectedEmpId])

  // Countdown en vivo cuando el empleado está bloqueado
  useEffect(() => {
    if (!selectedEmpId) { setErr(''); return }
    const emp = (db.employees || []).find(e => e.id === selectedEmpId)
    if (!emp) return

    const update = () => {
      const lk = getLockoutState(emp.id)
      if (!lk.locked) { setErr(''); return false }
      const secs = lk.remainingSecs || 0
      const m = Math.floor(secs / 60)
      const s = secs % 60
      setErr(`Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
      return true
    }

    if (!update()) return
    const id = setInterval(() => { if (!update()) clearInterval(id) }, 1000)
    return () => clearInterval(id)
  }, [selectedEmpId, db])

  const verifyingRef = useRef(false)
  const opIdRef = useRef(0)

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
  }, [setSession, setScreen])

  const doAdminLogin = useCallback(() => {
    setSession({ user: null, isAdmin: true, isEnc: false, isJO: false })
    setScreen('admin', true)
    toast('Modo admin activado')
  }, [setSession, setScreen, toast])

  const isAdminEmail = useCallback((userEmail) => {
    if (!userEmail) return false
    const em = userEmail.toLowerCase()
    // 1. Configurado en db.config.adminEmails
    const configured = (db.config?.adminEmails || []).map(e => e.toLowerCase())
    if (configured.includes(em)) return true
    // 2. Empleado con isAdmin: true
    if ((db.employees || []).some(e => e.email?.toLowerCase() === em && e.isAdmin)) return true
    return false
  }, [db])

  const doAdminEmailLogin = useCallback(async () => {
    setAdminErr('')
    if (!adminEmail.trim()) { setAdminErr('Introduce tu email de administrador'); return }
    if (!adminPass) { setAdminErr('Introduce tu contraseña'); return }
    const lk = getEmailLockout()
    if (lk.locked) {
      const m = Math.floor(lk.remainingSecs / 60), s = lk.remainingSecs % 60
      setAdminErr(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`); return
    }
    if (!isAuthReady()) { setAdminErr('Sin conexión con el servidor'); return }
    setAdminLoading(true)
    try {
      const result = await signInEmail(adminEmail.trim(), adminPass)
      const userEmail = result.user?.email
      clearEmailLockout()
      await useAppStore.getState().fetchDB()
      const freshDB = useAppStore.getState().db
      const em = userEmail?.toLowerCase()
      const configuredEmails = (freshDB.config?.adminEmails || []).map(e => e.toLowerCase())
      const empIsAdmin = (freshDB.employees || []).some(e => e.email?.toLowerCase() === em && e.isAdmin)
      const isAdmin = configuredEmails.includes(em) || empIsAdmin
      await authSignOut()
      if (isAdmin) {
        doAdminLogin()
        setShowAdminForm(false)
        setAdminEmail('')
        setAdminPass('')
      } else {
        recordEmailFailed()
        setAdminErr('Este email no tiene permisos de administrador')
      }
    } catch (ex) {
      const newLk = recordEmailFailed()
      if (newLk.locked) {
        const m = Math.floor(newLk.remainingSecs / 60), s = newLk.remainingSecs % 60
        setAdminErr(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`)
      } else {
        const remaining = newLk.remaining != null ? ` (${newLk.remaining} intentos)` : ''
        setAdminErr((ex.message || 'Email o contraseña incorrectos') + remaining)
      }
    }
    setAdminLoading(false)
  }, [adminEmail, adminPass, doAdminLogin])

  const findEmployeeByEmail = async (fbEmail) => {
    const normalized = fbEmail?.toLowerCase()
    if (!normalized) return null
    await useAppStore.getState().fetchDB()
    const freshDB = useAppStore.getState().db
    return (freshDB.employees || []).find(e => e.email?.toLowerCase() === normalized) || null
  }

  const handlePin = useCallback(async (k) => {
    if (pin.length >= 6 || verifyingRef.current) return
    if (!selectedEmpId) return  // sin empleado seleccionado, ignorar PIN
    const newPin = pin + k
    setPin(newPin)
    setErr('')
    if (newPin.length < 4) return

    const emp = (db.employees || []).find(e => e.id === selectedEmpId)
    if (!emp) return

    const lkState = getLockoutState(emp.id)
    if (lkState.locked) {
      const secs = lkState.remainingSecs || 0
      const m = Math.floor(secs / 60); const s = secs % 60
      setErr(`Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`)
      setPin(''); return
    }

    // Disparar verificación al llegar a la longitud correcta.
    // Si pinLen no existe (cuenta legacy con hash), intentamos desde 4 hasta 6 dígitos
    // sin mostrar error en longitudes intermedias.
    const knownLen = isPinHashed(emp.pin) ? emp.pinLen : (emp.pin?.length || 4)
    const minLen = knownLen || 4
    const maxLen = knownLen || 6
    if (newPin.length < minLen) return

    verifyingRef.current = true
    const opId2 = ++opIdRef.current
    const ok = await verifyPin(newPin, emp.pin, emp.id)
    verifyingRef.current = false
    if (opId2 !== opIdRef.current) return  // resultado obsoleto, descartar

    if (ok) {
      clearLockout(emp.id)
      // Migrar PIN en texto plano → hash automáticamente; también guardar pinLen si faltaba
      if (!isPinHashed(emp.pin) || !emp.pinLen) {
        const hashed = isPinHashed(emp.pin) ? emp.pin : await hashPin(newPin, emp.id)
        const emps2 = (db.employees || []).map(e => e.id === emp.id ? { ...e, pin: hashed, pinLen: newPin.length } : e)
        useAppStore.getState().saveDB({ employees: emps2 })
      }
      doLogin(emp)
      setPin('')
    } else if (!knownLen && newPin.length < maxLen) {
      // Longitud desconocida (legacy) — esperar más dígitos sin mostrar error
    } else {
      const lk = recordFailedAttempt(emp.id)
      setShaking(true)
      if (lk.locked) {
        const secs = lk.remainingSecs || 0
        const m = Math.floor(secs / 60); const s = secs % 60
        setErr(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`)
      } else setErr(`PIN incorrecto (${lk.remaining} intentos restantes)`)
      if (navigator.vibrate) navigator.vibrate(200)
      setTimeout(() => { setShaking(false); setPin('') }, 450)
    }
  }, [pin, selectedEmpId, db, doLogin])

  const handlePinDel = () => { setPin(p => p.slice(0, -1)); setErr('') }

  // Manejar callback de Google OAuth y recuperación de contraseña (redirect de vuelta desde Supabase)
  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // El usuario ha clicado el enlace del email de restablecimiento.
        // Mostrar formulario para nueva contraseña (NO cerrar sesión: necesitamos el token).
        setMode('reset-new'); setErr(''); setNewPass(''); setNewPass2(''); setResetSuccess(false)
        return
      }
      if (event === 'SIGNED_IN' && session?.user?.email) {
        // Si llegamos aquí vía link de recuperación (URL con #type=recovery), también mostrar la pantalla
        const url = new URL(window.location.href)
        const hash = window.location.hash || ''
        if (url.searchParams.get('reset') === '1' || hash.includes('type=recovery')) {
          setMode('reset-new'); setErr(''); setNewPass(''); setNewPass2(''); setResetSuccess(false)
          return
        }
        const userEmail = session.user.email.toLowerCase()
        await useAppStore.getState().fetchDB()
        const freshDB = useAppStore.getState().db
        const emp = (freshDB.employees || []).find(e => e.email?.toLowerCase() === userEmail)
        await authSignOut()
        if (emp) {
          if (emp.isAdmin) doAdminLogin()
          else doLogin(emp)
        } else if (isAdminEmail(userEmail)) {
          doAdminLogin()
        } else {
          setErr('Cuenta no registrada. Contacta al administrador.')
        }
        // Limpiar ?auth=google de la URL
        window.history.replaceState({}, '', window.location.pathname)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Si la URL contiene ?reset=1 al cargar (sin tener todavía sesión), mostrar la pantalla
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('reset') === '1' || window.location.hash.includes('type=recovery')) {
      setMode('reset-new')
    }
  }, [])

  const doResetNew = async () => {
    setErr('')
    if (!newPass || !newPass2) { setErr('Introduce y confirma la nueva contraseña'); return }
    if (newPass !== newPass2) { setErr('Las contraseñas no coinciden'); return }
    if (newPass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)
    try {
      await updatePassword(newPass)
      setResetSuccess(true)
      await authSignOut().catch(() => {})
      setTimeout(() => {
        setMode('email')
        setResetSuccess(false); setNewPass(''); setNewPass2('')
        window.history.replaceState({}, '', window.location.pathname)
      }, 2500)
    } catch (ex) {
      setErr(ex.message || 'No se pudo actualizar la contraseña. El enlace puede haber caducado.')
    }
    setLoading(false)
  }

  const doEmailLogin = async () => {
    setErr('')
    if (!email || !pass) { setErr('Introduce tu email y contraseña'); return }
    const lk = getEmailLockout()
    if (lk.locked) {
      const m = Math.floor(lk.remainingSecs / 60), s = lk.remainingSecs % 60
      setErr(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`); return
    }
    if (!isAuthReady()) { setErr('Sin conexión con el servidor. Usa el PIN.'); return }
    setLoading(true)
    try {
      const result = await signInEmail(email, pass)
      const userEmail = result.user?.email
      clearEmailLockout()
      await useAppStore.getState().fetchDB()
      const freshDB = useAppStore.getState().db
      const emp = (freshDB.employees || []).find(e => e.email?.toLowerCase() === userEmail?.toLowerCase())
      await authSignOut()
      if (emp) {
        if (emp.isAdmin) doAdminLogin()
        else doLogin(emp)
      } else if (isAdminEmail(userEmail)) {
        doAdminLogin()
      } else {
        setErr('Tu cuenta no está registrada. Contacta al administrador.')
      }
    } catch (ex) {
      const newLk = recordEmailFailed()
      if (newLk.locked) {
        const m = Math.floor(newLk.remainingSecs / 60), s = newLk.remainingSecs % 60
        setErr(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2,'0')} restantes`)
      } else {
        const remaining = newLk.remaining != null ? ` (${newLk.remaining} intentos restantes)` : ''
        setErr((ex.message || 'Email o contraseña incorrectos') + remaining)
      }
    }
    setLoading(false)
  }

  const doGoogleLogin = async () => {
    setErr('')
    if (!isAuthReady()) { setErr('Sin conexión con el servidor.'); return }
    setLoading(true)
    try {
      // signInGoogle redirige al usuario a Google — el callback se maneja en onAuthStateChange
      await signInGoogle()
      // Si llegamos aquí significa que la redirección no se produjo (error)
      setLoading(false)
    } catch (ex) {
      if (ex.message) setErr(ex.message)
      setLoading(false)
    }
  }

  const doForgot = async () => {
    setErr(''); setForgotSent(false)
    if (!forgotEmail) { setErr('Introduce tu email'); return }
    if (!isAuthReady()) { setErr('Sin conexión con el servidor.'); return }
    setLoading(true)
    try {
      await resetPassword(forgotEmail)
      setForgotSent(true)
      setTimeout(() => setMode('email'), 4000)
    } catch (ex) {
      setErr(ex.message || 'Error al enviar. Intenta de nuevo.')
    }
    setLoading(false)
  }

  const handleLogoTap = () => {
    const next = logoTaps + 1
    setLogoTaps(next)
    setTimeout(() => setLogoTaps(0), 800)
    if (next >= 3) { setLogoTaps(0); setShowAdminForm(true); setAdminErr('') }
  }

  // Soporte de teclado físico para el numpad
  useEffect(() => {
    if (mode !== 'pin') return
    const handler = (e) => {
      if (verifyingRef.current) return
      if (e.key >= '0' && e.key <= '9') handlePin(e.key)
      else if (e.key === 'Backspace') handlePinDel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, handlePin, handlePinDel])

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

              {showAdminForm ? (
                <div style={{ margin:'8px 0', background:'var(--bg-600)', border:'1px solid var(--border2)', borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)' }}>🔐 Acceso de administrador</div>
                    <button onClick={() => { setShowAdminForm(false); setAdminErr('') }}
                      style={{ background:'none', border:'none', color:'var(--text4)', cursor:'pointer', fontSize:16, lineHeight:1, padding:'2px 4px' }}>✕</button>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Usa las credenciales de tu cuenta Supabase con permisos de administrador.</div>
                  <input
                    type="email" autoComplete="email" placeholder="Email administrador"
                    value={adminEmail} onChange={e => { setAdminEmail(e.target.value); setAdminErr('') }}
                    onKeyDown={e => e.key === 'Enter' && doAdminEmailLogin()}
                    style={{ padding:'10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--bg-700)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
                  <div style={{ position:'relative' }}>
                    <input
                      type={adminPassVisible ? 'text' : 'password'} autoComplete="current-password" placeholder="Contraseña"
                      value={adminPass} onChange={e => { setAdminPass(e.target.value); setAdminErr('') }}
                      onKeyDown={e => e.key === 'Enter' && doAdminEmailLogin()}
                      style={{ width:'100%', padding:'10px 36px 10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--bg-700)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
                    <button onClick={() => setAdminPassVisible(v => !v)}
                      style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text4)', cursor:'pointer', padding:2, fontSize:14 }}>
                      {adminPassVisible ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {adminErr && <div style={{ fontSize:11, color:'var(--danger)', fontWeight:600 }}>{adminErr}</div>}
                  <button onClick={doAdminEmailLogin} disabled={adminLoading}
                    style={{ padding:'11px', borderRadius:8, background:'var(--primary)', color:'#fff', border:'none', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', opacity: adminLoading ? .7 : 1 }}>
                    {adminLoading ? 'Verificando…' : 'Entrar como administrador'}
                  </button>
                </div>
              ) : (
                <>
                <div className="login-pin-label">Introduce tu PIN</div>

                <div className={`login-dots${shaking ? ' shake' : ''}`}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`login-dot${i < pin.length ? ' filled' : ''}${shaking ? ' error' : ''}`} />
                  ))}
                </div>
                <div role="status" aria-live="polite" aria-atomic="true" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0,0,0,0)' }}>
                  {pin.length > 0 ? `${pin.length} dígito${pin.length !== 1 ? 's' : ''} introducido${pin.length !== 1 ? 's' : ''}` : 'PIN vacío'}
                </div>

                {err && <div className="login-err" role="alert" aria-live="assertive">{err}</div>}

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
                </>
              )}

              {/* Biometric login button — shown only when employee selected + credential exists */}
              {bioAvailable && selectedEmpId && empHasBio && !showAdminForm && (
                <button
                  className="login-bio-btn"
                  disabled={bioLoading}
                  onClick={async () => {
                    setBioLoading(true)
                    try {
                      const ok = await authenticateBiometric(selectedEmpId)
                      if (ok) {
                        const emp = (db.employees || []).find(e => e.id === selectedEmpId)
                        if (emp) doLogin(emp)
                        else setErr('Empleado no encontrado')
                      } else {
                        setErr('Autenticación biométrica cancelada')
                      }
                    } catch {
                      setErr('Error biométrico — usa el PIN')
                    }
                    setBioLoading(false)
                  }}>
                  {bioLoading
                    ? <span className="login-bio-spinner" />
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0 0 8 11a4 4 0 1 1 8 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0 0 15.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 0 0 8 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>
                  }
                  {bioLoading ? 'Verificando…' : 'Acceder con huella / Face ID'}
                </button>
              )}

              {/* Biometric remove link — allow disabling stored credential */}
              {bioAvailable && selectedEmpId && empHasBio && !showAdminForm && (
                <button
                  className="login-bio-register"
                  style={{ color: 'var(--danger)', opacity: 0.7, fontSize: 11, marginTop: -4 }}
                  onClick={() => {
                    clearBiometric(selectedEmpId)
                    setEmpHasBio(false)
                    setErr('')
                  }}>
                  Desactivar acceso biométrico
                </button>
              )}

              {/* Biometric register link — offer to enable after employee selection */}
              {bioAvailable && selectedEmpId && !empHasBio && !showAdminForm && (
                <button
                  className="login-bio-register"
                  disabled={bioRegLoading}
                  onClick={async () => {
                    const emp = (db.employees || []).find(e => e.id === selectedEmpId)
                    if (!emp) return
                    setBioRegLoading(true)
                    try {
                      await registerBiometric(emp.id, emp.name)
                      setEmpHasBio(true)
                      setErr('')
                    } catch (ex) {
                      if (ex.name !== 'NotAllowedError') setErr('No se pudo registrar la huella')
                    }
                    setBioRegLoading(false)
                  }}>
                  {bioRegLoading
                    ? 'Registrando…'
                    : '🔒 Activar acceso por huella / Face ID'
                  }
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

          {/* Reset-new mode — formulario para nueva contraseña tras clic del email */}
          {mode === 'reset-new' && (
            <div className="login-email-section">
              <div className="login-forgot-header">
                <div className="login-forgot-title">Nueva contraseña</div>
                <div className="login-forgot-sub">Introduce tu nueva contraseña</div>
              </div>
              <div className="login-input-group">
                <div className="login-input-row">
                  <span className="login-input-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input type={passVisible ? 'text' : 'password'} placeholder="Nueva contraseña" value={newPass}
                    onChange={e => { setNewPass(e.target.value); setErr('') }}
                    autoComplete="new-password" minLength={6} />
                  <button type="button" className="login-eye-btn" onClick={() => setPassVisible(v => !v)} aria-label="Mostrar/ocultar">
                    {passVisible ? '🙈' : '👁️'}
                  </button>
                </div>
                <div className="login-input-row">
                  <span className="login-input-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input type={passVisible ? 'text' : 'password'} placeholder="Confirmar contraseña" value={newPass2}
                    onChange={e => { setNewPass2(e.target.value); setErr('') }}
                    autoComplete="new-password" minLength={6} />
                </div>
              </div>
              {err && <div className="login-err" role="alert">{err}</div>}
              {resetSuccess && <div className="login-success" role="status">Contraseña actualizada. Inicia sesión con la nueva.</div>}
              <button className="login-submit-btn" onClick={doResetNew} disabled={loading || resetSuccess}>
                {loading ? <><span className="login-spinner" /> Guardando...</> : 'Guardar nueva contraseña'}
              </button>
              <button className="login-link-btn" onClick={async () => { await authSignOut().catch(() => {}); setMode('email'); setErr(''); window.history.replaceState({}, '', window.location.pathname) }}>
                ← Cancelar
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
          <span>TIMES INC v{__APP_VERSION__}</span>
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
