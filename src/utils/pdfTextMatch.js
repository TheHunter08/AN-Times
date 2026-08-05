// Lógica pura de búsqueda de "Firma del trabajador" dentro del texto
// extraído de un PDF con pdf.js — sin ninguna dependencia de pdf.js/DOM, para
// poder testearla de forma aislada (pdf.js falla al evaluarse fuera de un
// navegador real: usa DOMMatrix a nivel de módulo). Ver pdfSignatureAnchor.js
// para el envoltorio que sí llama a pdf.js con esto.

// Variantes mas comunes en plantillas de contrato/nomina en espanol. Se
// buscan en este orden -- gana la mas especifica que aparezca. Cada frase se
// compila a un regex con \s+ entre palabras (no una cadena exacta): pdf.js
// inserta sus propios items de espacio sinteticos entre palabras al extraer
// texto, asi que el espaciado real que llega aqui no es fiable caracter a
// caracter.
const TARGET_PHRASES = [
  'firma del trabajador',
  'firma del empleado',
  'firma trabajador',
  'firma empleado',
].map(phrase => new RegExp(`\\b${phrase.split(' ').join('\\s+')}\\b`))

// Sustitucion directa caracter a caracter (no NFD): descomponer con NFD
// anadiria marcas combinantes y desplazaria la longitud de la cadena,
// rompiendo la correspondencia de indices con `spans` mas abajo.
const ACCENTS = { á:'a', é:'e', í:'i', ó:'o', ú:'u', ü:'u', ñ:'n' }
function normalize(text) {
  return text.toLowerCase().replace(/[áéíóúüñ]/g, ch => ACCENTS[ch] || ch)
}

/**
 * Busca la frase objetivo dentro de los `items` de texto de UNA página (tal
 * como los devuelve pdf.js en `page.getTextContent()`) y, si la encuentra,
 * devuelve la posición del item cuyo rango cubre el inicio de la
 * coincidencia. Devuelve `null` si no aparece.
 */
export function locateAnchorInItems(items) {
  // Se concatena el texto CRUDO de cada item (sin normalizar todavia, ver
  // más abajo) separado por un espacio propio: pdf.js ya inserta sus propios
  // items de espacio ENTRE PALABRAS de una misma línea, pero NO entre items
  // de líneas/párrafos distintos, así que sin este separador items de
  // líneas distintas quedarían pegados sin espacio (p.ej.
  // "...tildesFirma del trabajador"). El posible espacio doble resultante
  // (cuando pdf.js también insertó el suyo) no es problema: la búsqueda de
  // más abajo usa \s+ (uno o más), no un espacio exacto.
  let joined = ''
  const spans = []
  for (const item of items || []) {
    if (!item || typeof item.str !== 'string' || !item.str) continue
    const start = joined.length
    joined += item.str + ' '
    spans.push({ start, end: joined.length, item })
  }
  // normalize() preserva la longitud carácter a carácter (minúsculas +
  // sustitución 1:1 de acentos, sin NFD) — por eso `matchIndex`, encontrado
  // en `normalized`, sigue correspondiéndose con las posiciones de `spans`,
  // calculadas sobre `joined` sin normalizar.
  const normalized = normalize(joined)
  let match = null
  for (const phrase of TARGET_PHRASES) {
    match = normalized.match(phrase)
    if (match) break
  }
  if (!match) return null
  const matchIndex = match.index
  const span = spans.find(s => matchIndex >= s.start && matchIndex < s.end) || spans.at(-1)
  if (!span) return null
  const [, , , , x, y] = span.item.transform
  return { x, y }
}
