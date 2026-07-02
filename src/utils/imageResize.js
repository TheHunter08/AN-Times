// Redimensiona una imagen en el navegador antes de guardarla como data URL.
// El logo se guarda dentro del JSON único de la app (db.config.companyLogo),
// así que hay que mantenerlo pequeño — sin esto, un logo de móvil (varios MB)
// se cargaría entero en CADA arranque de la app, incluida la pantalla de login.
export function resizeImageToDataUrl(file, maxSize = 256, quality = 0.9) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('El archivo no es una imagen')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // PNG conserva transparencia (habitual en logos); si el archivo original
        // era JPEG lo exportamos como JPEG comprimido para que pese menos.
        const isJpeg = /jpe?g/i.test(file.type)
        resolve(isJpeg ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png'))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
