import { FB_CONFIG } from '../config/constants.js'

let _fbReady = false
let _fbLoading = false
let _auth = null

export function loadFirebase(callback) {
  if (_fbReady) { callback?.(); return }
  if (_fbLoading) {
    const check = setInterval(() => { if (_fbReady) { clearInterval(check); callback?.() } }, 100)
    return
  }
  _fbLoading = true

  const s1 = document.createElement('script')
  s1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js'
  s1.onerror = () => { _fbLoading = false; console.warn('[TIMES] Firebase no disponible') }
  s1.onload = () => {
    const s2 = document.createElement('script')
    s2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js'
    s2.onerror = () => { _fbLoading = false }
    s2.onload = () => {
      try {
        if (!window.firebase.apps.length) window.firebase.initializeApp(FB_CONFIG)
        _auth = window.firebase.auth()
        const gProv = new window.firebase.auth.GoogleAuthProvider()
        gProv.setCustomParameters({ prompt: 'select_account' })
        window._fbGoogleProv = gProv
        _fbReady = true
        _fbLoading = false
        callback?.()
      } catch(err) {
        _fbLoading = false
        console.warn('[TIMES] Firebase init:', err.message)
      }
    }
    document.head.appendChild(s2)
  }
  document.head.appendChild(s1)
}

export const signInEmail = (email, pass) => {
  if (!_auth) return Promise.reject(new Error('Firebase no cargado'))
  return _auth.signInWithEmailAndPassword(email, pass)
}

export const signInGoogle = () => {
  if (!_auth) return Promise.reject(new Error('Firebase no cargado'))
  return _auth.signInWithPopup(window._fbGoogleProv)
}

export const signOut = () => _auth ? _auth.signOut() : Promise.resolve()

export const resetPassword = email => {
  if (!_auth) return Promise.reject(new Error('Firebase no cargado'))
  return _auth.sendPasswordResetEmail(email)
}

export const isFirebaseReady = () => _fbReady

export const AUTH_ERRORS = {
  'auth/invalid-email':          'Email no válido',
  'auth/wrong-password':         'Contraseña incorrecta',
  'auth/invalid-credential':     'Email o contraseña incorrectos',
  'auth/user-not-found':         'No existe cuenta con ese email',
  'auth/too-many-requests':      'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Verifica tu internet.',
  'auth/user-disabled':          'Esta cuenta ha sido desactivada.',
  'auth/popup-blocked':          'Permite popups en tu navegador',
  'auth/popup-closed-by-user':   null,
  'auth/cancelled-popup-request': null
}
