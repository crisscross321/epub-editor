import type { BookRecord, ChapterIndex, TiptapDoc, TiptapNode } from '../types/book'
import { toArrayBuffer, bytesToDataUrl } from '../epub/bytes'
import { messageForUnknown } from '../epub/errors'
import { parseEpub } from '../epub/parse'
import { dirname, extname, joinPath } from '../epub/paths'
import { docToXhtml, imageHrefFor, packEpub, rewriteImageSrcs } from '../epub/serialize'
import {
  ensureLeadingH1,
  exportChapterHeading,
  splitDocByH1,
  withChapterHeading,
} from '../epub/headings'
import { emptyDoc, simplifyXhtml } from '../epub/simplify'
import { inlineRelativeImages } from '../epub/previewImages'
import { compressImage } from '../images/compress'
import * as db from '../storage/idb'

function now(): string {
  return new Date().toISOString()
}

function newId(): string {
  const cryptoObj = globalThis.crypto
  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof cryptoObj?.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
        title: '',
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

export async function saveDoc(
  bookId: string,
  chapterId: string,
  doc: TiptapDoc,
): Promise<{ book: BookRecord; focusChapterId: string; focusDoc: TiptapDoc }> {
  const book = await getBook(bookId)
  const chapter = book.chapters.find((ch) => ch.id === chapterId)
  if (!chapter) throw new Error('找不到这一章')
  const slices = splitDocByH1(doc, chapter.title)
  const first = slices[0]!
  await db.putDoc(bookId, chapterId, first.doc)

  const sorted = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const afterIndex = sorted.findIndex((ch) => ch.id === chapterId)
  const created: ChapterIndex[] = []
  for (let i = 1; i < slices.length; i += 1) {
    const slice = slices[i]!
    const id = `ch-${newId().slice(0, 8)}`
    const next: ChapterIndex = {
      id,
      href: `OEBPS/text/${id}.xhtml`,
      title: slice.title,
      spineIndex: afterIndex + i,
      state: 'simplified',
    }
    await db.putDoc(bookId, id, slice.doc)
    created.push(next)
  }

  const renamed = sorted.map((ch) => (ch.id === chapterId ? { ...ch, title: first.title } : ch))
  const chapters = created.length
    ? [...renamed.slice(0, afterIndex + 1), ...created, ...renamed.slice(afterIndex + 1)].map(
        (ch, spineIndex) => ({ ...ch, spineIndex }),
      )
    : renamed

  const nextBook = await saveBook({ ...book, chapters })
  const jumped = created[0]
  return {
    book: nextBook,
    focusChapterId: jumped?.id ?? chapterId,
    focusDoc: jumped ? slices[1]!.doc : first.doc,
  }
}

export async function openChapterForEdit(bookId: string, chapterId: string): Promise<TiptapDoc> {
  const book = await getBook(bookId)
  const chapter = book.chapters.find((ch) => ch.id === chapterId)
  if (!chapter) throw new Error('找不到这一章')
  if (chapter.state === 'simplified') {
    const existing = await db.getDoc(bookId, chapterId)
    return ensureLeadingH1(existing ?? emptyDoc(), chapter.title)
  }
  const bytes = await db.getEntry(bookId, chapter.href)
  if (!bytes) throw new Error('找不到这一章的原文')
  const xhtml = new TextDecoder().decode(bytes)
  const chapterDir = dirname(chapter.href)
  const doc = simplifyXhtml(xhtml, (src) => joinPath(chapterDir, src))
  await materializeImages(bookId, doc)
  const body = ensureLeadingH1(doc, chapter.title)
  await db.putDoc(bookId, chapterId, body)
  const chapters = book.chapters.map((ch) =>
    ch.id === chapterId ? { ...ch, state: 'simplified' as const } : ch,
  )
  await db.putBook(touch({ ...book, chapters }))
  return body
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

export async function dataUrlFor(bookId: string, imageId: string): Promise<string | null> {
  const blob = await db.getBlob(bookId, imageId)
  if (!blob) return null
  return bytesToDataUrl(blob.data, blob.mime)
}

export async function hydrateDocImages(
  bookId: string,
  doc: TiptapDoc,
  kind: 'blob' | 'data' = 'blob',
): Promise<TiptapDoc> {
  const clone = JSON.parse(JSON.stringify(doc)) as TiptapDoc
  const jobs: Promise<void>[] = []
  walkNodes(clone, (node) => {
    if (node.type !== 'image') return
    const imageId = String(node.attrs?.imageId ?? '')
    if (!imageId) return
    jobs.push(
      (kind === 'data' ? dataUrlFor(bookId, imageId) : blobUrlFor(bookId, imageId)).then((url) => {
        if (url) node.attrs = { ...node.attrs, src: url }
      }),
    )
  })
  await Promise.all(jobs)
  return clone
}

export async function insertChapter(bookId: string, afterId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const sorted = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const afterIndex = sorted.findIndex((ch) => ch.id === afterId)
  const insertAt = afterIndex < 0 ? sorted.length : afterIndex + 1
  const id = `ch-${newId().slice(0, 8)}`
  const chapter: ChapterIndex = {
    id,
    href: `OEBPS/text/${id}.xhtml`,
    title: '',
    spineIndex: insertAt,
    state: 'simplified',
  }
  await db.putDoc(bookId, id, emptyDoc())
  const next = [...sorted.slice(0, insertAt), chapter, ...sorted.slice(insertAt)].map((ch, index) => ({
    ...ch,
    spineIndex: index,
  }))
  return saveBook({ ...book, chapters: next })
}

export async function renameChapter(bookId: string, chapterId: string, title: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const chapters = book.chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: title.trim() } : ch))
  return saveBook({ ...book, chapters })
}

export async function addChapter(bookId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const last = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).pop()
  if (last) return insertChapter(bookId, last.id)
  return insertChapter(bookId, '')
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
    const heading = exportChapterHeading(chapter.spineIndex, chapter.title)
    simplified.set(chapter.id, {
      xhtml: docToXhtml(withChapterHeading(mapped, heading), heading, book.language),
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
    const hydrated = await hydrateDocImages(bookId, doc, 'data')
    const heading = exportChapterHeading(chapter.spineIndex, chapter.title)
    return { html: docToXhtml(withChapterHeading(hydrated, heading), heading) }
  }
  const bytes = await db.getEntry(bookId, chapter.href)
  if (!bytes) {
    return { html: '<p></p>', warning: '本章尚未编辑，预览可能不完整' }
  }
  try {
    const xhtml = new TextDecoder().decode(bytes)
    return {
      html: await inlineRelativeImages(xhtml, chapter.href, (path) => db.getEntry(bookId, path)),
    }
  } catch {
    return { html: '<p></p>', warning: '本章尚未编辑，预览可能不完整' }
  }
}

export { messageForUnknown }
