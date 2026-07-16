import { useState } from 'react'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

export function WelcomeSlides() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem('an_welcome_v1') } catch { return false }
  })
  const [slide, setSlide] = useState(0)
  const [exiting, setExiting] = useState(false)

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => {
      try { localStorage.setItem('an_welcome_v1', '1') } catch {}
      setVisible(false)
    }, 350)
  }
  const dialogRef = useDialogA11y(visible && !exiting, dismiss)

  if (!visible) return null

  const SLIDES = [
    { emoji:'⏱️', color:'#3B5BFF', title:'Registra tu jornada', sub:'Ficha entrada y salida desde tu móvil. Tu historial siempre disponible, en cualquier lugar.' },
    { emoji:'🌴', color:'#16a34a', title:'Solicita vacaciones', sub:'Gestiona tus días libres fácilmente. Consulta el estado en tiempo real.' },
    { emoji:'🏗️', color:'#7c3aed', title:'Conecta con tu obra', sub:'Mensajes, documentos y avisos de tu obra, todo en un solo lugar.' },
  ]

  const s = SLIDES[slide]
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'flex-end',
      background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
      animation: exiting ? 'wsFadeOut .35s forwards' : 'wsFadeIn .3s',
    }}>
      <style>{`@keyframes wsFadeIn{from{opacity:0}to{opacity:1}}@keyframes wsFadeOut{from{opacity:1}to{opacity:0}}`}</style>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="welcome-slide-title" tabIndex={-1} style={{
        width:'100%', maxWidth:480, margin:'0 auto',
        background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`,
        border:`1px solid ${colors.border.subtle}`, borderBottom:'none',
        padding:'28px 24px 32px',
        animation: exiting ? 'wsSlideOut .35s forwards' : 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow:'0 -20px 60px rgba(0,0,0,.4)',
      }}>
        {/* Slide dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:28 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              height:6, borderRadius:3, cursor:'pointer', transition:'all .3s',
              width: i === slide ? 24 : 6,
              background: i === slide ? s.color : colors.bg[500],
            }} />
          ))}
        </div>

        {/* Content */}
        <div key={slide} style={{ textAlign:'center', animation:'slideUp .3s cubic-bezier(.16,1,.3,1)' }}>
          <div style={{ width:80, height:80, borderRadius:22, background:`${s.color}22`, border:`2px solid ${s.color}44`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:38, margin:'0 auto 20px' }}>
            {s.emoji}
          </div>
          <div id="welcome-slide-title" style={{ fontSize:22, fontWeight:800, color:colors.text[900], marginBottom:10, letterSpacing:'-.4px' }}>{s.title}</div>
          <div style={{ fontSize:14, color:colors.text[500], lineHeight:1.65, marginBottom:32 }}>{s.sub}</div>
        </div>

        {/* Buttons */}
        {slide < SLIDES.length - 1 ? (
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={dismiss} style={{ flex:1, padding:'12px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }}>Omitir</button>
            <button onClick={() => setSlide(slide + 1)} style={{ flex:2, padding:'12px', borderRadius:radius.lg, border:'none', background:s.color, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer' }}>Siguiente →</button>
          </div>
        ) : (
          <button onClick={dismiss} style={{ width:'100%', padding:'14px', borderRadius:radius.lg, border:'none', background:s.color, color:'#fff', fontWeight:700, fontSize:15, fontFamily:'inherit', cursor:'pointer' }}>
            Empezar →
          </button>
        )}
      </div>
    </div>
  )
}
