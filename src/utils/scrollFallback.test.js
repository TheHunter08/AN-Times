import { describe, it, expect } from 'vitest'
import { findScrollTarget } from './scrollFallback.js'

// jsdom no calcula layout (scrollHeight/clientHeight son 0), así que el
// encadenado se prueba con nodos simulados y un getStyle inyectado — la misma
// firma que usa el código real.
function fakeNode({ overflowY = 'visible', overflowX = 'visible', scrollHeight = 0, clientHeight = 0, scrollTop = 0, scrollWidth = 0, clientWidth = 0, scrollLeft = 0, parent = null } = {}) {
  return {
    nodeType: 1,
    overflowY, overflowX,
    scrollHeight, clientHeight, scrollTop,
    scrollWidth, clientWidth, scrollLeft,
    parentElement: parent,
  }
}
const getStyle = el => ({ overflowY: el.overflowY, overflowX: el.overflowX })

describe('findScrollTarget: replica el encadenado de scroll del navegador', () => {
  it('encuentra el ancestro con overflow-y auto que aún puede bajar', () => {
    const scroller = fakeNode({ overflowY: 'auto', scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })
    const inner = fakeNode({ parent: scroller })
    expect(findScrollTarget(inner, 0, 100, getStyle)).toEqual({ el: scroller, axis: 'y' })
  })

  it('un scroller ya al fondo no captura el gesto hacia abajo (encadena hacia arriba)', () => {
    const outer = fakeNode({ overflowY: 'auto', scrollHeight: 2000, clientHeight: 800, scrollTop: 0 })
    const bottomed = fakeNode({ overflowY: 'auto', scrollHeight: 600, clientHeight: 300, scrollTop: 300, parent: outer })
    const inner = fakeNode({ parent: bottomed })
    expect(findScrollTarget(inner, 0, 100, getStyle)).toEqual({ el: outer, axis: 'y' })
  })

  it('un scroller arriba del todo no captura el gesto hacia arriba', () => {
    const scroller = fakeNode({ overflowY: 'auto', scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })
    const inner = fakeNode({ parent: scroller })
    expect(findScrollTarget(inner, 0, -100, getStyle)).toBeNull()
  })

  it('overflow hidden/visible nunca es objetivo de scroll', () => {
    const hidden = fakeNode({ overflowY: 'hidden', scrollHeight: 1000, clientHeight: 400 })
    const inner = fakeNode({ parent: hidden })
    expect(findScrollTarget(inner, 0, 100, getStyle)).toBeNull()
  })

  it('desplazamiento horizontal: una tabla con overflow-x auto captura deltaX', () => {
    const page = fakeNode({ overflowY: 'auto', scrollHeight: 1000, clientHeight: 400 })
    const table = fakeNode({ overflowX: 'auto', scrollWidth: 1500, clientWidth: 700, scrollLeft: 0, parent: page })
    const cell = fakeNode({ parent: table })
    expect(findScrollTarget(cell, 80, 0, getStyle)).toEqual({ el: table, axis: 'x' })
  })

  it('con deltaY sobre un scroller solo-horizontal, encadena al contenedor vertical de la página', () => {
    const page = fakeNode({ overflowY: 'auto', scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })
    const table = fakeNode({ overflowX: 'auto', scrollWidth: 1500, clientWidth: 700, parent: page })
    const cell = fakeNode({ parent: table })
    expect(findScrollTarget(cell, 0, 100, getStyle)).toEqual({ el: page, axis: 'y' })
  })

  it('sin ningún ancestro desplazable, devuelve null (no secuestra nada)', () => {
    const plain = fakeNode({ parent: fakeNode() })
    expect(findScrollTarget(plain, 0, 100, getStyle)).toBeNull()
  })
})
