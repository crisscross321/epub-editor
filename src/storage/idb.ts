import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BookRecord, TiptapDoc } from '../types/book'

interface SujianDB extends DBSchema {
  books: { key: string; value: BookRecord }
  entries: { key: string; value: { key: string; data: Uint8Array } }
  docs: { key: string; value: { key: string; doc: TiptapDoc } }
  blobs: { key: string; value: { key: string; data: Uint8Array; mime: string } }
}

let dbPromise: Promise<IDBPDatabase<SujianDB>> | null = null

function db() {
  dbPromise ??= openDB<SujianDB>('sujian', 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' })
      database.createObjectStore('entries', { keyPath: 'key' })
      database.createObjectStore('docs', { keyPath: 'key' })
      database.createObjectStore('blobs', { keyPath: 'key' })
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
  const tx = database.transaction(['books', 'entries', 'docs', 'blobs'], 'readwrite')
  await tx.objectStore('books').delete(id)
  for (const storeName of ['entries', 'docs', 'blobs'] as const) {
    const store = tx.objectStore(storeName)
    const keys = await store.getAllKeys()
    for (const key of keys) {
      if (String(key).startsWith(`${id}::`)) await store.delete(key)
    }
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
