// Login v2 — UI nueva conectada a toda la lógica real de auth:
// PIN + biométrico + email/password + admin.
// CLAUDE.md: UI only — preservar auth y lógica de negocio intacta.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Login } from './pages/Login.js'
import { useAppStore } from '../store/appStore.js'
import { linkEmployeeAuthIdentity, relinkEmployeeAuthIdentity } from '../utils/authIdentity.js'
import { useShallow } from 'zustand/react/shallow'
import { activateAccountWithPin, searchAccountEmployees, signInEmail, signOut as authSignOut, isAuthReady, onAuthStateChange, resetPassword, resendConfirmationEmail, updatePassword } from '../services/authService.js'
import { getActiveEmployeesByEmail, getEmployeeActivationEligibility, getRegistrationEligibility, isValidAccountEmail, normalizeAccountEmail, validateAccountPassword, verifyRegistrationPin } from '../utils/authRegistration.js'
import { sortedEmps } from '../utils/time.js'
import { auditLog } from '../services/dataService.js'
import {
  isPinHashed, verifyPin, getLockoutState, recordFailedAttempt,
  clearLockout, hashPin, needsRehash,
} from '../utils/pinSecurity.js'
import { clearPinToken } from '../utils/pinAuthToken.js'
import { checkPlatformAuth, hasBiometric, authenticateBiometric } from '../utils/webauthn.js'
import { useConnectivity } from '../hooks/useConnectivity.js'
import type { LoginMode } from './pages/Login.js'
import { SECURITY_DEPLOYMENT } from '../config/securityDeployment.js'

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
  const [mode, setMode] = useState<LoginMode>(() => {
    const url = new URL(window.location.href)
    return SECURITY_DEPLOYMENT.requireOfficialAuth || url.searchParams.get('reset') === '1' || window.location.hash.includes('type=recovery') ? 'email' : 'pin'
  })

  // PIN state
  const [pin, setPin]               = useState('')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [rememberedEmpId, setRememberedEmpId] = useState('')
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
  const [emailPinRequired, setEmailPinRequired] = useState(false)
  const [emailError, setEmailError]     = useState('')
  const [registrationNotice, setRegistrationNotice] = useState('')
  const [requiredActivation, setRequiredActivation] = useState<null | {
    employeeId:string
    employeeName:string
    email:string
    verifiedPin:string
    expiresAt:number
  }>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(() => {
    const url = new URL(window.location.href)
    return url.searchParams.get('reset') === '1' || window.location.hash.includes('type=recovery')
  })
  const [confirmationLoading, setConfirmationLoading] = useState(false)
  const [activationEmployees, setActivationEmployees] = useState<any[]>([])
  const [employeeDirectoryLoading, setEmployeeDirectoryLoading] = useState(false)
  const { online } = useConnectivity()

  const verifyingRef = useRef(false)
  const opIdRef      = useRef(0)
  const interactiveEmailRef = useRef(false)

  const emps = sortedEmps(db).filter((e: any) => !e.isAdmin && !e.baja)

  const handleEmployeeSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setActivationEmployees([])
      setEmployeeDirectoryLoading(false)
      return
    }
    setEmployeeDirectoryLoading(true)
    try {
      setActivationEmployees(await searchAccountEmployees(query))
    } catch (error: any) {
      setActivationEmployees([])
      setEmailError(error?.message || 'No se pudo consultar el directorio de activación')
    } finally {
      setEmployeeDirectoryLoading(false)
    }
  }, [])

  // Recordar último empleado seleccionado
  useEffect(() => {
    try {
      const rem = JSON.parse(localStorage.getItem('an_times_rem') || 'null')
      if (rem?.empId) setRememberedEmpId(rem.empId)
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
    if (!authUserId) return { ok:false, changed:false, reason:'missing_auth_user' }
    let outcome: any = { ok:false, changed:false, reason:'employee_not_found' }
    saveDB((fresh: any) => {
      const result = linkEmployeeAuthIdentity(fresh.employees, emp.id, authUserId)
      outcome = result
      return result.changed ? { employees:result.employees } : null
    })
    return outcome
  }, [saveDB])

  const relinkAuthIdAfterProof = useCallback((emp: any, expectedAuthId: string, nextAuthId?: string | null) => {
    if (!nextAuthId) return false
    let relinked = false
    saveDB((fresh: any) => {
      const result = relinkEmployeeAuthIdentity(fresh.employees, emp.id, expectedAuthId, nextAuthId)
      relinked = result.ok
      if (!result.changed) return null
      const withAudit = auditLog(fresh, 'Cuenta de acceso recuperada', emp.name || emp.id, emp.name || 'Empleado', {
        category:'seguridad', entityType:'employee', entityId:emp.id,
        before:{ authId:expectedAuthId }, after:{ authId:nextAuthId },
      })
      return { employees:result.employees, audit:withAudit.audit }
    })
    return relinked
  }, [saveDB])

  const applyImmediateAccountActivation = useCallback((emp: any, email: string, authId: string) => {
    const nowIso = new Date().toISOString()
    saveDB((fresh: any) => {
      const current = (fresh.employees || []).find((item: any) => item.id === emp.id)
      if (!current) return null
      const employees = (fresh.employees || []).map((item: any) => item.id === emp.id
        ? {
            ...item,
            email:normalizeAccountEmail(email),
            authId,
            auth_id:authId,
            authActivationPending:false,
            authActivatedAt:nowIso,
            _upd:nowIso,
          }
        : item)
      const withAudit = auditLog(fresh, 'Cuenta oficial activada', current.name || current.id, current.name || 'Empleado', {
        category:'seguridad', entityType:'employee', entityId:current.id,
        before:{ email:current.email || null, authId:current.authId || current.auth_id || null },
        after:{ email:normalizeAccountEmail(email), authId },
      })
      return { employees, audit:withAudit.audit }
    })
  }, [saveDB])

  const markOfficialAccountConfirmed = useCallback((employeeId: string) => {
    saveDB((fresh: any) => {
      const current = (fresh.employees || []).find((item: any) => item.id === employeeId)
      if (!current?.authActivationPending) return null
      const nowIso = new Date().toISOString()
      return {
        employees:(fresh.employees || []).map((item: any) => item.id === employeeId
          ? { ...item, authActivationPending:false, _upd:nowIso }
          : item),
      }
    })
  }, [saveDB])

  // ── PIN handlers ──────────────────────────────────────────────────────────

  const handlePinKey = useCallback(async (k: string) => {
    if (!SECURITY_DEPLOYMENT.allowPrimaryPinLogin) {
      setPinError('En el modo seguro debes acceder con tu cuenta de email.')
      setMode('email')
      return
    }
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
      // Migrar PIN plano o hash legacy (SHA-256 sin sal, débil, o PBKDF2 100k)
      // → PBKDF2 600k actual. isPinHashed() da true también para cualquier
      // hash legacy, así que no sirve aquí para decidir si hace falta migrar
      // — needsRehash() sí distingue "ya está en el mejor formato" de "hay
      // que rehashear". Si solo falta pinLen pero el hash ya es el actual,
      // se reutiliza tal cual en vez de recalcularlo sin necesidad.
      if (needsRehash(emp.pin) || !emp.pinLen) {
        const hashed = needsRehash(emp.pin) ? await hashPin(newPin, emp.id) : emp.pin
        const nowIso = new Date().toISOString()
        useAppStore.getState().saveDB((fresh: any) => ({
          employees: (fresh.employees || []).map((e: any) =>
            e.id === emp.id ? { ...e, pin: hashed, pinLen: newPin.length, _upd:nowIso } : e
          ),
        }))
      }
      if (!isValidAccountEmail(emp.email) || !(emp.authId || emp.auth_id) || emp.authActivationPending) {
        setRequiredActivation({
          employeeId:emp.id,
          employeeName:emp.name || 'Empleado',
          email:isValidAccountEmail(emp.email) ? normalizeAccountEmail(emp.email) : '',
          verifiedPin:newPin,
          expiresAt:Date.now() + 10 * 60 * 1000,
        })
        setMode('email')
        setEmailError('Para continuar debes activar tu cuenta oficial con un correo al que tengas acceso.')
        setPin('')
        clearPinToken()
        return
      }
      doLogin(emp)
      setPin('')
      // La sesión JWT personalizada por PIN está retirada definitivamente:
      // dependía del Legacy JWT Secret y la inyección manual llegó a combinar
      // dos cabeceras Authorization, rompiendo las escrituras. El PIN conserva
      // la sesión local y limpia cualquier token guardado por versiones viejas.
      // auth_id solo se vincula con una identidad real de Supabase Auth en los
      // flujos de email/OAuth.
      clearPinToken()
    } else if (!knownLen && newPin.length < maxLen) {
      // Longitud desconocida (legacy) — esperar más dígitos sin error
    } else {
      const { state: lk, lockoutData } = recordFailedAttempt(emp.id, db) as any
      // recordFailedAttempt devuelve lockoutData null si el estado fresco ya
      // está bloqueado (p.ej. el bloqueo llegó por realtime entre ambas
      // llamadas) — en ese caso no hay nada que guardar; escribir null aquí
      // borraría el mapa entero de bloqueos de todos los empleados.
      if (lockoutData) saveDB((fresh: any) => {
        const next = recordFailedAttempt(emp.id, fresh).lockoutData
        return next ? { pinLockouts: next } : {}
      })
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
    if (!SECURITY_DEPLOYMENT.allowPrimaryBiometricLogin) {
      setPinError('En el modo seguro debes acceder con tu cuenta de email.')
      setMode('email')
      return
    }
    if (!selectedEmpId) return
    const emp = (db.employees || []).find((e: any) => e.id === selectedEmpId)
    if (!emp) return
    setBioLoading(true)
    try {
      const ok = await authenticateBiometric(emp.id)
      if (ok && (!isValidAccountEmail(emp.email) || !(emp.authId || emp.auth_id) || emp.authActivationPending)) {
        setPinError('Para activar tu cuenta oficial, introduce tu PIN una última vez y después añade tu correo.')
      } else if (ok) doLogin(emp, 'biometric')
      else setPinError('Autenticación biométrica fallida')
    } catch {
      setPinError('Error en autenticación biométrica')
    }
    setBioLoading(false)
  }

  // ── Email login ───────────────────────────────────────────────────────────

  const handleEmailLogin = async (email: string, password: string, employeePin: string) => {
    setEmailError('')
    const lk = getEmailLockout()
    if (lk.locked) {
      const m = Math.floor((lk.remainingSecs || 0) / 60), s = (lk.remainingSecs || 0) % 60
      setEmailError(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`); return
    }
    if (!isAuthReady()) { setEmailError('Sin conexión con el servidor. Usa el PIN.'); return }
    setEmailLoading(true)
    interactiveEmailRef.current = true
    let credentialsAccepted = false
    try {
      const result = await signInEmail(email.trim(), password)
      credentialsAccepted = true
      const userEmail = result.user?.email
      clearEmailLockout()
      // El arranque puede tener todavía una lectura sin sesión en curso. En
      // modo Auth/RLS, fetchDB devuelve pronto si dbLoading ya está activo y
      // agenda una segunda lectura; no debemos buscar el perfil hasta que esa
      // lectura autenticada haya terminado o mostraríamos falsamente
      // «cuenta no registrada» a un empleado válido.
      await useAppStore.getState().fetchDB({ forceTables:true })
      const refreshDeadline = Date.now() + 10_000
      while (
        (useAppStore.getState().dbLoading || useAppStore.getState().dbRefreshPending)
        && Date.now() < refreshDeadline
      ) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const freshDB = useAppStore.getState().db
      const em = normalizeAccountEmail(userEmail)
      const matchingEmployees = getActiveEmployeesByEmail(freshDB.employees, em)
      if (matchingEmployees.length > 1) {
        await authSignOut()
        setEmailError('Ese correo aparece en varios empleados. El administrador debe corregir los perfiles antes de vincular la cuenta.')
        return
      }
      const emp = matchingEmployees[0]
      const authUserId = result.user?.id
      const configuredEmails = (freshDB.config?.adminEmails || []).map((x: string) => normalizeAccountEmail(x))
      const configuredAdmin = configuredEmails.includes(em || '')
      const employeeAdmin = !!emp && (emp.isAdmin || emp.role === 'admin' || emp.role === 'jefe_obra')
      const linkedAuthId = emp && (emp.authId || emp.auth_id)
      const identityMismatch = Boolean(emp && linkedAuthId && authUserId && linkedAuthId !== authUserId)
      if (emp && (!linkedAuthId || identityMismatch)) {
        const pinLockout: any = getLockoutState(emp.id, freshDB)
        if (pinLockout.locked) {
          await authSignOut()
          setEmailPinRequired(true)
          setEmailError(`PIN bloqueado temporalmente. Inténtalo en ${pinLockout.remainingMin || 1} min.`)
          return
        }
        const pinCheck: any = await verifyRegistrationPin(emp, employeePin)
        if (!pinCheck.ok) {
          await authSignOut()
          setEmailPinRequired(true)
          if (pinCheck.reason === 'employee_without_pin') {
            setEmailError('Tu perfil todavía no tiene PIN. Pide al administrador que lo configure antes de vincular la cuenta.')
            return
          }
          if (pinCheck.reason === 'missing_pin') {
            setEmailError(identityMismatch
              ? 'La vinculación anterior no coincide. Introduce tu PIN de fichaje para recuperar el acceso con esta cuenta.'
              : 'Introduce tu PIN de fichaje para completar esta primera vinculación.')
            return
          }
          let failedState: any = null
          saveDB((fresh: any) => {
            const failed: any = recordFailedAttempt(emp.id, fresh)
            failedState = failed.state
            return failed.lockoutData ? { pinLockouts:failed.lockoutData } : null
          })
          setEmailError(failedState?.locked
            ? 'PIN incorrecto. El perfil ha quedado bloqueado temporalmente.'
            : `PIN incorrecto${failedState?.remaining != null ? ` (${failedState.remaining} intentos)` : ''}.`)
          return
        }
        saveDB((fresh: any) => ({ pinLockouts:clearLockout(emp.id, fresh) }))
      }
      const identityLinkResult: any = emp && identityMismatch
        ? { ok:relinkAuthIdAfterProof(emp, linkedAuthId, authUserId) }
        : emp
          ? linkAuthIdIfMissing(emp, authUserId)
          : { ok:true }
      if (emp && !identityLinkResult.ok) {
        await authSignOut()
        setEmailError(identityLinkResult.reason === 'identity_in_use'
          ? 'Esta cuenta ya está vinculada a otro perfil. Pide al administrador que revise el vínculo anterior.'
          : 'La vinculación cambió mientras verificábamos el acceso. Inténtalo de nuevo o contacta al administrador.')
        return
      }
      if (identityMismatch) toast('Cuenta recuperada y vinculada correctamente', 5000, 'ok')
      if (emp) markOfficialAccountConfirmed(emp.id)
      if (emp && employeeAdmin) {
        setEmailPinRequired(false)
        doLogin(emp, 'email')
      } else if (!emp && configuredAdmin) {
        await authSignOut()
        setEmailError('La cuenta administrativa debe vincularse a su perfil oficial. Usa «Primera vez: vincular mi cuenta», selecciona el perfil administrador e introduce su PIN.')
      } else if (emp) {
        setEmailPinRequired(false)
        doLogin(emp, 'email')
      } else {
        await authSignOut()
        recordEmailFailed()
        setEmailError('Tu cuenta no está registrada. Contacta al administrador.')
      }
    } catch (ex: any) {
      await authSignOut()
      const newLk: any = credentialsAccepted ? null : recordEmailFailed()
      if (newLk?.locked) {
        const m = Math.floor((newLk.remainingSecs || 0) / 60), s = (newLk.remainingSecs || 0) % 60
        setEmailError(`Demasiados intentos. Bloqueado — ${m}:${String(s).padStart(2, '0')} restantes`)
      } else {
        const remaining = newLk?.remaining != null ? ` (${newLk.remaining} intentos)` : ''
        setEmailError((ex?.message || 'Email o contraseña incorrectos') + remaining)
      }
    } finally {
      interactiveEmailRef.current = false
      setEmailLoading(false)
    }
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

  const handleUpdatePassword = async (password: string, confirmation: string) => {
    setEmailError('')
    const passwordError = validateAccountPassword(password)
    if (passwordError) { setEmailError(passwordError); return }
    if (password !== confirmation) { setEmailError('Las contraseñas no coinciden.'); return }
    if (!online) { setEmailError('Cambiar la contraseña requiere conexión.'); return }

    setRecoveryLoading(true)
    interactiveEmailRef.current = true
    try {
      await updatePassword(password)
      await authSignOut()
      setRecoveryMode(false)
      window.history.replaceState({}, '', window.location.pathname)
      toast('Contraseña actualizada. Ya puedes iniciar sesión.', 6000, 'ok')
    } catch (error: any) {
      setEmailError(error?.message || 'No se pudo actualizar la contraseña. Solicita un enlace nuevo.')
    } finally {
      interactiveEmailRef.current = false
      setRecoveryLoading(false)
    }
  }

  const handleResendConfirmation = async (email: string) => {
    if (!email.trim()) { setEmailError('Introduce primero tu email.'); return }
    if (!online) { setEmailError('Reenviar la confirmación requiere conexión.'); return }
    setConfirmationLoading(true)
    setEmailError('')
    try {
      await resendConfirmationEmail(normalizeAccountEmail(email))
      toast('Si la cuenta está pendiente, recibirás un nuevo enlace. Revisa también spam.', 7000, 'ok')
    } catch (error: any) {
      setEmailError(error?.message || 'No se pudo reenviar la confirmación')
    } finally {
      setConfirmationLoading(false)
    }
  }

  const handleRegister = async (email: string, password: string, employeePin: string) => {
    setEmailError('')
    setRegistrationNotice('')
    if (!online) { setEmailError('Crear la cuenta requiere conexión. Puedes seguir entrando con PIN.'); return }
    if (!isAuthReady()) { setEmailError('Sin conexión con el servidor. Usa el PIN.'); return }

    const selectedActivationEmployee = activationEmployees.find(item => item.id === selectedEmpId)
    if (selectedActivationEmployee && !requiredActivation) {
      const employee = selectedActivationEmployee
      if (!employee) { setEmailError('Busca y selecciona primero tu perfil de empleado.'); return }
      const normalizedEmail = normalizeAccountEmail(email)
      if (!isValidAccountEmail(normalizedEmail)) { setEmailError('Introduce un correo válido al que tengas acceso.'); return }
      const passwordError = validateAccountPassword(password)
      if (passwordError) { setEmailError(passwordError); return }
      if (!/^\d{4,6}$/.test(employeePin)) { setEmailError('Introduce tu PIN habitual de fichaje.'); return }

      setRegisterLoading(true)
      interactiveEmailRef.current = true
      try {
        const activation = await activateAccountWithPin(employee.id, employeePin, normalizedEmail, password)
        await signInEmail(normalizedEmail, password)
        await useAppStore.getState().fetchDB({ forceTables:true })
        const freshEmployee = (useAppStore.getState().db.employees || []).find((item: any) => item.id === employee.id)
        if (!freshEmployee) throw new Error('La cuenta se activó, pero no se pudo cargar el perfil. Cierra y vuelve a entrar.')
        setActivationEmployees([])
        setSelectedEmpId('')
        doLogin(freshEmployee, 'email')
        toast(activation.created ? 'Cuenta creada y activada correctamente' : 'Cuenta recuperada y activada correctamente', 6000, 'ok')
      } catch (error: any) {
        await authSignOut()
        setEmailError(error?.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.')
      } finally {
        interactiveEmailRef.current = false
        setRegisterLoading(false)
      }
      return
    }

    // Una identidad guardada puede apuntar a un usuario de Supabase Auth que
    // ya fue eliminado. Tras acreditar el PIN permitimos intentar recrearlo:
    // Supabase seguirá rechazando el alta si la cuenta anterior aún existe.
    const forcedActivation = requiredActivation && requiredActivation.expiresAt > Date.now()
      ? requiredActivation
      : null
    if (requiredActivation && !forcedActivation) {
      setRequiredActivation(null)
      setMode('pin')
      setEmailError('La comprobación del PIN ha caducado. Selecciona de nuevo tu perfil e introduce el PIN.')
      return
    }
    const eligibility: any = forcedActivation
      ? getEmployeeActivationEligibility(db.employees, forcedActivation.employeeId, email)
      : getRegistrationEligibility(db.employees, email, { allowLinkedRecovery:true })
    if (!eligibility.ok) {
      setEmailError(
        eligibility.reason === 'already_linked'
          ? 'Ya existe una cuenta para este empleado. Entra o recupera la contraseña.'
          : eligibility.reason === 'duplicate_email'
            ? 'Ese correo aparece en varios empleados. El administrador debe corregir los perfiles antes de crear la cuenta.'
            : 'Ese email no figura en ningún empleado activo. Pide al administrador que revise tu ficha.',
      )
      return
    }
    const passwordError = validateAccountPassword(password)
    if (passwordError) { setEmailError(passwordError); return }
    const pinLockout: any = getLockoutState(eligibility.employee.id, db)
    if (pinLockout.locked) {
      setEmailError(`PIN bloqueado temporalmente. Inténtalo en ${pinLockout.remainingMin || 1} min.`)
      return
    }
    const pinCheck: any = forcedActivation
      ? await verifyRegistrationPin(eligibility.employee, forcedActivation.verifiedPin)
      : await verifyRegistrationPin(eligibility.employee, employeePin)
    if (!pinCheck.ok) {
      if (pinCheck.reason === 'employee_without_pin') {
        setEmailError('Tu perfil todavía no tiene PIN. Pide al administrador que lo configure antes de crear la cuenta.')
        return
      }
      let failedState: any = null
      saveDB((fresh: any) => {
        const failed: any = recordFailedAttempt(eligibility.employee.id, fresh)
        failedState = failed.state
        return failed.lockoutData ? { pinLockouts:failed.lockoutData } : null
      })
      setEmailError(failedState?.locked
        ? 'PIN incorrecto. El perfil ha quedado bloqueado temporalmente.'
        : `PIN incorrecto${failedState?.remaining != null ? ` (${failedState.remaining} intentos)` : ''}.`)
      return
    }
    saveDB((fresh: any) => ({ pinLockouts:clearLockout(eligibility.employee.id, fresh) }))

    setRegisterLoading(true)
    interactiveEmailRef.current = true
    try {
      const normalizedEmail = normalizeAccountEmail(email)
      const activationPin = forcedActivation?.verifiedPin || employeePin
      const activation = await activateAccountWithPin(eligibility.employee.id, activationPin, normalizedEmail, password)
      applyImmediateAccountActivation(eligibility.employee, activation.email, activation.authId)
      await signInEmail(normalizedEmail, password)
      await useAppStore.getState().fetchDB()
      const freshEmployee = (useAppStore.getState().db.employees || []).find((item: any) => item.id === eligibility.employee.id)
      setRequiredActivation(null)
      doLogin(freshEmployee || {
        ...eligibility.employee,
        email:activation.email,
        authId:activation.authId,
        auth_id:activation.authId,
        authActivationPending:false,
      }, 'email')
      toast(
        activation.created ? 'Cuenta creada y activada correctamente' : 'Cuenta recuperada y activada correctamente',
        6000,
        'ok',
      )
    } catch (error: any) {
      setEmailError(error?.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.')
    } finally {
      interactiveEmailRef.current = false
      setRegisterLoading(false)
    }
  }

  // ── Auth state change (Google OAuth / password reset) ─────────────────────

  useEffect(() => {
    let active = true
    let lastScheduledSession = ''
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

    const processExternalSession = async (session: any) => {
      if (!active) return
      const userEmail = normalizeAccountEmail(session.user.email)
      await useAppStore.getState().fetchDB()
      if (!active) return

      const freshDB = useAppStore.getState().db
      const matchingEmployees = getActiveEmployeesByEmail(freshDB.employees, userEmail)
      if (matchingEmployees.length > 1) {
        await authSignOut()
        if (!active) return
        setMode('email')
        setEmailError('Ese correo aparece en varios empleados. El administrador debe corregir los perfiles antes de continuar.')
        return
      }
      const emp = matchingEmployees[0]
      if (emp) {
        const linkedAuthId = emp.authId || emp.auth_id
        if (!linkedAuthId) {
          await authSignOut()
          if (!active) return
          setMode('email')
          setEmailPinRequired(true)
          setEmailError('Introduce correo, contraseña y tu PIN de fichaje para completar la primera vinculación.')
        } else if (linkedAuthId === session.user.id) {
          markOfficialAccountConfirmed(emp.id)
          doLogin(emp, 'oauth')
        } else {
          await authSignOut()
          if (!active) return
          setEmailError('Este empleado ya está vinculado a otra cuenta. Contacta al administrador.')
        }
      } else {
        const configuredEmails = (freshDB.config?.adminEmails || []).map((x: string) => normalizeAccountEmail(x))
        if (configuredEmails.includes(userEmail)) {
          await authSignOut()
          if (!active) return
          setMode('email')
          setEmailError('La cuenta administrativa debe vincularse a su perfil oficial mediante «Primera vez: vincular mi cuenta» y el PIN del administrador.')
        }
        else {
          await authSignOut()
          if (!active) return
          setEmailError('Cuenta no registrada. Contacta al administrador.')
        }
      }
      if (active) window.history.replaceState({}, '', window.location.pathname)
    }

    const deferExternalSession = (session: any) => {
      const sessionKey = `${session.user.id}:${session.access_token || ''}`
      if (sessionKey === lastScheduledSession) return
      lastScheduledSession = sessionKey

      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        void processExternalSession(session).catch(() => {
          if (!active) return
          setMode('email')
          setEmailError('No se pudo completar la sesión. Comprueba la conexión e inténtalo de nuevo.')
        })
      }, 0)
      pendingTimers.add(timer)
    }

    // El callback debe permanecer síncrono: supabase-js puede bloquear el
    // cliente si se espera otra llamada de Supabase dentro de este evento.
    const { data: { subscription } } = onAuthStateChange((event: string, session: any) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('email')
        setRecoveryMode(true)
        setEmailError('')
        setRegistrationNotice('')
        return
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.email) {
        // signInWithPassword ya completa este flujo en handleEmailLogin. El
        // listener queda reservado para OAuth/restauración y evita dos fetches
        // y dos transiciones de pantalla compitiendo por la misma sesión.
        if (interactiveEmailRef.current) return
        const url = new URL(window.location.href)
        if (url.searchParams.get('reset') === '1' || window.location.hash.includes('type=recovery')) return
        deferExternalSession(session)
      }
    })
    return () => {
      active = false
      pendingTimers.forEach((timer) => clearTimeout(timer))
      pendingTimers.clear()
      subscription.unsubscribe()
    }
  }, [])

  return (
    <Login
      mode={mode}
      onSetMode={setMode}
      employees={emps.map((e: any) => ({ id: e.id, name: e.name, dept: e.dept || e.centroTrabajo, pinLen: e.pinLen || (typeof e.pin === 'string' && !isPinHashed(e.pin) ? e.pin.length : 4) }))}
      activationEmployees={activationEmployees.map((e: any) => ({ id:e.id, name:e.name, dept:e.dept, pinLen:e.pinLen }))}
      pin={pin}
      selectedEmpId={selectedEmpId}
      onSelectEmp={handleSelectEmp}
      hasRememberedEmployee={!!rememberedEmpId && emps.some((employee: any) => employee.id === rememberedEmpId)}
      onUseRememberedEmployee={() => {
        if (rememberedEmpId && emps.some((employee: any) => employee.id === rememberedEmpId)) handleSelectEmp(rememberedEmpId)
      }}
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
      onUpdatePassword={handleUpdatePassword}
      onResendConfirmation={handleResendConfirmation}
      resetLoading={resetLoading}
      recoveryLoading={recoveryLoading}
      recoveryMode={recoveryMode}
      confirmationLoading={confirmationLoading}
      emailLoading={emailLoading}
      registerLoading={registerLoading}
      emailPinRequired={emailPinRequired}
      emailError={emailError}
      registrationNotice={registrationNotice}
      requiredAccountActivation={requiredActivation ? {
        employeeId:requiredActivation.employeeId,
        employeeName:requiredActivation.employeeName,
        email:requiredActivation.email,
      } : null}
      onRegistrationNoticeDone={() => setRegistrationNotice('')}
      online={online}
      lastSyncLabel={lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : undefined}
      allowPinLogin={SECURITY_DEPLOYMENT.allowPrimaryPinLogin}
      accountActivationRequiresEmployeeSelection={SECURITY_DEPLOYMENT.requireOfficialAuth}
      accountActivationEmployeeSearch
      employeeDirectoryLoading={employeeDirectoryLoading}
      onEmployeeSearch={handleEmployeeSearch}
    />
  )
}
