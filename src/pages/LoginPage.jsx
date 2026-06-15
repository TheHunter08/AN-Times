import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore.js'
import { loadFirebase, signInEmail, signInGoogle, resetPassword, isFirebaseReady, AUTH_ERRORS } from '../services/authService.js'
import { ADMIN_PIN } from '../config/constants.js'
import { sortedEmps } from '../utils/time.js'

export default function LoginPage() {
  const { db, setSession, setScreen, toast, fetchDB } = useAppStore()
  const [mode, setMode] = useState('pin') // 'pin' | 'email' | 'forgot'
  const [pin, setPin] = useState('')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [err, setErr]     = useState('')
  const [loading, setLoading] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [passVisible, setPassVisible] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [logoTaps, setLogoTaps] = useState(0)
  const [showAdminBtn, setShowAdminBtn] = useState(false)

  const emps = sortedEmps(db)

  // Restore remembered employee
  useEffect(() => {
    try {
      const rem = JSON.parse(localStorage.getItem('an_times_rem') || 'null')
      if (rem?.empId) setSelectedEmpId(rem.empId)
    } catch {}
  }, [])

  // Load DB on mount
  useEffect(() => { fetchDB() }, [])

  const doLogin = useCallback((emp) => {
    const ses = {
      user: emp,
      isAdmin: emp.role === 'jefe_obra',
      isEnc:   emp.role === 'encargado',
      isJO:    emp.role === 'jefe_obra'
    }
    setSession(ses)
    try { localStorage.setItem('an_times_rem', JSON.stringify({ empId: emp.id })) } catch {}
    if (ses.isAdmin) {
      setScreen('admin', true)
    } else {
      setScreen('emp', true)
    }
    toast('✅ Bienvenido, ' + emp.name.split(' ')[0])
  }, [setSession, setScreen, toast])

  const doAdminLogin = useCallback(() => {
    setSession({ user: null, isAdmin: true, isEnc: false, isJO: false })
    setScreen('admin', true)
    toast('⚡ Modo admin activado')
  }, [setSession, setScreen, toast])

  // PIN handling
  const handlePin = useCallback((k) => {
    if (pin.length >= 6) return
    const newPin = pin + k
    setPin(newPin)
    setErr('')

    if (newPin.length >= 4) {
      // Check admin PIN
      if (!selectedEmpId && newPin === ADMIN_PIN) {
        doAdminLogin()
        setPin('')
        return
      }
      // Check employee PIN
      const emp = db.employees.find(e => e.id === selectedEmpId)
      if (emp && emp.pin === newPin) {
        doLogin(emp)
        setPin('')
        return
      }
      if (newPin.length >= 4 && newPin.length === (emp?.pin?.length || 4)) {
        setShaking(true)
        setErr('PIN incorrecto')
        setTimeout(() => { setShaking(false); setPin('') }, 450)
      }
    }
  }, [pin, selectedEmpId, db, doLogin, doAdminLogin])

  const handlePinDel = () => { setPin(p => p.slice(0, -1)); setErr('') }

  // Email login
  const doEmailLogin = async () => {
    setErr('')
    if (!email || !pass) { setErr('Introduce tu email y contraseña'); return }
    setLoading(true)

    if (!isFirebaseReady()) {
      await new Promise(res => {
        const t = setTimeout(res, 10000)
        loadFirebase(() => { clearTimeout(t); res() })
      })
    }
    if (!isFirebaseReady()) { setErr('Sin conexión con Firebase. Usa el PIN.'); setLoading(false); return }

    try {
      const result = await signInEmail(email, pass)
      const fbUser = result.user
      const emp = db.employees.find(e => e.email?.toLowerCase() === fbUser.email?.toLowerCase())
      if (emp) {
        doLogin(emp)
      } else if (['admin@times-inc.com','admin@timesync.app'].includes(fbUser.email?.toLowerCase())) {
        doAdminLogin()
      } else {
        setErr('⛔ Tu cuenta no está registrada. Contacta al administrador.')
      }
    } catch (ex) {
      setErr(AUTH_ERRORS[ex.code] || ex.message || 'Error al iniciar sesión')
    }
    setLoading(false)
  }

  // Google login
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
      const emp = db.employees.find(e => e.email?.toLowerCase() === fbUser.email?.toLowerCase())
      if (emp) {
        doLogin(emp)
      } else {
        setErr('⛔ Cuenta no registrada. Contacta al administrador.')
      }
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

  // Logo triple-tap for admin access
  const handleLogoTap = () => {
    const next = logoTaps + 1
    setLogoTaps(next)
    setTimeout(() => setLogoTaps(0), 800)
    if (next >= 3) { setLogoTaps(0); setShowAdminBtn(true) }
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','⌫']
  const KEY_LABELS = { '1':'','2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ','*':'','0':'+','⌫':'' }

  return (
    <div className="screen active" id="sLogin">
      <div className="login-wrap">
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32, alignSelf:'flex-start' }} onClick={handleLogoTap}>
          <div style={{ width:44, height:44, flexShrink:0 }}>
            <LogoSVG />
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.3px' }}>TIMES <span style={{ color:'var(--primary-light)' }}>INC</span></div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>Control de jornada</div>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display:'flex', gap:6, width:'100%', marginBottom:24, background:'var(--bg-600)', borderRadius:'var(--r-sm)', padding:4 }}>
          {[['pin','🔢 PIN'],['email','✉️ Email']].map(([m,lbl]) => (
            <button key={m} onClick={() => { setMode(m); setErr('') }}
              style={{ flex:1, padding:'8px 0', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all .15s',
                background: mode===m ? 'var(--bg-400)' : 'transparent',
                color: mode===m ? 'var(--text)' : 'var(--text3)',
                boxShadow: mode===m ? '0 1px 3px rgba(0,0,0,.3)' : 'none'
              }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* PIN mode */}
        {mode === 'pin' && (
          <>
            <div style={{ width:'100%', marginBottom:20 }}>
              <label className="lh-label">Selecciona tu nombre</label>
              <div className="lh-sel-box">
                <select className="lh-sel" value={selectedEmpId} onChange={e => { setSelectedEmpId(e.target.value); setPin(''); setErr('') }}>
                  <option value="">— Elige tu nombre —</option>
                  {emps.map(e => (
                    <option key={e.id} value={e.id}>{e.name}{e.role==='encargado'?' ⭐':''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ fontSize:14, color:'var(--text2)', marginBottom:18, fontWeight:500, textAlign:'center' }}>
              Introduce tu PIN
            </div>

            <div className={`lh-dots${shaking?' shake':''}`}>
              {Array.from({length:6}).map((_,i) => (
                <div key={i} className={`lh-dot${i<pin.length?' filled':''}${shaking?' error':''}`} />
              ))}
            </div>

            <div className="lh-err">{err}</div>

            <div className="lh-numpad">
              {KEYS.map(k => (
                <button key={k} className={`lh-key${k==='⌫'?' lh-key-del':''}`}
                  onClick={() => k === '⌫' ? handlePinDel() : handlePin(k)}
                  style={{ background: k==='⌫' ? 'var(--bg-400)' : undefined }}>
                  {k === '⌫' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                  ) : k === '*' ? '' : k}
                  {k !== '⌫' && k !== '*' && KEY_LABELS[k] && <span>{KEY_LABELS[k]}</span>}
                </button>
              ))}
            </div>

            {showAdminBtn && (
              <button onClick={() => { if (pin === ADMIN_PIN) { doAdminLogin(); setPin('') } else { setErr('PIN admin incorrecto') } }}
                style={{ color:'var(--primary-light)', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, marginTop:8 }}>
                ⚡ Acceso admin
              </button>
            )}
          </>
        )}

        {/* Email mode */}
        {mode === 'email' && (
          <>
            <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:14 }}>
              {/* Email + Password in single card */}
              <div style={{ background:'var(--bg-600)', border:'1px solid var(--border2)', borderRadius:'var(--r)', overflow:'hidden' }}>
                <div className="login-field-group" style={{ borderRadius:0, border:'none', borderBottom:'1px solid var(--border)' }}>
                  <span className="lf-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </span>
                  <input type="email" placeholder="correo@empresa.com" value={email}
                    onChange={e => { setEmail(e.target.value); setErr('') }}
                    onKeyDown={e => e.key === 'Enter' && document.getElementById('passInput')?.focus()}
                    style={{ background:'transparent', border:'none', boxShadow:'none' }} />
                </div>
                <div className="login-field-group" style={{ borderRadius:0, border:'none' }}>
                  <span className="lf-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input id="passInput" type={passVisible ? 'text' : 'password'} placeholder="Contraseña"
                    value={pass} style={{ paddingRight:44, background:'transparent', border:'none', boxShadow:'none' }}
                    onChange={e => { setPass(e.target.value); setErr('') }}
                    onKeyDown={e => e.key === 'Enter' && doEmailLogin()} />
                  <button onClick={() => setPassVisible(v => !v)}
                    style={{ position:'absolute', right:12, background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:16, padding:4, lineHeight:1 }}>
                    {passVisible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {err && <div style={{ color:'var(--red)', fontSize:12, fontWeight:500, textAlign:'center', padding:'4px 0' }}>{err}</div>}

              <button className="btn btn-primary btn-full btn-lg" onClick={doEmailLogin} disabled={loading}>
                {loading ? '⏳ Verificando...' : 'Iniciar sesión'}
              </button>

              <button onClick={doGoogleLogin} disabled={loading}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', padding:'11px 16px', background:'var(--bg-600)', border:'1px solid var(--border2)', borderRadius:'var(--r-sm)', color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', transition:'background .15s' }}>
                <svg width="17" height="17" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar con Google
              </button>

              <button onClick={() => { setMode('forgot'); setForgotEmail(email); setErr(''); setForgotSent(false) }}
                style={{ background:'none', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', fontWeight:500, textAlign:'center', width:'100%' }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </>
        )}

        {/* Forgot mode */}
        {mode === 'forgot' && (
          <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ textAlign:'center', marginBottom:8 }}>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Restablecer contraseña</div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>Te enviaremos un enlace por email</div>
            </div>
            <div className="login-field-group">
              <span className="lf-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input type="email" placeholder="correo@empresa.com" value={forgotEmail}
                onChange={e => { setForgotEmail(e.target.value); setErr('') }} />
            </div>
            {err && <div style={{ color:'var(--red)', fontSize:12 }}>{err}</div>}
            {forgotSent && <div style={{ color:'var(--green)', fontSize:12, fontWeight:500, textAlign:'center' }}>✅ Enlace enviado. Revisa tu email.</div>}
            <button className="btn btn-primary btn-full" onClick={doForgot} disabled={loading}>
              {loading ? '⏳ Enviando...' : 'Enviar enlace'}
            </button>
            <button onClick={() => { setMode('email'); setErr('') }}
              style={{ background:'none', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', width:'100%', textAlign:'center' }}>
              ← Volver
            </button>
          </div>
        )}

        <div style={{ marginTop:'auto', paddingTop:24, fontSize:11, color:'var(--text4)', textAlign:'center' }}>
          TIMES INC v2.0 · Control de jornada
        </div>
      </div>
    </div>
  )
}

function LogoSVG() {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:44, height:44 }}>
      <defs>
        <linearGradient id="lgLogin" x1="0" y1="0" x2="44" y2="44">
          <stop offset="0%" stopColor="#c026d3"/>
          <stop offset="40%" stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#06b6d4"/>
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="10" fill="url(#lgLogin)"/>
      <rect x="10" y="10" width="24" height="7" rx="2.5" fill="white"/>
      <rect x="18.5" y="10" width="7" height="28" rx="2.5" fill="white"/>
    </svg>
  )
}
