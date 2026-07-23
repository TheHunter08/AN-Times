// Login v2 — UI nueva conectada a toda la lógica real de auth:
// PIN + biométrico + email/password + admin.
// CLAUDE.md: UI only — preservar auth y lógica de negocio intacta.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Login } from './pages/Login.js'
import { useAppStore } from '../store/appStore.js'
import { linkAuthIdentity } from '../utils/authIdentity.js'
import { useShallow } from 'zustand/react/shallow'
import { signInEmail, signUpEmail, signOut as authSignOut, isAuthReady, onAuthStateChange, resetPassword } from '../services/authService.js'
import { getRegistrationEligibility, normalizeAccountEmail, validateAccountPassword } from '../utils/authRegistration.js'
import { sortedEmps } from '../utils/time.js'
import {
  isPinHashed, verifyPin, getLockoutState, recordFailedAttempt,
  clearLockout, hashPin, needsRehash,
} from '../utils/pinSecurity.js'
import { checkPlatformAuth, hasBiometric, authenticateBiometric } from '../utils/webauthn.js'
import { useConnectivity } from '../hooks/useConnectivity.js'
import type { LoginMode } from './pages/Login.js'

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
function clearEmailLockout() { try { localStorage.removeItem(EMAIL_LK_KEY) } catch {} }

export default function LoginV2() {
  const { db, setSession, setScreen, toast, saveDB, lastSyncTime } = useAppStore(
    useShallow((state) => ({
      db: state.db,
      setSession: state.setSession,
      setScreen: state.setScreen,
      toast: state.toast,
      saveDB: state.saveDB,
      lastSyncTime: state.lastSyncTime,
    })),
  )

  // Mode
  const [mode, setMode] = useState<LoginMode>('pin')

  // PIN state
  const [pin, setPin]               = useState('')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [pinError, setPinError]     = useState('')
  const [pinShaking, setPinShaking] = useState(false)
  const [pinLocked, setPinLocked]   = useState(false)

  // Bio state
  const [bioAvailable, setBioAvailable] = useState(false)
  const [empHasBio, setEmpHasBio]       = useState(false)
  const [bioLoading, setBioLoading]     = useState(false)

  // Email state
  const [emailLoading, setEmailLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [emailError, setEmailError]     = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const { online } = useConnectivity()

  const verifyingRef = useRef(false)
  const opIdRef      = useRef(0)
  const interactiveEmailRef = useRef(false)

  const emps = sortedEmps(db).filter((e: any) => !e.isAdmin && !e.baja)

  // Recordar último empleado seleccionado
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

  useEffect(() => { checkPlatformAuth().then(setBioAvailable) }, [])
  useEffect(() => { setEmpHasBio(selectedEmpId ? hasBiometric(selectedEmpId) : false) }, [selectedEmpId])

  // Countdown lockout
  useEffect(() => {
    if (!selectedEmpId) { setPinError(''); return }
    const emp = (db.employees || []).find((e: any) => e.id === selectedEmpId)
    if (!emp) return
    const update = () => {
      const lk = getLockoutState(emp.id, db)
      if (!lk.locked) { setPinError(''); setPinLocked(false); return false }
      const secs = lk.remainingSecs || 0
      const m = Math.floor(secs / 60), s = secs % 60
      setPinError(`Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
      setPinLocked(true)
      return true
    }
    if (!update()) return
    const id = setInterval(() => { if (!update()) clearInterval(id) }, 1000)
    return () => clearInterval(id)
  }, [selectedEmpId, db])

  const doLogin = useCallback((emp: any, authMethod = 'pin') => {
    const isAdminRole = emp.role === 'admin' || emp.role === 'jefe_obra' || emp.isAdmin === true
    const ses = {
      user: emp,
      isAdmin: isAdminRole,
      isEnc: emp.role === 'encargado',
      isJO: emp.role === 'jefe_obra',
      authMethod,
      authenticatedAt: Date.now(),
    }
    setSession(ses)
    try { localStorage.setItem('an_times_rem', JSON.stringify({ empId: emp.id })) } catch {}
    if (ses.isAdmin) setScreen('admin', true)
    else setScreen('emp', true)
  }, [setSession, setScreen])

  // Vincula el empleado a su usuario de Supabase Auth la primera vez que
  // inicia sesión por email/OAuth. Sin esto, auth_id nunca se rellena y las
  // políticas RLS por rol (policies_auth.sql) no se pueden activar nunca,
  // porque siempre habría 0 empleados "vinculados".
  const linkAuthIdIfMissing = useCallback((emp: any, authUserId?: string | null) => {
    if (!authUserId) return false
    const linkedEmployee = linkAuthIdentity(emp, authUserId)
    if (!linkedEmployee) return false
    if ((emp.authId || emp.auth_id) === authUserId) return true
    saveDB((fresh: any) => ({
      employees: (fresh.employees || []).map((e: any) => e.id === emp.id ? linkedEmployee : e),
    }))
    return true
  }, [saveDB])

  const doAdminLogin = useCallback((authMethod = 'admin') => {
    setSession({ user: null, isAdmin: true, isEnc: false, isJO: false, authMethod, authenticatedAt: Date.now() })
    setScreen('admin', true)
    toast('Modo admin activado')
  }, [setSession, setScreen, toast])

  // ── PIN handlers ──────────────────────────────────────────────────────────

  const handlePinKey = useCallback(async (k: string) => {
    if (pin.length >= 6 || verifyingRef.current) return
    if (!selectedEmpId) return
    const newPin = pin + k
    setPin(newPin)
    setPinError('')
    if (newPin.length < 4) return

    const emp = (db.employees || []).find((e: any) => e.id === selectedEmpId)
    if (!emp) return

    const lkState = getLockoutState(emp.id, db)
    if (lkState.locked) {
      const secs = lkState.remainingSecs || 0
      const m = Math.floor(secs / 60), s = secs % 60
      setPinError(`Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
      setPin(''); return
    }

    const knownLen = isPinHashed(emp.pin) ? emp.pinLen : (emp.pin?.length || 4)
    const minLen = knownLen || 4
    const maxLen = knownLen || 6
    if (newPin.length < minLen) return

    verifyingRef.current = true
    const opId = ++opIdRef.current
    const ok = await verifyPin(newPin, emp.pin, emp.id)
    verifyingRef.current = false
    if (opId !== opIdRef.current) return

    if (ok) {
      saveDB((fresh: any) => ({ pinLockouts: clearLockout(emp.id, fresh) }))
      // Migrar PIN plano o hash legacy (SHA-256 sin sal, débil) → PBKDF2.
      // isPinHashed() da true también para el hash legacy, así que no sirve
      // aquí para decidir si hace falta migrar — needsRehash() sí distingue
      // "ya está en el mejor formato" de "hay que rehashear".
      if (needsRehash(emp.pin) || !emp.pinLen) {
        const hashed = await hashPin(newPin, emp.id)
        useAppStore.getState().saveDB((fresh: any) => ({
          employees: (fresh.employees || []).map((e: any) =>
            e.id === emp.id ? { ...e, pin: hashed, pinLen: newPin.length } : e
          ),
        }))
      }
      doLogin(emp)
      setPin('')
    } else if (!knownLen && newPin.length < maxLen) {
      // Longitud desconocida (legacy) — esperar más dígitos sin error
    } else {
      const { state: lk, lockoutData } = recordFailedAttempt(emp.id, db) as any
      if (lockoutData) saveDB((fresh: any) => ({ pinLockouts: recordFailedAttempt(emp.id, fresh).lockoutData }))
      setPinShaking(true)
      if (lk.locked) {
        const secs = lk.remainingSecs || 0
        const m = Math.floor(secs / 60), s = secs % 60
        setPinError(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
        setPinLocked(true)
      } else {
        setPinError(`PIN incorrecto (${lk.remaining} intentos restantes)`)
      }
      if (navigator.vibrate) navigator.vibrate(200)
      setTimeout(() => { setPinShaking(false); setPin('') }, 450)
    }
  }, [pin, selectedEmpId, db, doLogin, saveDB])

  const handlePinDel = () => { setPin(p => p.slice(0, -1)); setPinError('') }

  const handleSelectEmp = (id: string) => {
    setSelectedEmpId(id)
    setPin('')
    setPinError('')
    setPinLocked(false)
  }

  // ── Biometric ─────────────────────────────────────────────────────────────

  const handleBioLogin = async () => {
    if (!selectedEmpId) return
    const emp = (db.employees || []).find((e: any) => e.id === selectedEmpId)
    if (!emp) return
    setBioLoading(true)
    try {
      const ok = await authenticateBiometric(emp.id)
      if (ok) doLogin(emp, 'biometric')
      else setPinError('Autenticación biométrica fallida')
    } catch {
      setPinError('Error en autenticación biométrica')
    }
    setBioLoading(false)
  }

  // ── Email login ───────────────────────────────────────────────────────────

  const handleEmailLogin = async (email: string, password: string) => {
    setEmailError('')
    const lk = getEmailLockout()
    if (lk.locked) {
      const m = Math.floor((lk.remainingSecs || 0) / 60), s = (lk.remainingSecs || 0) % 60
      setEmailError(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`); return
    }
    if (!isAuthReady()) { setEmailError('Sin conexión con el servidor. Usa el PIN.'); return }
    setEmailLoading(true)
    interactiveEmailRef.current = true
    try {
      const result = await signInEmail(email.trim(), password)
      const userEmail = result.user?.email
      clearEmailLockout()
      await useAppStore.getState().fetchDB()
      const freshDB = useAppStore.getState().db
      const em = userEmail?.toLowerCase()
      const emp = (freshDB.employees || []).find((e: any) => e.email?.toLowerCase() === em)
      const configuredEmails = (freshDB.config?.adminEmails || []).map((x: string) => x.toLowerCase())
      const configuredAdmin = configuredEmails.includes(em || '')
      const employeeAdmin = !!emp && (emp.isAdmin || emp.role === 'admin' || emp.role === 'jefe_obra')
      if (emp && !linkAuthIdIfMissing(emp, result.user?.id)) {
        await authSignOut()
        setEmailError('Este empleado ya está vinculado a otra cuenta. Contacta al administrador.')
        return
      }
      if (emp && employeeAdmin) {
        doLogin(emp, 'email')
      } else if (!emp && configuredAdmin) {
        doAdminLogin('email')
      } else if (emp) {
        doLogin(emp, 'email')
      } else {
        await authSignOut()
        recordEmailFailed()
        setEmailError('Tu cuenta no está registrada. Contacta al administrador.')
      }
    } catch (ex: any) {
      await authSignOut()
      const newLk: any = recordEmailFailed()
      if (newLk.locked) {
        const m = Math.floor((newLk.remainingSecs || 0) / 60), s = (newLk.remainingSecs || 0) % 60
        setEmailError(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
      } else {
        const remaining = newLk.remaining != null ? ` (${newLk.remaining} intentos)` : ''
        setEmailError((ex?.message || 'Email o contraseña incorrectos') + remaining)
      }
    }
    interactiveEmailRef.current = false
    setEmailLoading(false)
  }

  const handleForgotPassword = async (email: string) => {
    if (!email.trim()) { setEmailError('Introduce primero tu email.'); return }
    if (!online) { setEmailError('La recuperación de contraseña requiere conexión.'); return }
    setResetLoading(true); setEmailError('')
    try {
      await resetPassword(email.trim())
      toast('Te hemos enviado un enlace para recuperar la contraseña', 5000, 'ok')
    } catch (error: any) {
      setEmailError(error?.message || 'No se pudo enviar el enlace de recuperación')
    } finally {
      setResetLoading(false)
    }
  }

  const handleRegister = async (email: string, password: string) => {
    setEmailError('')
    if (!online) { setEmailError('Crear la cuenta requiere conexión. Puedes seguir entrando con PIN.'); return }
    if (!isAuthReady()) { setEmailError('Sin conexión con el servidor. Usa el PIN.'); return }

    const eligibility: any = getRegistrationEligibility(db.employees, email)
    if (!eligibility.ok) {
      setEmailError(eligibility.reason === 'already_linked'
        ? 'Ya existe una cuenta para este empleado. Entra o recupera la contraseña.'
        : 'Ese email no figura en ningún empleado activo. Pide al administrador que revise tu ficha.')
      return
    }
    const passwordError = validateAccountPassword(password)
    if (passwordError) { setEmailError(passwordError); return }

    setRegisterLoading(true)
    interactiveEmailRef.current = true
    try {
      const result = await signUpEmail(normalizeAccountEmail(email), password)
      if (result.session && result.user?.id) {
        if (!linkAuthIdIfMissing(eligibility.employee, result.user.id)) {
          await authSignOut()
          setEmailError('Este empleado ya está vinculado a otra cuenta. Contacta al administrador.')
          return
        }
        doLogin(eligibility.employee, 'email')
        toast('Cuenta creada y vinculada correctamente', 5000, 'ok')
      } else {
        toast('Cuenta creada. Revisa tu correo y confirma el enlace antes de entrar.', 7000, 'ok')
      }
    } catch (error: any) {
      setEmailError(error?.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.')
    } finally {
      interactiveEmailRef.current = false
      setRegisterLoading(false)
    }
  }

  // ── Auth state change (Google OAuth / password reset) ─────────────────────

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange(async (event: string, session: any) => {
      if (event === 'PASSWORD_RECOVERY') { setMode('email'); return }
      if (event === 'SIGNED_IN' && session?.user?.email) {
        // signInWithPassword ya completa este flujo en handleEmailLogin. El
        // listener queda reservado para OAuth/restauración y evita dos fetches
        // y dos transiciones de pantalla compitiendo por la misma sesión.
        if (interactiveEmailRef.current) return
        const url = new URL(window.location.href)
        if (url.searchParams.get('reset') === '1' || window.location.hash.includes('type=recovery')) return
        const userEmail = session.user.email.toLowerCase()
        await useAppStore.getState().fetchDB()
        const freshDB = useAppStore.getState().db
        const emp = (freshDB.employees || []).find((e: any) => e.email?.toLowerCase() === userEmail)
        if (emp) {
          if (linkAuthIdIfMissing(emp, session.user.id)) doLogin(emp, 'oauth')
          else {
            await authSignOut()
            setEmailError('Este empleado ya está vinculado a otra cuenta. Contacta al administrador.')
          }
        } else {
          const configuredEmails = (freshDB.config?.adminEmails || []).map((x: string) => x.toLowerCase())
          if (configuredEmails.includes(userEmail)) doAdminLogin('oauth')
          else {
            await authSignOut()
            setEmailError('Cuenta no registrada. Contacta al administrador.')
          }
        }
        window.history.replaceState({}, '', window.location.pathname)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <Login
      mode={mode}
      onSetMode={setMode}
      employees={emps.map((e: any) => ({ id: e.id, name: e.name, dept: e.dept || e.centroTrabajo, pinLen: e.pinLen || (typeof e.pin === 'string' && !isPinHashed(e.pin) ? e.pin.length : 4) }))}
      pin={pin}
      selectedEmpId={selectedEmpId}
      onSelectEmp={handleSelectEmp}
      onPinKey={handlePinKey}
      onPinDel={handlePinDel}
      pinError={pinError}
      pinShaking={pinShaking}
      pinLocked={pinLocked}
      bioAvailable={bioAvailable}
      empHasBio={empHasBio}
      onBioLogin={handleBioLogin}
      bioLoading={bioLoading}
      onLogin={handleEmailLogin}
      onRegister={handleRegister}
      onForgotPassword={handleForgotPassword}
      resetLoading={resetLoading}
      emailLoading={emailLoading}
      registerLoading={registerLoading}
      emailError={emailError}
      online={online}
      lastSyncLabel={lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : undefined}
    />
  )
}
