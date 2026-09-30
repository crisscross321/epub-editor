import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as books from './bookService'
import { sortChapters } from '../epub/parts'
import type { BookRecord, TiptapDoc } from '../types/book'

const h1 = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] })
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

function layout(book: BookRecord): string {
  return sortChapters(book.chapters)
    .map((ch) => `${ch.title || '·'}:${ch.partId ? book.parts!.findIndex((x) => x.id === ch.partId) : '-'}${ch.kind === 'unnumbered' ? '*' : ''}`)
    .join(' ')
}

async function bookWithTwoParts(): Promise<BookRecord> {
  const text = ['楔子', '很久以前。', '第一册', '第一章 出发', '启程。', '第二章 抵达', '到了。', '第二册', '第三章 回程', '归来。'].join('\n')
  return books.importTextBook(text, '长篇.txt')
}

describe('parts in the book service', () => {
  it('imports volumes, prologues, and stripped ordinals from text', async () => {
    const book = await bookWithTwoParts()
    expect(book.parts).toHaveLength(2)
    expect(book.partWord).toBe('册')
    expect(layout(book)).toBe('楔子:-* 出发:0 抵达:0 回程:1')
    expect(await books.bookPlainChapters(book.id)).toMatchObject([
      { title: '楔子' },
      { title: '第 1 章 出发', part: '第一册' },
      { title: '第 2 章 抵达' },
      { title: '第 3 章 回程', part: '第二册' },
    ])
  })

  it('new and split chapters stay in the same volume', async () => {
    let book = await bookWithTwoParts()
    const [, first, second] = sortChapters(book.chapters)
    book = await books.insertChapter(book.id, second!.id)
    expect(layout(book)).toBe('楔子:-* 出发:0 抵达:0 ·:0 回程:1')

    const doc: TiptapDoc = { type: 'doc', content: [h1('出发'), p('甲'), h1('尾声'), p('乙')] }
    const result = await books.saveDoc(book.id, first!.id, doc, { splitOnH1: true })
    expect(layout(result.book)).toBe('楔子:-* 出发:0 尾声:0* 抵达:0 ·:0 回程:1')
  })

  it('refuses to merge across volumes', async () => {
    const book = await bookWithTwoParts()
    const sorted = sortChapters(book.chapters)
    await expect(books.mergeChapters(book.id, sorted[2]!.id, sorted[3]!.id)).rejects.toThrow('不在同一册')
  })

  it('moves across a volume boundary and starts or dissolves volumes', async () => {
    let book = await bookWithTwoParts()
    const sorted = sortChapters(book.chapters)
    book = await books.moveChapter(book.id, sorted[3]!.id, -1)
    expect(layout(book)).toBe('楔子:-* 出发:0 抵达:0 回程:0')

    const started = await books.startPart(book.id, sorted[2]!.id)
    expect(layout(started.book)).toBe('楔子:-* 出发:0 抵达:1 回程:1')
    book = await books.renamePart(book.id, started.partId, '远行')
    expect(books.chapterHeadingIn(book, sorted[2]!.id)).toBe('第 2 章 抵达')
    expect(book.parts?.map((x) => x.title)).toEqual(['', '远行', ''])

    book = await books.dissolvePart(book.id, started.partId)
    expect(layout(book)).toBe('楔子:-* 出发:0 抵达:0 回程:0')
  })

  it('restores a deleted chapter into a sensible volume', async () => {
    let book = await bookWithTwoParts()
    const target = sortChapters(book.chapters)[3]!
    const dump = await books.snapshotChapter(book.id, target.id)
    book = await books.deleteChapter(book.id, target.id)
    book = await books.dissolvePart(book.id, book.parts![1]!.id)
    book = await books.restoreChapter(dump!)
    expect(layout(book)).toBe('楔子:-* 出发:0 抵达:0 回程:0')
  })
})
