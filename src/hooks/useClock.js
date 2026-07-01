import { useState, useEffect } from 'react'
import { p2 } from '../utils/time.js'

// Reloj en vivo (aislado para no re-renderizar el componente padre)
export function useClock() {
  const [clockTime, setClockTime] = useState('')
  const [clockDate, setClockDate] = useState('')
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClockTime(`${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())}`)
      setClockDate(n.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }))
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])
  return { clockTime, clockDate }
}
