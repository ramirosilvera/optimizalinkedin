const MAX_SIDE = 800
const JPEG_QUALITY = 0.85
const MAX_SIZE = 5 * 1024 * 1024

export async function compressImage(file) {
  const HEIC_TYPES = ['image/heic', 'image/heif']
  const HEIC_EXTS = ['.heic', '.heif']
  const isHeic = HEIC_TYPES.includes(file.type?.toLowerCase()) ||
    HEIC_EXTS.some(ext => file.name?.toLowerCase().endsWith(ext))

  if (isHeic) {
    throw new Error('Fotos .heic (iPhone) no son compatibles. Convertí la imagen a JPG antes de subirla.')
  }

  if (!file.type?.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen (JPG, PNG, WebP).')
  }

  if (file.size > MAX_SIZE) {
    throw new Error('La imagen es demasiado grande. Máximo 5 MB.')
  }

  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objUrl)

      let { width, height } = img
      if (width > MAX_SIDE || height > MAX_SIDE) {
        const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('No se pudo comprimir la imagen.')); return }
          const reader = new FileReader()
          reader.onload = () => resolve({
            base64: reader.result.split(',')[1],
            mime: 'image/jpeg',
            previewUrl: URL.createObjectURL(blob),
          })
          reader.onerror = () => reject(new Error('Error al leer la imagen.'))
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objUrl)
      reject(new Error('No se pudo cargar la imagen. Verificá que el archivo sea válido.'))
    }

    img.src = objUrl
  })
}
