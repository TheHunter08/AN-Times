import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'

// Remove splash after load
window.addEventListener('load', () => {
  const splash = document.getElementById('splash')
  if (splash) {
    splash.style.opacity = '0'
    splash.style.transition = 'opacity .4s ease'
    setTimeout(() => splash.remove(), 450)
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
