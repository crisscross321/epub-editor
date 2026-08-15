const MAX_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 1600

export interface CompressedImage {
  bytes: Uint8Array
  mime: string
  ext: string
}

function mimeToExt(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

export async function compressImage(blob: Blob): Promise<CompressedImage> {
  const original = new Uint8Array(await blob.arrayBuffer())
  const sourceMime = blob.type || 'image/jpeg'
  const keepPng = sourceMime.includes('png')

  if (typeof createImageBitmap !== 'function') {
    return { bytes: original, mime: sourceMime || 'image/png', ext: mimeToExt(sourceMime) }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    if (original.byteLength <= MAX_BYTES) {
      return { bytes: original, mime: sourceMime, ext: mimeToExt(sourceMime) }
    }
    throw new Error('无法读取这张图片')
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return { bytes: original, mime: sourceMime, ext: mimeToExt(sourceMime) }
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const exportOnce = async (mime: string, quality?: number) => {
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('无法压缩图片'))),
        mime,
        quality,
      )
    })
    return new Uint8Array(await out.arrayBuffer())
  }

  if (keepPng) {
    const bytes = await exportOnce('image/png')
    if (bytes.byteLength <= MAX_BYTES) {
      return { bytes, mime: 'image/png', ext: 'png' }
    }
  }

  let quality = 0.85
  let bytes = await exportOnce('image/jpeg', quality)
  while (bytes.byteLength > MAX_BYTES && quality > 0.4) {
    quality -= 0.1
    bytes = await exportOnce('image/jpeg', quality)
  }
  return { bytes, mime: 'image/jpeg', ext: 'jpg' }
}
