import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'

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
              lastW = video.videoWidth
              lastH = video.videoHeight
              canvas.width  = lastW
              canvas.height = lastH
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
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fichar con QR</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {error ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{error}</div>
        ) : (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 'var(--r)', overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={{ position: 'absolute', inset: 24, border: '2px solid rgba(255,255,255,.6)', borderRadius: 16, pointerEvents: 'none' }} />
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 14 }}>
          Apunta al código QR del centro de trabajo o al de un empleado
        </div>
      </div>
    </div>
  )
}
