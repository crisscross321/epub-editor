import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Annotation, BookRecord, TiptapDoc, TrashDump } from '../types/book'

interface SujianDB extends DBSchema {
  books: { key: string; value: BookRecord }
  entries: { key: string; value: { key: string; data: Uint8Array } }
  docs: { key: string; value: { key: string; doc: TiptapDoc } }
  blobs: { key: string; value: { key: string; data: Uint8Array; mime: string } }
  annotations: { key: string; value: Annotation }
  trash: { key: string; value: TrashDump }
}

let dbPromise: Promise<IDBPDatabase<SujianDB>> | null = null

function db() {
  dbPromise ??= openDB<SujianDB>('sujian', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' })
        database.createObjectStore('entries', { keyPath: 'key' })
        database.createObjectStore('docs', { keyPath: 'key' })
        database.createObjectStore('blobs', { keyPath: 'key' })
      }
      if (oldVersion < 2) {
        if (!database.objectStoreNames.contains('annotations')) {
          database.createObjectStore('annotations', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('trash')) {
          database.createObjectStore('trash', { keyPath: 'id' })
        }
      }
    },
  })
  return dbPromise
}

export async function putBook(book: BookRecord): Promise<void> {
  await (await db()).put('books', book)
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return (await db()).get('books', id)
}

export async function listBooks(): Promise<BookRecord[]> {
  const books = await (await db()).getAll('books')
  return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteBookData(id: string): Promise<void> {
  const database = await db()
  const tx = database.transaction(['books', 'entries', 'docs', 'blobs', 'annotations'], 'readwrite')
  await tx.objectStore('books').delete(id)
  for (const storeName of ['entries', 'docs', 'blobs'] as const) {
    const store = tx.objectStore(storeName)
    const keys = await store.getAllKeys()
    for (const key of keys) {
      if (String(key).startsWith(`${id}::`)) await store.delete(key)
    }
  }
  const notes = await tx.objectStore('annotations').getAll()
  for (const note of notes) {
    if (note.bookId === id) await tx.objectStore('annotations').delete(note.id)
  }
  await tx.done
}

export async function putEntry(bookId: string, path: string, data: Uint8Array): Promise<void> {
  await (await db()).put('entries', { key: `${bookId}::${path}`, data })
}

export async function getEntry(bookId: string, path: string): Promise<Uint8Array | undefined> {
  const row = await (await db()).get('entries', `${bookId}::${path}`)
  return row?.data
}

export async function getAllEntries(bookId: string): Promise<Map<string, Uint8Array>> {
  const rows = await (await db()).getAll('entries')
  const prefix = `${bookId}::`
  const map = new Map<string, Uint8Array>()
  for (const row of rows) {
    if (row.key.startsWith(prefix)) map.set(row.key.slice(prefix.length), row.data)
  }
  return map
}

export async function deleteEntry(bookId: string, path: string): Promise<void> {
  await (await db()).delete('entries', `${bookId}::${path}`)
}

export async function putDoc(bookId: string, chapterId: string, doc: TiptapDoc): Promise<void> {
  await (await db()).put('docs', { key: `${bookId}::${chapterId}`, doc })
}

export async function getDoc(bookId: string, chapterId: string): Promise<TiptapDoc | undefined> {
  const row = await (await db()).get('docs', `${bookId}::${chapterId}`)
  return row?.doc
}

export async function getAllDocs(bookId: string): Promise<Map<string, TiptapDoc>> {
  const rows = await (await db()).getAll('docs')
  const prefix = `${bookId}::`
  const map = new Map<string, TiptapDoc>()
  for (const row of rows) {
    if (row.key.startsWith(prefix)) map.set(row.key.slice(prefix.length), row.doc)
  }
  return map
}

export async function deleteDoc(bookId: string, chapterId: string): Promise<void> {
  await (await db()).delete('docs', `${bookId}::${chapterId}`)
}

export async function putBlob(bookId: string, id: string, data: Uint8Array, mime: string): Promise<void> {
  await (await db()).put('blobs', { key: `${bookId}::${id}`, data, mime })
}

export async function getBlob(bookId: string, id: string): Promise<{ data: Uint8Array; mime: string } | undefined> {
  const row = await (await db()).get('blobs', `${bookId}::${id}`)
  if (!row) return undefined
  return { data: row.data, mime: row.mime }
}

export async function listBlobs(bookId: string): Promise<{ id: string; data: Uint8Array; mime: string }[]> {
  const rows = await (await db()).getAll('blobs')
  const prefix = `${bookId}::`
  return rows
    .filter((row) => row.key.startsWith(prefix))
    .map((row) => ({ id: row.key.slice(prefix.length), data: row.data, mime: row.mime }))
}

export async function putAnnotation(note: Annotation): Promise<void> {
  await (await db()).put('annotations', note)
}

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const rows = await (await db()).getAll('annotations')
  return rows
    .filter((row) => row.bookId === bookId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteAnnotation(id: string): Promise<void> {
  await (await db()).delete('annotations', id)
}

export async function snapshotBook(id: string): Promise<TrashDump | undefined> {
  const book = await getBook(id)
  if (!book) return undefined
  const entries = [...(await getAllEntries(id))].map(([path, data]) => ({ path, data }))
  const docs = [...(await getAllDocs(id))].map(([chapterId, doc]) => ({ chapterId, doc }))
  const blobs = await listBlobs(id)
  return { id, book, entries, docs, blobs, trashedAt: new Date().toISOString() }
}

export async function putTrash(dump: TrashDump): Promise<void> {
  await (await db()).put('trash', dump)
}

export async function getTrash(id: string): Promise<TrashDump | undefined> {
  return (await db()).get('trash', id)
}

export async function deleteTrash(id: string): Promise<void> {
  await (await db()).delete('trash', id)
}

export async function restoreDump(dump: TrashDump): Promise<void> {
  await putBook(dump.book)
  for (const entry of dump.entries) await putEntry(dump.book.id, entry.path, entry.data)
  for (const doc of dump.docs) await putDoc(dump.book.id, doc.chapterId, doc.doc)
  for (const blob of dump.blobs) await putBlob(dump.book.id, blob.id, blob.data, blob.mime)
}
