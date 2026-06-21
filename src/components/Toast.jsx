import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts)
  return (
    <div id="toast-root">
      {toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type} dur={t.dur} />)}
    </div>
  )
}

function Toast({ msg, type, dur = 3000 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t = setTimeout(() => { el.classList.add('out') }, dur - 300)
    return () => clearTimeout(t)
  }, [dur])
  const icon = type === 'ok' ? '✓ ' : type === 'err' ? '✕ ' : type === 'warn' ? '⚠ ' : ''
  return <div className={`toast${type ? ' ' + type : ''}`} ref={ref}>{icon}{msg}</div>
}
