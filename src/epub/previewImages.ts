import { parseHtml } from './xml'
import { bytesToDataUrl, mimeFromExt } from './bytes'
import { dirname, extname, joinPath } from './paths'

export async function inlineRelativeImages(
  html: string,
  chapterHref: string,
  getBytes: (path: string) => Promise<Uint8Array | undefined>,
): Promise<string> {
  const doc = parseHtml(html)
  const dir = dirname(chapterHref)
  const images = Array.from(doc.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src || src.startsWith('data:') || src.startsWith('blob:') || /^https?:/i.test(src)) return
      const path = joinPath(dir, src)
      const data = await getBytes(path)
      if (!data) return
      img.setAttribute('src', bytesToDataUrl(data, mimeFromExt(extname(path))))
    }),
  )
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`
}
