import JSZip from 'jszip'
import type { ChapterIndex, ParsedEpub } from '../types/book'
import { EpubError } from './errors'
import { dirname, joinPath, normalizeZipPath } from './paths'
import { parseHtml, elementsByLocalName, firstByLocalName, parseXml, textOf } from './xml'

function firstHeading(xhtml: string): string {
  const html = parseHtml(xhtml)
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const el = html.querySelector(tag)
    const text = (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return ''
}

function zipEntry(zip: JSZip, path: string) {
  const normalized = normalizeZipPath(path)
  return (
    zip.file(normalized) ||
    zip.file(decodeURIComponent(normalized)) ||
    zip.files[normalized] ||
    null
  )
}

async function readEntries(zip: JSZip): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>()
  const names = Object.keys(zip.files)
  for (const name of names) {
    const file = zip.files[name]
    if (!file || file.dir) continue
    entries.set(normalizeZipPath(name), await file.async('uint8array'))
  }
  return entries
}

export async function parseEpub(buf: ArrayBuffer): Promise<ParsedEpub> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    throw new EpubError('not-zip')
  }

  if (zipEntry(zip, 'META-INF/encryption.xml')) {
    throw new EpubError('encrypted')
  }

  const containerFile = zipEntry(zip, 'META-INF/container.xml')
  if (!containerFile) throw new EpubError('no-opf')

  let opfHref = ''
  try {
    const containerDoc = parseXml(await containerFile.async('text'))
    const rootfile = firstByLocalName(containerDoc, 'rootfile')
    opfHref = normalizeZipPath(
      rootfile?.getAttribute('full-path') ||
        rootfile?.getAttribute('fullpath') ||
        '',
    )
  } catch {
    throw new EpubError('corrupt')
  }
  if (!opfHref) throw new EpubError('no-opf')

  const opfFile = zipEntry(zip, opfHref)
  if (!opfFile) throw new EpubError('no-opf')

  let opfDoc: Document
  try {
    opfDoc = parseXml(await opfFile.async('text'))
  } catch {
    throw new EpubError('corrupt')
  }

  const opfDir = dirname(opfHref)
  const title = textOf(firstByLocalName(opfDoc, 'title')) || '未命名'
  const author = textOf(firstByLocalName(opfDoc, 'creator'))
  const language = textOf(firstByLocalName(opfDoc, 'language')) || 'zh-CN'

  const manifest = new Map<string, { href: string; properties: string }>()
  for (const item of elementsByLocalName(opfDoc, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href: joinPath(opfDir, href),
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spineIds: string[] = []
  for (const ref of elementsByLocalName(opfDoc, 'itemref')) {
    const linear = (ref.getAttribute('linear') ?? 'yes').toLowerCase()
    if (linear === 'no') continue
    const idref = ref.getAttribute('idref')
    if (idref) spineIds.push(idref)
  }
  if (spineIds.length === 0) throw new EpubError('empty-spine')

  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'))
  const navHref = navItem?.href
  const titleByHref = new Map<string, string>()

  if (navHref) {
    const navFile = zipEntry(zip, navHref)
    if (navFile) {
      try {
        const navDoc = parseXml(await navFile.async('text'))
        const navDir = dirname(navHref)
        for (const a of elementsByLocalName(navDoc, 'a')) {
          const href = a.getAttribute('href')
          if (!href) continue
          titleByHref.set(joinPath(navDir, href), textOf(a))
        }
      } catch {
        /* nav optional */
      }
    }
  }

  const ncxItem = [...manifest.entries()].find(([, item]) => item.href.endsWith('.ncx'))
  if (ncxItem) {
    const ncxFile = zipEntry(zip, ncxItem[1].href)
    if (ncxFile) {
      try {
        const ncxDoc = parseXml(await ncxFile.async('text'))
        const ncxDir = dirname(ncxItem[1].href)
        const points = elementsByLocalName(ncxDoc, 'navPoint')
        for (const point of points) {
          const label = firstByLocalName(point, 'text')
          const content = firstByLocalName(point, 'content')
          const src = content?.getAttribute('src')
          if (!src) continue
          const key = joinPath(ncxDir, src)
          if (!titleByHref.has(key)) titleByHref.set(key, textOf(label))
        }
      } catch {
        /* ncx optional */
      }
    }
  }

  const chapters: ChapterIndex[] = []
  for (const [index, id] of spineIds.entries()) {
    const item = manifest.get(id)
    if (!item) continue
    let title = titleByHref.get(item.href) ?? ''
    if (!title) {
      const chapterFile = zipEntry(zip, item.href)
      if (chapterFile) {
        try {
          title = firstHeading(await chapterFile.async('text'))
        } catch {
          title = ''
        }
      }
    }
    chapters.push({
      id,
      href: item.href,
      title: title || `第 ${index + 1} 章`,
      spineIndex: index,
      state: 'pristine',
    })
  }
  if (chapters.length === 0) throw new EpubError('empty-spine')

  const coverId =
    elementsByLocalName(opfDoc, 'meta')
      .find((meta) => meta.getAttribute('name') === 'cover')
      ?.getAttribute('content') ?? undefined
  let coverHref: string | undefined
  if (coverId && manifest.has(coverId)) {
    coverHref = manifest.get(coverId)?.href
  } else {
    coverHref = [...manifest.values()].find((item) =>
      item.properties.split(/\s+/).includes('cover-image'),
    )?.href
  }

  const entries = await readEntries(zip)

  return {
    title,
    author,
    language,
    coverHref,
    coverId,
    chapters,
    entries,
    navHref,
    opfHref,
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
