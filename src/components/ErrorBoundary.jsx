import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-800)', gap:16, padding:32, textAlign:'center' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Algo ha ido mal</div>
          <div style={{ fontSize:13, color:'var(--text3)', maxWidth:320, lineHeight:1.6 }}>
            {this.state.error.message || 'Error inesperado en la aplicación'}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop:8, padding:'12px 28px' }}
            onClick={() => window.location.reload()}
          >
            Reiniciar aplicación
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
