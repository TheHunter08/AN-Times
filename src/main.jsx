import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import './styles/v5.css'
import './styles/v7.css'
import './design-system/index.ts'
import './ui-v2/design-system/theme.css'
import './styles/premium.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

if (import.meta.env.VITE_SENTRY_DSN) {
  // La telemetría no debe retrasar el login ni el fichaje. Solo se descarga
  // cuando existe un DSN y se inicializa en segundo plano.
  import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.2,
      integrations: [Sentry.browserTracingIntegration()],
    })
  }).catch(() => {})
}

function removeSplash() {
  const splash = document.getElementById('splash')
  if (splash) splash.remove()
}

document.getElementById('root')?.setAttribute('data-design-system', 'times-inc')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

requestAnimationFrame(removeSplash)
