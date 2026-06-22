import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null, eventId: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
    // Report to Sentry if available
    try {
      if (window.__sentryHub) {
        const id = window.__sentryHub.captureException(error, { extra: info })
        this.setState({ eventId: id })
      }
    } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position:'fixed', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          background:'var(--bg-800,#0d0d18)', gap:16, padding:32, textAlign:'center'
        }}>
          <div style={{
            width:64, height:64, borderRadius:18,
            background:'rgba(229,83,75,.12)', border:'1px solid rgba(229,83,75,.25)',
            display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4
          }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none"
              stroke="var(--orange,#f59e0b)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--text,#f1f5f9)', letterSpacing:'-.3px' }}>
            Algo ha ido mal
          </div>
          <div style={{ fontSize:13, color:'var(--text3,#64748b)', maxWidth:300, lineHeight:1.7 }}>
            {this.state.error.message || 'Error inesperado. Los datos locales están a salvo.'}
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button
              style={{ padding:'12px 24px', borderRadius:10, background:'var(--primary,#6C63FF)', color:'#fff', border:'none', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
              onClick={() => window.location.reload()}>
              Reiniciar app
            </button>
            <button
              style={{ padding:'12px 24px', borderRadius:10, background:'var(--bg-500,#1e293b)', color:'var(--text2,#94a3b8)', border:'1px solid var(--border,#334155)', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
              onClick={() => this.setState({ error: null })}>
              Ignorar
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--text4,#475569)', marginTop:8 }}>
            Versión {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
