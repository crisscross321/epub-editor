import type { BookRecord, ChapterIndex, TiptapDoc, TiptapNode } from '../types/book'
import { toArrayBuffer } from '../epub/bytes'
import { messageForUnknown } from '../epub/errors'
import { parseEpub } from '../epub/parse'
import { dirname, extname, joinPath } from '../epub/paths'
import { docToXhtml, imageHrefFor, packEpub, rewriteImageSrcs } from '../epub/serialize'
import { emptyDoc, simplifyXhtml } from '../epub/simplify'
import { compressImage } from '../images/compress'
import * as db from '../storage/idb'

function now(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

function touch(book: BookRecord): BookRecord {
  return { ...book, updatedAt: now() }
}

function walkNodes(doc: TiptapDoc, visit: (node: TiptapNode) => void): void {
  const walk = (node: TiptapNode) => {
    visit(node)
    node.content?.forEach(walk)
  }
  doc.content?.forEach(walk)
}

export async function listBooks(): Promise<BookRecord[]> {
  return db.listBooks()
}

export async function getBook(id: string): Promise<BookRecord> {
  const book = await db.getBook(id)
  if (!book) throw new Error('找不到这本书')
  return book
}

export async function createBook(): Promise<BookRecord> {
  const id = newId()
  const chapterId = 'ch1'
  const book: BookRecord = {
    id,
    title: '未命名',
    author: '',
    language: 'zh-CN',
    updatedAt: now(),
    opfHref: 'OEBPS/content.opf',
    chapters: [
      {
        id: chapterId,
        href: 'OEBPS/text/ch1.xhtml',
        title: '第一章',
        spineIndex: 0,
        state: 'simplified',
      },
    ],
  }
  await db.putBook(book)
  await db.putDoc(id, chapterId, emptyDoc())
  return book
}

export async function importEpub(buf: ArrayBuffer, sourceName: string): Promise<BookRecord> {
  const parsed = await parseEpub(buf)
  const id = newId()
  const book: BookRecord = {
    id,
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    updatedAt: now(),
    sourceName,
    opfHref: parsed.opfHref,
    coverPath: parsed.coverHref,
    chapters: parsed.chapters,
  }
  await db.putBook(book)
  for (const [path, data] of parsed.entries) {
    await db.putEntry(id, path, data)
  }
  if (parsed.coverHref) {
    const cover = parsed.entries.get(parsed.coverHref)
    if (cover) {
      const mime =
        extname(parsed.coverHref) === 'png'
          ? 'image/png'
          : extname(parsed.coverHref) === 'webp'
            ? 'image/webp'
            : 'image/jpeg'
      await db.putBlob(id, 'cover', cover, mime)
    }
  }
  return book
}

export async function saveBook(book: BookRecord): Promise<BookRecord> {
  const next = touch(book)
  await db.putBook(next)
  return next
}

export async function deleteBook(id: string): Promise<void> {
  await db.deleteBookData(id)
}

export async function getDoc(bookId: string, chapterId: string): Promise<TiptapDoc | undefined> {
  return db.getDoc(bookId, chapterId)
}

export async function saveDoc(bookId: string, chapterId: string, doc: TiptapDoc): Promise<void> {
  const book = await getBook(bookId)
  await db.putDoc(bookId, chapterId, doc)
  const heading = firstHeadingText(doc)
  const chapters = book.chapters.map((ch) =>
    ch.id === chapterId ? { ...ch, title: heading || ch.title } : ch,
  )
  await db.putBook(touch({ ...book, chapters }))
}

function firstHeadingText(doc: TiptapDoc): string {
  const heading = doc.content?.find((n) => n.type === 'heading')
  const parts: string[] = []
  walkNodes({ type: 'doc', content: heading ? [heading] : [] }, (node) => {
    if (node.type === 'text' && node.text) parts.push(node.text)
  })
  return parts.join('').trim()
}

export async function openChapterForEdit(bookId: string, chapterId: string): Promise<TiptapDoc> {
  const book = await getBook(bookId)
  const chapter = book.chapters.find((ch) => ch.id === chapterId)
  if (!chapter) throw new Error('找不到这一章')
  if (chapter.state === 'simplified') {
    const existing = await db.getDoc(bookId, chapterId)
    return existing ?? emptyDoc()
  }
  const bytes = await db.getEntry(bookId, chapter.href)
  if (!bytes) throw new Error('找不到这一章的原文')
  const xhtml = new TextDecoder().decode(bytes)
  const chapterDir = dirname(chapter.href)
  const doc = simplifyXhtml(xhtml, (src) => joinPath(chapterDir, src))
  await materializeImages(bookId, doc)
  await db.putDoc(bookId, chapterId, doc)
  const chapters = book.chapters.map((ch) =>
    ch.id === chapterId ? { ...ch, state: 'simplified' as const } : ch,
  )
  await db.putBook(touch({ ...book, chapters }))
  return doc
}

async function materializeImages(bookId: string, doc: TiptapDoc): Promise<void> {
  const tasks: Promise<void>[] = []
  walkNodes(doc, (node) => {
    if (node.type !== 'image') return
    const src = String(node.attrs?.src ?? '')
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return
    tasks.push(
      (async () => {
        const data = await db.getEntry(bookId, src)
        if (!data) {
          node.attrs = { ...node.attrs, src: '' }
          return
        }
          const compressed = await compressImage(new Blob([toArrayBuffer(data)]))
        const imageId = newId()
        await db.putBlob(bookId, imageId, compressed.bytes, compressed.mime)
        node.attrs = {
          ...node.attrs,
          src: '',
          imageId,
        }
      })(),
    )
  })
  await Promise.all(tasks)
}

export async function insertImage(bookId: string, file: Blob): Promise<{ imageId: string; src: string }> {
  const compressed = await compressImage(file)
  const imageId = newId()
  await db.putBlob(bookId, imageId, compressed.bytes, compressed.mime)
  const src = URL.createObjectURL(new Blob([toArrayBuffer(compressed.bytes)], { type: compressed.mime }))
  return { imageId, src }
}

export async function blobUrlFor(bookId: string, imageId: string): Promise<string | null> {
  const blob = await db.getBlob(bookId, imageId)
  if (!blob) return null
  return URL.createObjectURL(new Blob([toArrayBuffer(blob.data)], { type: blob.mime }))
}

export async function hydrateDocImages(bookId: string, doc: TiptapDoc): Promise<TiptapDoc> {
  const clone = structuredClone(doc) as TiptapDoc
  const jobs: Promise<void>[] = []
  walkNodes(clone, (node) => {
    if (node.type !== 'image') return
    const imageId = String(node.attrs?.imageId ?? '')
    if (!imageId) return
    jobs.push(
      blobUrlFor(bookId, imageId).then((url) => {
        if (url) node.attrs = { ...node.attrs, src: url }
      }),
    )
  })
  await Promise.all(jobs)
  return clone
}

export async function addChapter(bookId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const n = book.chapters.length + 1
  const id = `ch-${newId().slice(0, 8)}`
  const chapter: ChapterIndex = {
    id,
    href: `OEBPS/text/${id}.xhtml`,
    title: `第 ${n} 章`,
    spineIndex: book.chapters.length,
    state: 'simplified',
  }
  await db.putDoc(bookId, id, emptyDoc())
  return saveBook({ ...book, chapters: [...book.chapters, chapter] })
}

export async function deleteChapter(bookId: string, chapterId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const target = book.chapters.find((ch) => ch.id === chapterId)
  const chapters = book.chapters
    .filter((ch) => ch.id !== chapterId)
    .map((ch, index) => ({ ...ch, spineIndex: index }))
  if (target) await db.deleteEntry(bookId, target.href)
  await db.deleteDoc(bookId, chapterId)
  return saveBook({ ...book, chapters })
}

export async function moveChapter(bookId: string, chapterId: string, dir: -1 | 1): Promise<BookRecord> {
  const book = await getBook(bookId)
  const chapters = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const index = chapters.findIndex((ch) => ch.id === chapterId)
  const swap = index + dir
  if (index < 0 || swap < 0 || swap >= chapters.length) return book
  const tmp = chapters[index]!
  chapters[index] = chapters[swap]!
  chapters[swap] = tmp
  return saveBook({
    ...book,
    chapters: chapters.map((ch, spineIndex) => ({ ...ch, spineIndex })),
  })
}

export async function saveCover(bookId: string, file: Blob): Promise<BookRecord> {
  const book = await getBook(bookId)
  const compressed = await compressImage(file)
  await db.putBlob(bookId, 'cover', compressed.bytes, compressed.mime)
  return saveBook({ ...book, coverPath: `OEBPS/cover.${compressed.ext}` })
}

export async function coverUrl(bookId: string): Promise<string | null> {
  return blobUrlFor(bookId, 'cover')
}

export async function exportEpub(bookId: string): Promise<Uint8Array> {
  const book = await getBook(bookId)
  const entries = await db.getAllEntries(bookId)
  const simplified = new Map<
    string,
    { xhtml: string; images: { id: string; href: string; bytes: Uint8Array; mime: string }[] }
  >()
  for (const chapter of book.chapters) {
    if (chapter.state !== 'simplified') continue
    const doc = (await db.getDoc(bookId, chapter.id)) ?? emptyDoc()
    const packedImages: { id: string; href: string; bytes: Uint8Array; mime: string }[] = []
    const seen = new Set<string>()
    walkNodes(doc, (node) => {
      if (node.type !== 'image') return
      const imageId = String(node.attrs?.imageId ?? '')
      if (!imageId || seen.has(imageId)) return
      seen.add(imageId)
    })
    for (const imageId of seen) {
      const blob = await db.getBlob(bookId, imageId)
      if (!blob) continue
      packedImages.push({
        id: `img-${imageId.slice(0, 8)}`,
        href: imageHrefFor(book, imageId, blob.mime),
        bytes: blob.data,
        mime: blob.mime,
      })
    }
    const mapped = rewriteImageSrcs(doc, (imageId) => {
      const packed = packedImages.find((img) => img.href.includes(imageId))
      return packed ? relativeSrc(chapter.href, packed.href) : undefined
    })
    simplified.set(chapter.id, {
      xhtml: docToXhtml(mapped, chapter.title, book.language),
      images: packedImages,
    })
  }
  const cover = await db.getBlob(bookId, 'cover')
  return packEpub({
    book,
    entries,
    simplified,
    cover: cover
      ? {
          bytes: cover.data,
          mime: cover.mime,
          ext: cover.mime.includes('png') ? 'png' : 'jpg',
        }
      : undefined,
  })
}

function relativeSrc(fromFile: string, toFile: string): string {
  const fromDir = dirname(fromFile)
  const fromParts = fromDir.split('/').filter(Boolean)
  const toParts = toFile.split('/').filter(Boolean)
  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i += 1
  const up = fromParts.slice(i).map(() => '..')
  return [...up, ...toParts.slice(i)].join('/')
}

export async function getChapterPreview(
  bookId: string,
  chapter: ChapterIndex,
): Promise<{ html: string; warning?: string }> {
  if (chapter.state === 'simplified') {
    const doc = (await db.getDoc(bookId, chapter.id)) ?? emptyDoc()
    const hydrated = await hydrateDocImages(bookId, doc)
    return { html: docToXhtml(hydrated, chapter.title) }
  }
  const bytes = await db.getEntry(bookId, chapter.href)
  if (!bytes) {
    return { html: '<p></p>', warning: '本章尚未编辑，预览可能不完整' }
  }
  try {
    const xhtml = new TextDecoder().decode(bytes)
    return { html: xhtml }
  } catch {
    return { html: '<p></p>', warning: '本章尚未编辑，预览可能不完整' }
  }
}

export { messageForUnknown }
