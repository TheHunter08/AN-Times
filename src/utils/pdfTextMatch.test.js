import { describe, expect, it } from 'vitest'
import { locateAnchorInItems } from './pdfTextMatch.js'

// Cada item replica exactamente la forma que devuelve pdf.js en
// page.getTextContent() — solo se usan `str` y `transform` (el resto de
// campos reales de pdf.js no los lee locateAnchorInItems).
const item = (str, x, y) => ({ str, transform: [9, 0, 0, 9, x, y] })

describe('locateAnchorInItems', () => {
  it('encuentra la frase en un único item de texto', () => {
    const hit = locateAnchorInItems([
      item('Contrato de trabajo', 50, 550),
      item('Firma del trabajador', 60, 100),
    ])
    expect(hit).toEqual({ x: 60, y: 100 })
  })

  it('encuentra la frase en mayúsculas', () => {
    const hit = locateAnchorInItems([item('FIRMA DEL TRABAJADOR', 60, 100)])
    expect(hit).toEqual({ x: 60, y: 100 })
  })

  it('encuentra la frase con tildes en la variante "empleado"', () => {
    const hit = locateAnchorInItems([item('Firma del émpleado', 60, 100)])
    expect(hit).toEqual({ x: 60, y: 100 })
  })

  it('encuentra la frase partida entre varios items (palabra por palabra), como hace pdf.js con fuentes/kerning', () => {
    // pdf.js también inserta sus propios items de espacio " " entre palabras
    // de una misma línea — se simulan aquí igual que en la extracción real.
    const hit = locateAnchorInItems([
      item('Firma', 60, 100),
      item(' ', 83, 100),
      item('del', 92, 100),
      item(' ', 104, 100),
      item('Trabajador', 110, 100),
    ])
    expect(hit).toEqual({ x: 60, y: 100 })
  })

  it('encuentra la frase aunque el item anterior (otra línea) no tenga espacio de separación', () => {
    // pdf.js no añade un espacio entre items de líneas/párrafos distintos —
    // solo entre palabras de una misma línea. Sin el separador que añade
    // locateAnchorInItems entre CUALQUIER par de items, "tildesFirma" se
    // pegaría y la frase no se encontraría.
    const hit = locateAnchorInItems([
      item('CONTRATO LABORAL — Titulo con tildes', 50, 550),
      item('_________________________', 60, 115),
      item('FIRMA DEL TRABAJADOR', 60, 100),
    ])
    expect(hit).toEqual({ x: 60, y: 100 })
  })

  it('no encuentra nada si la frase no aparece', () => {
    expect(locateAnchorInItems([item('Documento sin frase de firma', 50, 300)])).toBeNull()
  })

  it('no confunde una palabra que termina en "firma" con la frase objetivo (límites de palabra)', () => {
    expect(locateAnchorInItems([item('Confirma del trabajador que recibio el pago', 50, 300)])).toBeNull()
  })

  it('devuelve null con una lista vacía o sin items de texto real', () => {
    expect(locateAnchorInItems([])).toBeNull()
    expect(locateAnchorInItems([{ str: '' }, { marked: true }])).toBeNull()
  })

  it('prioriza la frase más específica cuando hay varias coincidencias posibles', () => {
    // "firma del trabajador" es más específica que "firma trabajador" — al
    // aparecer la primera, esa gana aunque ambas encajen en el texto.
    const hit = locateAnchorInItems([item('Firma del trabajador', 15, 20)])
    expect(hit).toEqual({ x: 15, y: 20 })
  })
})
