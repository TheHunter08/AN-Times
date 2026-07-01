import { useState, useEffect } from 'react'

// Ancho de ventana (desktop detect)
export function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const handler = () => setW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return w
}
