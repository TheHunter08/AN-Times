function arrayBufferToBase64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// La firma se captura sobre fondo oscuro (#0D1218) para la UI de la app.
// Para "estamparla" en un documento necesitamos tinta sólida sobre fondo
// transparente. Aquí recoloreamos los trazos a negro y dejamos el resto
// transparente, generando un PNG apto para imprimir.
export function makePrintableSignature(jpegDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        // 2× resolución para calidad retina en PDF e impresión
        const scale = 2
        const c = document.createElement('canvas')
        c.width = img.width * scale
        c.height = img.height * scale
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        const id = ctx.getImageData(0, 0, c.width, c.height)
        const d = id.data
        for (let i = 0; i < d.length; i += 4) {
          // Luminosidad del pixel
          const lum = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114
          if (lum < 50) {
            // Fondo oscuro → transparente
            d[i+3] = 0
          } else {
            // Tinta: negro con alpha proporcional (preserva anti-aliasing en los bordes)
            const alpha = Math.min(255, Math.round((lum - 50) * 1.22))
            d[i] = 17; d[i+1] = 17; d[i+2] = 17; d[i+3] = alpha
          }
        }
        ctx.putImageData(id, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch (e) { reject(e) }
    }
    img.onerror = reject
    img.src = jpegDataUrl
  })
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1]
  if (!b64) throw new Error('Invalid data URL')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export async function stampSignatureOnPdf(pdfDataUrl, signaturePngDataUrl, label) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfBytes = dataUrlToBytes(pdfDataUrl)
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pngBytes = dataUrlToBytes(signaturePngDataUrl)
  const pngImage = await pdfDoc.embedPng(pngBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pages = pdfDoc.getPages()
  const page = pages[pages.length - 1]
  const { width } = page.getSize()

  const sigWidth = 140
  const sigHeight = sigWidth * (pngImage.height / pngImage.width)
  const margin = 40

  page.drawImage(pngImage, {
    x: width - sigWidth - margin,
    y: margin + 16,
    width: sigWidth,
    height: sigHeight,
  })
  page.drawText(label, {
    x: width - sigWidth - margin,
    y: margin + 4,
    size: 7,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })

  const outBytes = await pdfDoc.save()
  return 'data:application/pdf;base64,' + arrayBufferToBase64(outBytes)
}

export function stampSignatureOnImage(imageDataUrl, signaturePngDataUrl, label) {
  return new Promise((resolve, reject) => {
    const base = new Image()
    base.onload = () => {
      const sig = new Image()
      sig.onload = () => {
        try {
          const c = document.createElement('canvas')
          c.width = base.width; c.height = base.height
          const ctx = c.getContext('2d')
          ctx.drawImage(base, 0, 0)

          const sigWidth = Math.min(base.width * 0.35, 280)
          const sigHeight = sigWidth * (sig.height / sig.width)
          const margin = base.width * 0.04
          const x = base.width - sigWidth - margin
          const y = base.height - sigHeight - margin

          ctx.drawImage(sig, x, y, sigWidth, sigHeight)
          ctx.font = `${Math.max(10, base.width * 0.012)}px sans-serif`
          ctx.fillStyle = 'rgba(60,60,60,0.9)'
          ctx.fillText(label, x, y + sigHeight + 14)

          resolve(c.toDataURL('image/jpeg', 0.85))
        } catch (e) { reject(e) }
      }
      sig.onerror = reject
      sig.src = signaturePngDataUrl
    }
    base.onerror = reject
    base.src = imageDataUrl
  })
}
