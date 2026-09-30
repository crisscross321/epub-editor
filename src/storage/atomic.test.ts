import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as db from './idb'
import * as books from '../app/bookService'
import type { TiptapDoc } from '../types/book'

const textDoc = (text: string): TiptapDoc => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] },
  { type: 'paragraph', content: [{ type: 'text', text: '测试正文' }] },
] })

describe('atomic content and progress persistence', () => {
  it('concurrent progress updates cannot overwrite edited chapter metadata', async () => {
    const book = await books.createBook()
    await Promise.all([
      books.saveDoc(book.id, 'ch1', textDoc('最新标题')),
      books.saveProgress(book.id, 'ch1', 0.65),
    ])
    const saved = await books.getBook(book.id)
    expect(saved.chapters[0].title).toBe('最新标题')
    expect(saved.readOffset).toBe(0.65)
    expect(await books.getDoc(book.id, 'ch1')).toEqual(textDoc('最新标题'))
  })

  it('splitting commits all new documents and the index together', async () => {
    const book = await books.createBook()
    const doc: TiptapDoc = { type: 'doc', content: [...textDoc('第一章').content!, ...textDoc('第二章').content!] }
    const result = await books.saveDoc(book.id, 'ch1', doc, { splitOnH1: true })
    expect(result.book.chapters).toHaveLength(2)
    for (const chapter of result.book.chapters) expect(await db.getDoc(book.id, chapter.id)).toBeDefined()
  })

  it('queues a whole-book replace after pending saves and updates titles', async () => {
    const book = await books.createBook()
    await Promise.all([
      books.saveDoc(book.id, 'ch1', textDoc('旧标题')),
      books.replaceAllInBook(book.id, '旧标题', '新标题'),
    ])
    expect((await books.getBook(book.id)).chapters[0].title).toBe('新标题')
    expect(await books.getDoc(book.id, 'ch1')).toEqual(textDoc('新标题'))
  })

  it('rolls back document writes when structured cloning fails', async () => {
    const book = await books.createBook()
    const original = await db.getDoc(book.id, 'ch1')
    await expect(db.updateBookWithDocs(book.id, b => ({ ...b, title: '不应提交' }), [
      { chapterId: 'ch1', doc: textDoc('不应提交') },
      { chapterId: 'bad', doc: { type: 'doc', bad: () => {} } as unknown as TiptapDoc },
    ])).rejects.toThrow()
    expect((await books.getBook(book.id)).title).toBe(book.title)
    expect(await db.getDoc(book.id, 'ch1')).toEqual(original)
  })
})
