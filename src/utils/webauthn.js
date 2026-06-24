// WebAuthn helpers — biometric login (fingerprint / Face ID / Windows Hello)
// Works on any platform authenticator via the Web Authentication API.
// Credentials are stored in the device's secure enclave; we only persist
// the credential ID in localStorage so we can request the right credential.

const BIO_KEY = (empId) => `bio_cred_${empId}`
const BIO_OFFER_KEY = (empId) => `bio_offer_dismiss_${empId}`

function getRpId() {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' ? host : host
}

export function isBiometricSupported() {
  return typeof PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
}

export async function checkPlatformAuth() {
  if (!isBiometricSupported()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function hasBiometric(empId) {
  try { return !!localStorage.getItem(BIO_KEY(empId)) } catch { return false }
}

export function clearBiometric(empId) {
  try { localStorage.removeItem(BIO_KEY(empId)) } catch {}
}

export function isBioOfferDismissed(empId) {
  try { return localStorage.getItem(BIO_OFFER_KEY(empId)) === '1' } catch { return false }
}

export function dismissBioOffer(empId) {
  try { localStorage.setItem(BIO_OFFER_KEY(empId), '1') } catch {}
}

export async function registerBiometric(empId, empName) {
  if (!isBiometricSupported()) throw new Error('WebAuthn no disponible en este navegador')

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userIdBytes = new TextEncoder().encode(empId.slice(0, 32).padEnd(32, '0'))

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'TIMES INC', id: getRpId() },
      user: { id: userIdBytes, name: empName, displayName: empName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256 (preferred)
        { type: 'public-key', alg: -257 },  // RS256 (Windows Hello fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })

  const rawId = new Uint8Array(credential.rawId)
  const credId = btoa(String.fromCharCode(...rawId))
  localStorage.setItem(BIO_KEY(empId), credId)
  return true
}

export async function authenticateBiometric(empId) {
  if (!isBiometricSupported()) return false
  const stored = localStorage.getItem(BIO_KEY(empId))
  if (!stored) return false

  try {
    const rawId = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return true
  } catch (err) {
    if (err.name === 'NotAllowedError') return false
    // Credential may have been deleted from device — clear our stored ID
    if (err.name === 'InvalidStateError' || err.name === 'NotFoundError') {
      clearBiometric(empId)
    }
    return false
  }
}

export function hexToHsl(hex) {
  if (!hex || hex.length < 7) return [240, 70, 60]
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

export function applyBrandColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
  const root = document.documentElement
  const [h, s, l] = hexToHsl(hex)
  const hShift = (h + 28) % 360
  root.style.setProperty('--primary', hex)
  root.style.setProperty('--primary-light', `hsl(${h},${Math.min(s + 5, 100)}%,${Math.min(l + 22, 90)}%)`)
  root.style.setProperty('--primary-glow', hex + '30')
  root.style.setProperty('--primary-dim', hex + '15')
  root.style.setProperty('--grad-primary', `linear-gradient(135deg, ${hex} 0%, hsl(${hShift},${Math.min(s + 15, 100)}%,${Math.max(l - 8, 20)}%) 100%)`)
}

export function removeBrandColor() {
  const root = document.documentElement
  ;['--primary', '--primary-light', '--primary-glow', '--primary-dim', '--grad-primary'].forEach(v =>
    root.style.removeProperty(v)
  )
}
