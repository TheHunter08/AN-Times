import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'an_pwa_install_dismissed'
const DISMISS_DAYS = 7

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isInStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}
function isDismissed() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return false
    return Date.now() - parseInt(v, 10) < DISMISS_DAYS * 86400_000
  } catch { return false }
}
function dismiss() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch {}
}

// ─── iOS Install Guide Modal ───────────────────────────────────────────────
function IOSGuide({ onClose }) {
  return (
    <div className="pwa-ios-modal" onClick={onClose}>
      <div className="pwa-ios-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <h3>Instalar TIMES INC</h3>
            <p>Accede más rápido desde tu pantalla de inicio</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', padding:'0 0 0 12px', lineHeight:1 }}>×</button>
        </div>
        {[
          { icon: '⬆️', text: <><strong>Pulsa el botón compartir</strong> (⬆️) en la barra de Safari</> },
          { icon: '📋', text: <><strong>Desplázate</strong> y toca <strong>"Añadir a pantalla de inicio"</strong></> },
          { icon: '✅', text: <><strong>Confirma</strong> tocando "Añadir" en la esquina superior derecha</> },
        ].map(({ icon, text }, i) => (
          <div key={i} className="pwa-ios-step">
            <div className="pwa-ios-step-num">{i + 1}</div>
            <div className="pwa-ios-step-text">{icon} {text}</div>
          </div>
        ))}
        <button className="pwa-ios-close" onClick={onClose}>Entendido</button>
      </div>
    </div>
  )
}

// ─── PWA Install Banner ────────────────────────────────────────────────────
export function PWAInstall() {
  const [prompt, setPrompt]       = useState(null)   // BeforeInstallPromptEvent
  const [showIOS, setShowIOS]     = useState(false)
  const [visible, setVisible]     = useState(false)
  const [installed, setInstalled] = useState(isInStandalone)

  useEffect(() => {
    if (installed || isDismissed()) return

    // Android/Chrome — captura el evento de instalación nativo
    const onPrompt = (e) => {
      e.preventDefault()
      setPrompt(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS — mostrar guía manual (no hay evento nativo)
    if (isIOS() && !isInStandalone()) {
      // Mostrar solo después de 2s para no bloquear el inicio
      const t = setTimeout(() => setVisible(true), 2000)
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onPrompt) }
    }

    // Detectar si se instaló
    const onInstalled = () => { setInstalled(true); setVisible(false) }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed])

  const handleInstall = useCallback(async () => {
    if (isIOS()) {
      setShowIOS(true)
      return
    }
    if (prompt) {
      prompt.prompt()
      const result = await prompt.userChoice
      if (result.outcome === 'accepted') setInstalled(true)
      setPrompt(null)
      setVisible(false)
    }
  }, [prompt])

  const handleDismiss = useCallback(() => {
    dismiss()
    setVisible(false)
  }, [])

  if (!visible || installed) return null

  return (
    <>
      <div className="pwa-install-bar">
        <div className="pwa-install-bar-icon">
          <svg viewBox="0 0 44 44" width="26" height="26" fill="none">
            <rect width="44" height="44" rx="10" fill="rgba(255,255,255,.2)"/>
            <rect x="11.5" y="14.5" width="21" height="4.4" rx="2.2" fill="white"/>
            <rect x="19.8" y="14.5" width="4.4" height="15.5" rx="2.2" fill="white"/>
          </svg>
        </div>
        <div className="pwa-install-bar-text">
          <div className="pwa-install-bar-title">Instalar TIMES INC</div>
          <div className="pwa-install-bar-sub">Acceso rápido · Funciona offline</div>
        </div>
        <button className="pwa-install-bar-btn" onClick={handleInstall}>
          {isIOS() ? 'Cómo instalar' : 'Instalar'}
        </button>
        <button className="pwa-install-bar-close" onClick={handleDismiss} aria-label="Cerrar">×</button>
      </div>
      {showIOS && <IOSGuide onClose={() => { setShowIOS(false); handleDismiss() }} />}
    </>
  )
}
