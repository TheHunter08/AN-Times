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

export function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  if (next === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', 'light')
  try { localStorage.setItem('theme', next) } catch {}
}
