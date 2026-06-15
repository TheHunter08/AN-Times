import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts)
  return (
    <div id="toast-root">
      {toasts.map(t => <Toast key={t.id} msg={t.msg} />)}
    </div>
  )
}

function Toast({ msg }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t = setTimeout(() => { el.classList.add('out') }, 2700)
    return () => clearTimeout(t)
  }, [])
  return <div className="toast" ref={ref}>{msg}</div>
}
