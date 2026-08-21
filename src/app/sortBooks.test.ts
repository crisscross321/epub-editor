import { describe, expect, it } from 'vitest'
import type { BookRecord } from '../types/book'
import { filterBooks, sortBooks } from './sortBooks'

function book(partial: Partial<BookRecord> & Pick<BookRecord, 'id' | 'title'>): BookRecord {
  return {
    author: '',
    language: 'zh-CN',
    updatedAt: '2026-01-01T00:00:00.000Z',
    opfHref: 'OEBPS/content.opf',
    chapters: [],
    ...partial,
  }
}

describe('sortBooks', () => {
  it('sorts by title', () => {
    const books = [book({ id: 'b', title: '乙' }), book({ id: 'a', title: '甲' })]
    expect(sortBooks(books, 'title').map((b) => b.id)).toEqual(['a', 'b'])
  })
})

describe('filterBooks', () => {
  it('matches title and author', () => {
    const books = [
      book({ id: '1', title: '边城', author: '沈从文' }),
      book({ id: '2', title: '围城', author: '钱钟书' }),
    ]
    expect(filterBooks(books, '沈').map((b) => b.id)).toEqual(['1'])
  })
})
