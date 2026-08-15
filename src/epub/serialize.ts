import type { BookRecord, PackInput, TiptapDoc, TiptapNode } from '../types/book'
import { imageCss, type ImageAlign } from '../images/layout'
import { containerXml, zipEpub } from './fixtures'
import { exportChapterHeading } from './headings'
import { dirname, joinPath } from './paths'
import { nestedNavHtml, outlineFromXhtml } from './toc'
import { escapeXml } from './xml'

function marksToTags(marks: { type: string }[] | undefined): { open: string; close: string } {
  let open = ''
  let close = ''
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') {
      open += '<strong>'
      close = `</strong>${close}`
    }
    if (mark.type === 'italic') {
      open += '<em>'
      close = `</em>${close}`
    }
  }
  return { open, close }
}

function imageHtml(node: TiptapNode): string {
  const src = escapeXml(String(node.attrs?.src ?? ''))
  const alt = escapeXml(String(node.attrs?.alt ?? ''))
  const imageId = node.attrs?.imageId ? String(node.attrs.imageId) : ''
  const width = Number(node.attrs?.width ?? 100) || 100
  const rawAlign = String(node.attrs?.align ?? 'center')
  const align: ImageAlign = rawAlign === 'left' || rawAlign === 'right' ? rawAlign : 'center'
  const idAttr = imageId ? ` id="${escapeXml(imageId)}"` : ''
  const dataId = imageId ? ` data-image-id="${escapeXml(imageId)}"` : ''
  return `<img src="${src}" alt="${alt}"${idAttr}${dataId} data-width="${width}" data-align="${align}" style="${imageCss(width, align)}"/>`
}

function createBodyRenderer() {
  let h2 = 0
  let h3 = 0
  const inlineHtml = (nodes: TiptapNode[] | undefined): string => {
    if (!nodes?.length) return ''
    return nodes
      .map((node) => {
        if (node.type === 'text') {
          const tags = marksToTags(node.marks)
          return `${tags.open}${escapeXml(node.text ?? '')}${tags.close}`
        }
        if (node.type === 'hardBreak') return '<br/>'
        if (node.type === 'image') return imageHtml(node)
        return inlineHtml(node.content)
      })
      .join('')
  }
  const blockHtml = (node: TiptapNode): string => {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 1)
      const tag = `h${Math.min(6, Math.max(1, level))}`
      let idAttr = ''
      if (level === 2) {
        h2 += 1
        h3 = 0
        idAttr = ` id="h2-${h2}"`
      } else if (level === 3) {
        h3 += 1
        idAttr = ` id="h2-${Math.max(h2, 1)}-h3-${h3}"`
      }
      return `<${tag}${idAttr}>${inlineHtml(node.content)}</${tag}>`
    }
    if (node.type === 'paragraph') {
      return `<p>${inlineHtml(node.content)}</p>`
    }
    if (node.type === 'bulletList') {
      const items = (node.content ?? [])
        .map((item) => `<li>${(item.content ?? []).map(blockHtml).join('')}</li>`)
        .join('')
      return `<ul>${items}</ul>`
    }
    if (node.type === 'orderedList') {
      const items = (node.content ?? [])
        .map((item) => `<li>${(item.content ?? []).map(blockHtml).join('')}</li>`)
        .join('')
      return `<ol>${items}</ol>`
    }
    if (node.type === 'image') {
      return `<p>${imageHtml(node)}</p>`
    }
    return (node.content ?? []).map(blockHtml).join('')
  }
  return { blockHtml }
}

export function docToXhtml(doc: TiptapDoc, title: string, lang = 'zh-CN'): string {
  const { blockHtml } = createBodyRenderer()
  const body = (doc.content ?? []).map(blockHtml).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <title>${escapeXml(title)}</title>
  <meta charset="utf-8"/>
</head>
<body>
${body}
</body>
</html>`
}

function mimeToExt(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

function nowStamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export async function packEpub(input: PackInput): Promise<Uint8Array> {
  const opfHref = input.book.opfHref || 'OEBPS/content.opf'
  const opfDir = dirname(opfHref)
  const navHref = joinPath(opfDir, 'nav.xhtml')
  const files = new Map<string, Uint8Array | string>()

  input.entries.forEach((bytes, path) => {
    files.set(path, bytes)
  })

  files.delete('mimetype')
  files.delete('META-INF/container.xml')
  files.delete('META-INF/encryption.xml')
  files.set('META-INF/container.xml', containerXml(opfHref))

  // Deleted chapters are removed from `entries` by the book service.
  // Extra original files (fonts, CSS, linear="no" docs) stay byte-identical.
  const manifestLines: string[] = [
    `    <item id="nav" href="${escapeXml(relFrom(opfDir, navHref))}" media-type="application/xhtml+xml" properties="nav"/>`,
  ]
  const spineLines: string[] = []
  const navLis: string[] = []

  if (input.cover) {
    const coverHref = joinPath(opfDir, `cover.${input.cover.ext}`)
    files.set(coverHref, input.cover.bytes)
    manifestLines.push(
      `    <item id="cover-image" href="${escapeXml(relFrom(opfDir, coverHref))}" media-type="${escapeXml(input.cover.mime)}" properties="cover-image"/>`,
    )
  }

  for (const chapter of [...input.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)) {
    const simplified = input.simplified.get(chapter.id)
    if (chapter.state === 'simplified' && simplified) {
      files.set(chapter.href, simplified.xhtml)
      for (const image of simplified.images) {
        files.set(image.href, image.bytes)
        manifestLines.push(
          `    <item id="${escapeXml(image.id)}" href="${escapeXml(relFrom(opfDir, image.href))}" media-type="${escapeXml(image.mime)}"/>`,
        )
      }
    }
    // pristine: original bytes already copied; do not rewrite
    manifestLines.push(
      `    <item id="${escapeXml(chapter.id)}" href="${escapeXml(relFrom(opfDir, chapter.href))}" media-type="application/xhtml+xml"/>`,
    )
    spineLines.push(`    <itemref idref="${escapeXml(chapter.id)}"/>`)
    const tocSource =
      chapter.state === 'simplified' && simplified
        ? simplified.xhtml
        : decodeEntry(files.get(chapter.href))
    const headings = tocSource ? outlineFromXhtml(tocSource) : []
    navLis.push(
      nestedNavHtml(
        relFrom(dirname(navHref), chapter.href),
        exportChapterHeading(chapter.spineIndex, chapter.title),
        headings,
        escapeXml,
      ),
    )
  }

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0" xml:lang="${escapeXml(input.book.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${escapeXml(input.book.id)}</dc:identifier>
    <dc:title>${escapeXml(input.book.title)}</dc:title>
    <dc:creator>${escapeXml(input.book.author)}</dc:creator>
    <dc:language>${escapeXml(input.book.language)}</dc:language>
    <meta property="dcterms:modified">${nowStamp()}</meta>
    ${input.cover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${manifestLines.join('\n')}
  </manifest>
  <spine>
${spineLines.join('\n')}
  </spine>
</package>`
  files.set(opfHref, opf)

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(input.book.language)}" lang="${escapeXml(input.book.language)}">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <ol>
${navLis.join('\n')}
    </ol>
  </nav>
</body>
</html>`
  files.set(navHref, nav)

  const ordered: { path: string; data: string | Uint8Array; store?: boolean }[] = [
    { path: 'mimetype', data: 'application/epub+zip', store: true },
  ]
  for (const [path, data] of files) {
    if (path === 'mimetype') continue
    ordered.push({ path, data })
  }
  return zipEpub(ordered)
}

function decodeEntry(data: Uint8Array | string | undefined): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  return new TextDecoder().decode(data)
}

function relFrom(fromDir: string, absPath: string): string {
  if (!fromDir) return absPath
  const prefix = fromDir.endsWith('/') ? fromDir : `${fromDir}/`
  if (absPath.startsWith(prefix)) return absPath.slice(prefix.length)
  const fromParts = fromDir.split('/').filter(Boolean)
  const toParts = absPath.split('/').filter(Boolean)
  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i += 1
  const up = fromParts.slice(i).map(() => '..')
  return [...up, ...toParts.slice(i)].join('/')
}

export function imageHrefFor(book: BookRecord, imageId: string, mime: string): string {
  const dir = dirname(book.opfHref || 'OEBPS/content.opf')
  return joinPath(dir, `images/${imageId}.${mimeToExt(mime)}`)
}

export function rewriteImageSrcs(doc: TiptapDoc, hrefFor: (imageId: string) => string | undefined): TiptapDoc {
  const walk = (node: TiptapNode): TiptapNode => {
    if (node.type === 'image') {
      const imageId = String(node.attrs?.imageId ?? '')
      const href = imageId ? hrefFor(imageId) : undefined
      return {
        ...node,
        attrs: { ...node.attrs, src: href ?? node.attrs?.src },
      }
    }
    return { ...node, content: node.content?.map(walk) }
  }
  return { type: 'doc', content: doc.content?.map(walk) }
}

export { mimeToExt }
