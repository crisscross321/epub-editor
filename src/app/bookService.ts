import type { BookRecord, ChapterDump, ChapterIndex, ChapterKind, TiptapDoc, TiptapNode } from '../types/book'
import { findHits, textFromDoc, textFromHtml } from '../content/text'
import { structureImportedText } from '../editor/importText'
import { toArrayBuffer, bytesToDataUrl } from '../epub/bytes'
import { checkExport } from '../epub/exportCheck'
import { messageForUnknown } from '../epub/errors'
import { parseEpub } from '../epub/parse'
import { dirname, extname, joinPath } from '../epub/paths'
import { docToXhtml, imageHrefFor, packEpub, rewriteImageSrcs } from '../epub/serialize'
import {
  demoteMergedChapterTitle,
  displayChapterName,
  ensureLeadingH1,
  exportChapterHeading,
  splitDocByH1,
  withChapterHeading,
} from '../epub/headings'
import {
  bookOutline,
  canMergeChapters,
  dissolvePart as dissolvePartIn,
  inferKind,
  insertChapters,
  moveChapterStep,
  moveChapterToIndex,
  normalizeParts,
  removeChapter,
  renamePart as renamePartIn,
  setChapterKind as setChapterKindIn,
  sortChapters,
  startPartAt,
  withKind,
} from '../epub/parts'
import { analyzeSimplifyLoss, emptyLoss } from '../epub/loss'
import type { PlainChapter } from '../epub/plain'
import { replaceAllInDoc } from '../epub/replace'
import { emptyDoc, simplifyXhtml } from '../epub/simplify'
import { inlineRelativeImages } from '../epub/previewImages'
import { compressImage } from '../images/compress'
import { packBackup, unpackBackup } from './backup'
import { rememberBlobUrl, revokeBlobUrl, revokeBookImages } from '../storage/blobUrls'
import { assertRoomFor } from '../storage/persist'
import { enqueueByKey } from '../storage/saveQueue'
import { clearPartFold } from '../storage/partFold'
import { loadSettings } from '../storage/settings'
import { dumpSizeBytes, isTrashExpired } from '../storage/trash'
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
    addedAt: now(),
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
  await assertRoomFor(buf.byteLength)
  const parsed = await parseEpub(buf)
  const id = newId()
  const book: BookRecord = {
    id,
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    updatedAt: now(),
    addedAt: now(),
    sourceName,
    opfHref: parsed.opfHref,
    coverPath: parsed.coverHref,
    chapters: parsed.chapters,
    ...(parsed.parts?.length ? { parts: parsed.parts } : {}),
    ...(parsed.partWord ? { partWord: parsed.partWord } : {}),
    ...(parsed.chapterNumbering ? { chapterNumbering: parsed.chapterNumbering } : {}),
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
  clearPartFold(id)
}

export async function getDoc(bookId: string, chapterId: string): Promise<TiptapDoc | undefined> {
  return db.getDoc(bookId, chapterId)
}

export async function saveDoc(
  bookId: string,
  chapterId: string,
  doc: TiptapDoc,
  options?: { splitOnH1?: boolean },
): Promise<{ book: BookRecord; focusChapterId: string; focusDoc: TiptapDoc }> {
  return enqueueByKey(bookId, async () => {
    const book = await getBook(bookId)
    const chapter = book.chapters.find((ch) => ch.id === chapterId)
    if (!chapter) throw new Error('找不到这一章')
    const slices = splitDocByH1(doc, chapter.title)
    const title = slices[0]?.title ?? displayChapterName(chapter.title)
    if (!options?.splitOnH1 || slices.length <= 1) {
      const chapters = book.chapters.map((ch) => (ch.id === chapterId ? { ...ch, title } : ch))
      const nextBook = await db.updateBookWithDocs(bookId, (latest) => touch({ ...latest, chapters }), [{ chapterId, doc }])
      return { book: nextBook, focusChapterId: chapterId, focusDoc: doc }
    }

    const first = slices[0]!
    const documents = [{ chapterId, doc: first.doc }]

    const created: ChapterIndex[] = []
    for (let i = 1; i < slices.length; i += 1) {
      const slice = slices[i]!
      const id = `ch-${newId().slice(0, 8)}`
      const next: ChapterIndex = withKind(
        {
          id,
          href: `OEBPS/text/${id}.xhtml`,
          title: slice.title,
          spineIndex: 0,
          state: 'simplified',
        },
        inferKind(slice.title),
      )
      documents.push({ chapterId: id, doc: slice.doc })
      created.push(next)
    }

    const renamed = book.chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: first.title } : ch))
    const { chapters } = insertChapters({ ...book, chapters: renamed }, chapterId, created)

    const nextBook = await db.updateBookWithDocs(bookId, (latest) => touch({ ...latest, chapters }), documents)
    const jumped = created[0]
    return {
      book: nextBook,
      focusChapterId: jumped?.id ?? chapterId,
      focusDoc: jumped ? slices[1]!.doc : first.doc,
    }
  })
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
  await assertRoomFor(file.size)
  const compressed = await compressImage(file)
  const imageId = newId()
  await db.putBlob(bookId, imageId, compressed.bytes, compressed.mime)
  const src = rememberBlobUrl(
    `${bookId}::${imageId}`,
    new Blob([toArrayBuffer(compressed.bytes)], { type: compressed.mime }),
  )
  return { imageId, src }
}

export async function blobUrlFor(bookId: string, imageId: string): Promise<string | null> {
  const blob = await db.getBlob(bookId, imageId)
  if (!blob) return null
  return rememberBlobUrl(
    `${bookId}::${imageId}`,
    new Blob([toArrayBuffer(blob.data)], { type: blob.mime }),
  )
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
  const id = `ch-${newId().slice(0, 8)}`
  const chapter: ChapterIndex = {
    id,
    href: `OEBPS/text/${id}.xhtml`,
    title: '',
    spineIndex: 0,
    state: 'simplified',
  }
  await db.putDoc(bookId, id, emptyDoc())
  return saveBook(insertChapters(book, afterId, [chapter]))
}

export async function updateBookMeta(
  bookId: string,
  patch: { title?: string; author?: string; description?: string },
): Promise<BookRecord> {
  return enqueueByKey(bookId, async () => {
    const book = await getBook(bookId)
    return saveBook({ ...book, ...patch })
  })
}

export async function renameChapter(bookId: string, chapterId: string, title: string): Promise<BookRecord> {
  return enqueueByKey(bookId, async () => {
    const book = await getBook(bookId)
    const chapters = book.chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: title.trim() } : ch))
    return saveBook({ ...book, chapters })
  })
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
  if (target) await db.deleteEntry(bookId, target.href)
  await db.deleteDoc(bookId, chapterId)
  return saveBook(removeChapter(book, chapterId))
}

export async function moveChapter(bookId: string, chapterId: string, dir: -1 | 1): Promise<BookRecord> {
  const book = await getBook(bookId)
  const next = moveChapterStep(book, chapterId, dir)
  return next === book ? book : saveBook(next)
}

export async function setChapterKind(bookId: string, chapterId: string, kind: ChapterKind): Promise<BookRecord> {
  return saveBook(setChapterKindIn(await getBook(bookId), chapterId, kind))
}

export async function startPart(bookId: string, chapterId: string): Promise<{ book: BookRecord; partId: string }> {
  const partId = `part-${newId().slice(0, 8)}`
  const book = await saveBook(startPartAt(await getBook(bookId), chapterId, { id: partId, title: '' }))
  return { book, partId }
}

export async function renamePart(bookId: string, partId: string, title: string): Promise<BookRecord> {
  return enqueueByKey(bookId, async () => saveBook(renamePartIn(await getBook(bookId), partId, title)))
}

export async function dissolvePart(bookId: string, partId: string): Promise<BookRecord> {
  return saveBook(dissolvePartIn(await getBook(bookId), partId))
}

export async function saveCover(bookId: string, file: Blob): Promise<BookRecord> {
  await assertRoomFor(file.size)
  const book = await getBook(bookId)
  const compressed = await compressImage(file)
  revokeBlobUrl(`${bookId}::cover`)
  await db.putBlob(bookId, 'cover', compressed.bytes, compressed.mime)
  return saveBook({ ...book, coverPath: `OEBPS/cover.${compressed.ext}` })
}

export async function coverUrl(bookId: string): Promise<string | null> {
  return blobUrlFor(bookId, 'cover')
}

export async function exportEpub(bookId: string): Promise<Uint8Array> {
  const book = await getBook(bookId)
  const { headings } = bookOutline(book)
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
    const heading = headings.get(chapter.id) ?? ''
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
  heading = exportChapterHeading(chapter.spineIndex, chapter.title),
): Promise<{ html: string; warning?: string }> {
  if (chapter.state === 'simplified') {
    const doc = (await db.getDoc(bookId, chapter.id)) ?? emptyDoc()
    const hydrated = await hydrateDocImages(bookId, doc, 'data')
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

export async function saveProgress(
  bookId: string,
  chapterId: string,
  offset: number,
): Promise<BookRecord> {
  return db.updateBookWithDocs(bookId, (book) => ({
    ...book,
    readChapterId: chapterId,
    readOffset: Number.isFinite(offset) ? Math.min(1, Math.max(0, offset)) : 0,
    lastReadAt: now(),
  }))
}

export async function markExported(bookId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  return saveBook({ ...book, lastExportedAt: now() })
}

export async function trashBook(id: string): Promise<void> {
  const dump = await db.snapshotBook(id)
  if (!dump) return
  await db.putTrash(dump)
  await db.deleteBookData(id)
  revokeBookImages(id, false)
}

export async function restoreBook(id: string): Promise<void> {
  const dump = await db.getTrash(id)
  if (!dump) throw new Error('找不到刚删除的书')
  await db.restoreDump(dump)
  await db.deleteTrash(id)
}

export async function purgeTrash(id: string): Promise<void> {
  await db.deleteTrash(id)
  clearPartFold(id)
}

export async function trashSummary(): Promise<{ count: number; bytes: number }> {
  const dumps = await db.listTrash()
  return {
    count: dumps.length,
    bytes: dumps.reduce((sum, dump) => sum + dumpSizeBytes(dump), 0),
  }
}

export async function emptyTrash(): Promise<void> {
  const dumps = await db.listTrash()
  await Promise.all(dumps.map((dump) => purgeTrash(dump.id)))
}

export async function purgeExpiredTrash(nowMs = Date.now()): Promise<number> {
  const dumps = await db.listTrash()
  const expired = dumps.filter((dump) => isTrashExpired(dump.trashedAt, nowMs))
  await Promise.all(expired.map((dump) => purgeTrash(dump.id)))
  return expired.length
}

export async function snapshotChapter(bookId: string, chapterId: string): Promise<ChapterDump | undefined> {
  const book = await getBook(bookId)
  const chapter = book.chapters.find((ch) => ch.id === chapterId)
  if (!chapter) return undefined
  return {
    bookId,
    chapter,
    doc: await db.getDoc(bookId, chapterId),
    entry: await db.getEntry(bookId, chapter.href),
  }
}

export async function restoreChapter(dump: ChapterDump): Promise<BookRecord> {
  const book = await getBook(dump.bookId)
  if (book.chapters.some((ch) => ch.id === dump.chapter.id)) return book
  const insertAt = Math.min(dump.chapter.spineIndex, book.chapters.length)
  const sorted = sortChapters(book.chapters)
  const next = [...sorted.slice(0, insertAt), dump.chapter, ...sorted.slice(insertAt)].map((ch, index) => ({
    ...ch,
    spineIndex: index,
  }))
  if (dump.doc) await db.putDoc(dump.bookId, dump.chapter.id, dump.doc)
  if (dump.entry) await db.putEntry(dump.bookId, dump.chapter.href, dump.entry)
  return saveBook(normalizeParts({ ...book, chapters: next }))
}

export async function addAnnotation(
  bookId: string,
  chapterId: string,
  kind: 'bookmark' | 'highlight' | 'note',
  text: string,
  note?: string,
  offset = 0,
): Promise<void> {
  await db.putAnnotation({
    id: newId(),
    bookId,
    chapterId,
    kind,
    text: text.trim(),
    note: note?.trim() || undefined,
    offset: Math.min(1, Math.max(0, offset)),
    createdAt: now(),
  })
}

export async function listNotes(bookId: string) {
  return db.listAnnotations(bookId)
}

export async function removeNote(id: string) {
  await db.deleteAnnotation(id)
}

export async function chapterPlain(bookId: string, chapter: ChapterIndex): Promise<string> {
  if (chapter.state === 'simplified') {
    return textFromDoc((await db.getDoc(bookId, chapter.id)) ?? emptyDoc())
  }
  const bytes = await db.getEntry(bookId, chapter.href)
  return bytes ? textFromHtml(new TextDecoder().decode(bytes)) : ''
}

export async function isChapterEmpty(bookId: string, chapter: ChapterIndex): Promise<boolean> {
  if (chapter.state === 'simplified') {
    const doc = (await db.getDoc(bookId, chapter.id)) ?? emptyDoc()
    return !textFromDoc(doc).trim()
  }
  return !(await chapterPlain(bookId, chapter)).trim()
}

export async function searchBook(
  bookId: string,
  query: string,
): Promise<{ chapterId: string; title: string; snippet: string; index: number }[]> {
  const book = await getBook(bookId)
  const { chapters: sorted, headings } = bookOutline(book)
  const hits: { chapterId: string; title: string; snippet: string; index: number }[] = []
  for (const chapter of sorted) {
    const text = await chapterPlain(bookId, chapter)
    for (const hit of findHits(text, query)) {
      hits.push({
        chapterId: chapter.id,
        title: headings.get(chapter.id) ?? '',
        snippet: hit.snippet,
        index: hit.index,
      })
    }
  }
  return hits
}

export async function replaceAllInBook(
  bookId: string,
  search: string,
  replacement: string,
  options?: { wildcards?: boolean },
): Promise<{ count: number; skipped: number }> {
  return enqueueByKey(bookId, async () => {
    const book = await getBook(bookId)
    let count = 0
    let skipped = 0
    const documents: { chapterId: string; doc: TiptapDoc }[] = []
    const chapters = book.chapters.map(ch => ({ ...ch }))
    for (const chapter of chapters) {
      if (chapter.state !== 'simplified') { skipped += 1; continue }
      const doc = (await db.getDoc(bookId, chapter.id)) ?? emptyDoc()
      const result = replaceAllInDoc(doc, search, replacement, options)
      if (result.count) {
        count += result.count
        documents.push({ chapterId: chapter.id, doc: result.doc })
        chapter.title = splitDocByH1(result.doc, chapter.title)[0]?.title ?? chapter.title
      }
    }
    if (count) await db.updateBookWithDocs(bookId, latest => touch({ ...latest, chapters }), documents)
    return { count, skipped }
  })
}

export async function mergeChapters(bookId: string, firstId: string, secondId: string): Promise<BookRecord> {
  const book = await getBook(bookId)
  const sorted = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const first = sorted.find((ch) => ch.id === firstId)
  const second = sorted.find((ch) => ch.id === secondId)
  if (!first || !second) throw new Error('找不到要合并的章节')
  if (Math.abs(first.spineIndex - second.spineIndex) !== 1) throw new Error('只能合并相邻章节')
  if (first.partId !== second.partId) throw new Error('不在同一册的两章不能合并')
  if (!canMergeChapters(first, second)) throw new Error('编号章节和不编号章节不能合并')
  const keep = first.spineIndex < second.spineIndex ? first : second
  const drop = keep.id === first.id ? second : first
  const keepDoc = keep.state === 'simplified' ? ((await db.getDoc(bookId, keep.id)) ?? emptyDoc()) : emptyDoc()
  const dropDoc = drop.state === 'simplified' ? ((await db.getDoc(bookId, drop.id)) ?? emptyDoc()) : emptyDoc()
  if (keep.state !== 'simplified' || drop.state !== 'simplified') {
    throw new Error('未编辑的章节请先打开后再合并，以免打乱原书排版')
  }
  const merged: TiptapDoc = {
    type: 'doc',
    content: [...(keepDoc.content ?? []), ...demoteMergedChapterTitle(dropDoc.content ?? [])],
  }
  await db.putDoc(bookId, keep.id, merged)
  return deleteChapter(bookId, drop.id)
}

export async function moveChapterTo(bookId: string, chapterId: string, toIndex: number): Promise<BookRecord> {
  const book = await getBook(bookId)
  if (!book.chapters.some((ch) => ch.id === chapterId)) return book
  return saveBook(moveChapterToIndex(book, chapterId, toIndex))
}

export async function importTextBook(raw: string, filename: string): Promise<BookRecord> {
  await assertRoomFor(new TextEncoder().encode(raw).byteLength)
  const structured = structureImportedText(raw, filename)
  const created = await createBook()
  const title = filename.replace(/\.(txt|md|markdown)$/i, '') || created.title
  const first = created.chapters[0]
  if (!first) return created
  const parts = structured.parts.map((part) => ({ id: `part-${newId().slice(0, 8)}`, title: part.title }))
  const chapters: ChapterIndex[] = []
  for (const [index, item] of structured.chapters.entries()) {
    const id = index === 0 ? first.id : `ch-${newId().slice(0, 8)}`
    const base: ChapterIndex = {
      id,
      href: index === 0 ? first.href : `OEBPS/text/${id}.xhtml`,
      title: item.title,
      spineIndex: index,
      state: 'simplified',
    }
    const partId = item.part !== undefined ? parts[item.part]?.id : undefined
    chapters.push({ ...withKind(base, item.kind ?? 'chapter'), ...(partId ? { partId } : {}) })
    await db.putDoc(created.id, id, item.doc)
  }
  return saveBook(
    normalizeParts({
      ...created,
      title,
      sourceName: filename,
      chapters,
      ...(parts.length ? { parts } : {}),
      ...(structured.partWord ? { partWord: structured.partWord } : {}),
      ...(structured.chapterNumbering === 'perPart' ? { chapterNumbering: 'perPart' as const } : {}),
    }),
  )
}

export async function inspectExport(bookId: string) {
  const book = await getBook(bookId)
  const cover = await db.getBlob(bookId, 'cover')
  const outline = bookOutline(book)
  const chapters = []
  for (const chapter of outline.chapters) {
    chapters.push({
      id: chapter.id,
      title: outline.headings.get(chapter.id) ?? '',
      empty: await isChapterEmpty(bookId, chapter),
    })
  }
  const blobs = await db.listBlobs(bookId)
  return checkExport({
    title: book.title,
    language: book.language,
    hasCover: Boolean(cover),
    chapters,
    emptyParts: outline.groups.filter((g) => g.part && g.chapters.length === 0).map((g) => g.heading),
    imageBytes: blobs.filter((b) => b.id !== 'cover').map((b) => b.data.byteLength),
  })
}

export async function bookPlainChapters(bookId: string): Promise<PlainChapter[]> {
  const book = await getBook(bookId)
  const outline = bookOutline(book)
  const out: PlainChapter[] = []
  for (const group of outline.groups) {
    for (const [i, chapter] of group.chapters.entries()) {
      out.push({
        title: outline.headings.get(chapter.id) ?? '',
        body: await chapterPlain(bookId, chapter),
        ...(group.part && i === 0 ? { part: group.heading } : {}),
      })
    }
  }
  return out
}

export function chapterHeadingIn(book: BookRecord, chapterId: string): string {
  return bookOutline(book).headings.get(chapterId) ?? ''
}

export async function getChapterLoss(bookId: string, chapterId: string) {
  const book = await getBook(bookId)
  const chapter = book.chapters.find((ch) => ch.id === chapterId)
  if (!chapter || chapter.state !== 'pristine') return emptyLoss()
  const bytes = await db.getEntry(bookId, chapter.href)
  if (!bytes) return emptyLoss()
  return analyzeSimplifyLoss(new TextDecoder().decode(bytes))
}

export async function exportShelfBackup(): Promise<Uint8Array> {
  const list = await db.listBooks()
  const books = []
  for (const book of list) {
    books.push({
      book,
      entries: [...(await db.getAllEntries(book.id))].map(([path, data]) => ({ path, data })),
      docs: [...(await db.getAllDocs(book.id))].map(([chapterId, doc]) => ({ chapterId, doc })),
      blobs: await db.listBlobs(book.id),
      annotations: await db.listAnnotations(book.id),
    })
  }
  return packBackup({
    version: 1,
    exportedAt: now(),
    settings: loadSettings(),
    books,
  })
}

export async function importShelfBackup(bytes: Uint8Array): Promise<{ imported: number; renamed: number }> {
  await assertRoomFor(bytes.byteLength)
  const data = await unpackBackup(bytes)
  let imported = 0
  let renamed = 0
  for (const item of data.books) {
    let next = item
    if (await db.getBook(item.book.id)) {
      const id = newId()
      next = {
        book: { ...item.book, id },
        entries: item.entries,
        docs: item.docs,
        blobs: item.blobs,
        annotations: item.annotations.map((note) => ({ ...note, id: newId(), bookId: id })),
      }
      renamed += 1
    }
    await db.putBook(next.book)
    for (const entry of next.entries) await db.putEntry(next.book.id, entry.path, entry.data)
    for (const doc of next.docs) await db.putDoc(next.book.id, doc.chapterId, doc.doc)
    for (const blob of next.blobs) await db.putBlob(next.book.id, blob.id, blob.data, blob.mime)
    for (const note of next.annotations) await db.putAnnotation(note)
    imported += 1
  }
  return { imported, renamed }
}

export function releaseBookImages(bookId: string): void {
  revokeBookImages(bookId)
}

export { messageForUnknown }
