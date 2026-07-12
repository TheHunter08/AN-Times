// Config local del empleado (localStorage) — notis, tema, formato, etc.
export function getCfg(key, def) {
  try {
    const v = localStorage.getItem('cfg_' + key)
    if (v === null) return def
    if (v === 'true') return true
    if (v === 'false') return false
    return v
  } catch { return def }
}

export function setCfg(key, value) {
  try { localStorage.setItem('cfg_' + key, String(value)) } catch {}
}

// App de un solo tema (oscuro con degradado azul-negro) — no-op a propósito.
// Se mantiene exportada porque varias pantallas todavía la importan y
// llaman al botón "Tema"; en vez de tocar cada callsite, se neutraliza aquí.
export function toggleTheme() {
  document.documentElement.removeAttribute('data-theme')
  try { localStorage.removeItem('theme') } catch {}
}
