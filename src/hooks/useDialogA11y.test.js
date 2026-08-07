import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogA11y } from './useDialogA11y.js'

function Dialog({ label, onClose }) {
  const ref = useDialogA11y(true, onClose)
  return createElement('div', { ref, role: 'dialog', tabIndex: -1, 'aria-label': label },
    createElement('button', null, `Primero ${label}`),
    createElement('button', null, `Último ${label}`),
  )
}

describe('useDialogA11y', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', handle => clearTimeout(handle))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('devuelve al diálogo el foco que intenta escapar', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => root.render(createElement(Dialog, { label: 'Prueba', onClose: vi.fn() })))
    await act(() => new Promise(resolve => setTimeout(resolve, 1)))

    outside.focus()

    expect(document.activeElement?.textContent).toBe('Primero Prueba')
    outside.remove()
  })

  it('solo cierra con Escape el diálogo superior cuando hay capas', () => {
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    act(() => root.render(createElement('div', null,
      createElement(Dialog, { label: 'Exterior', onClose: closeOuter }),
      createElement(Dialog, { label: 'Interior', onClose: closeInner }),
    )))

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))

    expect(closeInner).toHaveBeenCalledOnce()
    expect(closeOuter).not.toHaveBeenCalled()
  })
})
