// Redimensiona y comprime una imagen en el navegador (recorte cuadrado centrado)
// antes de enviarla al servidor, para mantener el avatar liviano como data URL.
export function archivoAAvatarDataUrl(file, tamano = 256, calidad = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen'))
      return
    }

    const img = new Image()
    const lector = new FileReader()

    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.onload = () => { img.src = lector.result }

    img.onerror = () => reject(new Error('No se pudo procesar la imagen'))
    img.onload = () => {
      const lado = Math.min(img.width, img.height)
      const sx = (img.width - lado) / 2
      const sy = (img.height - lado) / 2

      const canvas = document.createElement('canvas')
      canvas.width = tamano
      canvas.height = tamano
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tamano, tamano)

      resolve(canvas.toDataURL('image/jpeg', calidad))
    }

    lector.readAsDataURL(file)
  })
}
