import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { colors } from '../../ui-v2/design-system/colors.js'
import { radius } from '../../ui-v2/design-system/radius.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:420 }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 16px' }

export function ModalQRScan({ visible, onScan, onClose }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const rafRef      = useRef(null)
  const scannedRef  = useRef(false)
  // Ref para onScan: evita que el efecto de cámara se reinicie cada vez
  // que el padre re-renderiza y genera una nueva referencia de función.
  const onScanRef   = useRef(onScan)
  const [error, setError] = useState(null)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)

  useEffect(() => {
    if (!visible) return
    scannedRef.current = false
    setError(null)
    let cancelled = false

    // Fix: mediaDevices es undefined en HTTP (contexto no seguro).
    // Encadenar .then() directamente sobre undefined lanzaría TypeError síncrono
    // que escapa al .catch(). Se comprueba antes de encadenar.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La cámara requiere una conexión segura (HTTPS) o permisos de cámara.')
      return
    }

    // Dimensiones previas del canvas — solo se reasignan al cambiar de resolución,
    // ya que asignar canvas.width aunque sea el mismo valor resetea el buffer.
    let lastW = 0, lastH = 0

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        const tick = () => {
          const video  = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas || scannedRef.current) return
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            if (video.videoWidth !== lastW || video.videoHeight !== lastH) {
              lastW = video.videoWidth; lastH = video.videoHeight
              canvas.width = lastW; canvas.height = lastH
            }
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, lastW, lastH)
            const imageData = ctx.getImageData(0, 0, lastW, lastH)
            const code = jsQR(imageData.data, imageData.width, imageData.height)
            if (code?.data) {
              scannedRef.current = true
              try { navigator.vibrate?.(20) } catch {}
              onScanRef.current(code.data)
              return
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })
      .catch(() => { if (!cancelled) setError('No se pudo acceder a la cámara. Revisa los permisos.') })

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [visible]) // onScan se consume vía ref — no va en deps

  if (!visible) return null

  return (
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900] }}>Fichar con QR</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', fontFamily:'inherit' }}>×</button>
        </div>

        {error ? (
          <div style={{ padding:'24px 12px', textAlign:'center', color:colors.text[500], fontSize:13 }}>{error}</div>
        ) : (
          <div style={{ position:'relative', width:'100%', aspectRatio:'1', borderRadius:radius.xl, overflow:'hidden', background:'#000' }}>
            <video ref={videoRef} playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            <canvas ref={canvasRef} style={{ display:'none' }} />
            <div style={{ position:'absolute', inset:24, border:'2px solid rgba(255,255,255,.6)', borderRadius:16, pointerEvents:'none' }} />
          </div>
        )}

        <div style={{ fontSize:12, color:colors.text[500], textAlign:'center', marginTop:14 }}>
          Apunta al código QR del centro de trabajo o al de un empleado
        </div>
      </div>
    </div>
  )
}
