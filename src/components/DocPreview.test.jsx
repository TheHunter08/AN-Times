import { describe, expect, it, vi, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import React from 'react'
import { DocPreview } from './DocPreview.jsx'

// Los navegadores modernos (Chrome, Safari, Firefox) bloquean la navegación
// de una pestaña nueva directamente a una URL data: — se abre en blanco, sin
// ningún error visible. Este test cubre exactamente ese bug: el botón
// "Abrir" de una imagen guardada inline en base64 debía convertirla primero
// a una URL blob: (que sí se puede abrir), no pasar la data: URL cruda.
describe('DocPreview: botón "Abrir" de una imagen inline', () => {
  let container

  afterEach(() => {
    if (container) { document.body.removeChild(container); container = null }
    vi.restoreAllMocks()
  })

  it('abre una URL blob:, nunca la data: URL cruda', async () => {
    const doc = {
      id: 'd1',
      titulo: 'Foto incidencia',
      fileData: 'data:image/png;base64,' + btoa('fake-png-bytes'),
    }

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(DocPreview, { d: doc, db: {}, empId: 'e1' }))
      await new Promise(resolve => setTimeout(resolve, 0)) // deja correr el useEffect de useBlobUrl
    })

    const abrirBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Abrir'))
    expect(abrirBtn).toBeTruthy()

    act(() => { abrirBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(openSpy).toHaveBeenCalledTimes(1)
    const openedUrl = openSpy.mock.calls[0][0]
    expect(openedUrl.startsWith('data:')).toBe(false)
    expect(openedUrl.startsWith('blob:')).toBe(true)

    act(() => { root.unmount() })
  })
})
