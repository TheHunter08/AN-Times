// Localiza donde estampar la firma en un PDF subido por el admin (contrato,
// nomina...) cuya maquetacion no controla la app -- a diferencia de los PDF
// que la propia app genera (cierre mensual, informes de jornada), donde ya
// se sabe de antemano donde se dibuja "FIRMA DEL TRABAJADOR" porque lo
// dibuja la propia app (ver cierrePdf.js / useJornadaPdfExport.ts).
//
// pdf-lib no puede leer texto existente, solo escribirlo -- para encontrar la
// frase "Firma del trabajador" dentro de un PDF arbitrario hace falta pdf.js
// (unica dependencia del proyecto capaz de extraer texto con su posicion).
// La lógica de búsqueda en sí vive en pdfTextMatch.js (sin pdf.js) para
// poder testearla aislada -- pdf.js falla al evaluarse fuera de un navegador
// real (usa DOMMatrix a nivel de módulo, no disponible en jsdom/Node).
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { locateAnchorInItems } from './pdfTextMatch.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

function dataUrlToUint8Array(dataUrl) {
  const b64 = dataUrl.split(',')[1]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// Un PDF real (varias páginas, fuentes incrustadas, escaneado con imágenes
// pesadas...) puede tardar mucho más que mis PDFs de prueba en analizarse, y
// si el worker de pdf.js falla en cargar/responder en producción (red lenta,
// bloqueador de scripts, un fallo interno que deja la promesa colgada sin
// rechazarla) esta búsqueda podía quedarse esperando para siempre — congelando
// TODO el flujo de firma sin ningún error visible, porque firmarDoc() la
// espera con `await` antes de poder seguir. Con este límite, si no responde a
// tiempo se cae a la posición por defecto en vez de bloquear la firma.
const ANCHOR_TIMEOUT_MS = 8000

async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tiempo de espera agotado (${ms}ms)`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Busca "Firma del trabajador" (o variantes cercanas) en el texto real y
 * seleccionable del PDF. Devuelve `{ pageIndex, x, y }` (coordenadas PDF,
 * origen abajo-izquierda, mismo sistema que pdf-lib) del punto donde
 * empieza esa frase, o `null` si no aparece como texto -- lo mas habitual
 * cuando el PDF es una imagen escaneada sin capa de texto, o cuando la
 * plantilla usa una frase distinta -- o si el análisis no responde a tiempo.
 * El llamador debe caer a una posicion por defecto en ese caso.
 */
export async function findSignatureAnchor(pdfDataUrl) {
  let loadingTask = null
  try {
    return await withTimeout((async () => {
      const bytes = dataUrlToUint8Array(pdfDataUrl)
      loadingTask = pdfjsLib.getDocument({ data: bytes })
      const doc = await loadingTask.promise
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum)
        // Una pagina rotada desplaza el sistema de coordenadas del texto
        // respecto al que usa pdf-lib para dibujar -- para no estampar la
        // firma en un punto incorrecto, esas paginas se saltan (cae al
        // respaldo del llamador).
        if (page.rotate) continue
        const content = await page.getTextContent()
        const hit = locateAnchorInItems(content.items)
        if (!hit) continue
        return { pageIndex: pageNum - 1, x: hit.x, y: hit.y }
      }
      return null
    })(), ANCHOR_TIMEOUT_MS)
  } catch (e) {
    console.warn('[pdfSignatureAnchor] No se pudo analizar el PDF, se usara la posicion por defecto:', e)
    return null
  } finally {
    // destroy() es seguro de llamar aunque loadingTask.promise nunca haya
    // resuelto (p.ej. si saltó el timeout) — libera el worker/red en vuelo.
    try { loadingTask?.destroy() } catch {}
  }
}
