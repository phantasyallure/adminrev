// Shared client-side image compression, used before any photo is uploaded
// to Supabase Storage from the admin panel (place cover photos, category
// tile images…).
//
// Resizes down to `maxDimension` on the longest side (never upscales) and
// re-encodes as JPEG at `quality`. A tall portrait photo stays exactly as
// tall/narrow as it was uploaded, just lighter. In practice this cuts a
// typical phone photo (3-6MB) down to roughly 40-60% of its original size
// (~1-1.5MB), depending on how busy/detailed the image is.
export function compressImage(file, { maxDimension = 1600, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (e) => {
      img.src = e.target.result
    }
    reader.onerror = reject
    img.onload = () => {
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}
