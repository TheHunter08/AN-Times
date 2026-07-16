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
