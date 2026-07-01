import { useMemo } from 'react'

// ─── CONFETTI (celebración al cerrar jornada) ──────────────────────────────────
export function Confetti({ visible }) {
  const particles = useMemo(() => {
    const COLORS = ['#6C63FF', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#a78bfa', '#f472b6', '#34d399']
    return Array.from({ length: 48 }).map((_, i) => ({
      color: COLORS[i % COLORS.length],
      left: `${(i * 7.3 + 3) % 100}%`,
      delay: `${(i * 0.05) % 1.4}s`,
      size: 5 + (i % 5),
      shape: i % 3,
      rot: (i * 47) % 360,
      dur: 1.4 + (i % 6) * 0.18,
    }))
  }, [])

  if (!visible) return null
  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:9998 }}>
      {particles.map((p, i) => (
        <div key={i} style={{
          position:'absolute', top:-16, left:p.left,
          width:p.size, height:p.size,
          background:p.color,
          borderRadius: p.shape === 0 ? '50%' : p.shape === 1 ? '2px' : '0',
          transform:`rotate(${p.rot}deg)`,
          animation:`confettiFall ${p.dur}s cubic-bezier(.36,.07,.19,.97) ${p.delay} forwards`,
        }} />
      ))}
    </div>
  )
}
