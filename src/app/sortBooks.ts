import type { BookRecord } from '../types/book'
import type { ShelfSort } from '../storage/settings'
import { readingPercent } from './progress'

export type { ShelfSort }

export function bookProgress(book: BookRecord): number {
  const chapters = [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const index = Math.max(
    0,
    chapters.findIndex((ch) => ch.id === book.readChapterId),
  )
  return readingPercent(index < 0 ? 0 : index, chapters.length, book.readOffset ?? 0)
}

export function filterBooks(books: BookRecord[], query: string): BookRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return books
  return books.filter((book) => {
    const hay = [book.title, book.author, book.series, book.publisher, ...(book.tags ?? [])]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function sortBooks(books: BookRecord[], sort: ShelfSort): BookRecord[] {
  const copy = [...books]
  copy.sort((a, b) => {
    if (sort === 'title') return (a.title || '未命名').localeCompare(b.title || '未命名', 'zh-CN')
    if (sort === 'author') return (a.author || '').localeCompare(b.author || '', 'zh-CN')
    if (sort === 'added') return (b.addedAt || b.updatedAt).localeCompare(a.addedAt || a.updatedAt)
    if (sort === 'progress') return bookProgress(b) - bookProgress(a)
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  return copy
}
