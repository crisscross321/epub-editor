import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../storage/settings'
import type { BookRecord } from '../types/book'
import { packBackup, unpackBackup } from './backup'

const book: BookRecord = {
  id: 'b1',
  title: '边城',
  author: '沈从文',
  language: 'zh-CN',
  updatedAt: '2026-01-01T00:00:00.000Z',
  opfHref: 'OEBPS/content.opf',
  chapters: [{ id: 'ch1', href: 'OEBPS/text/ch1.xhtml', title: '茶峒', spineIndex: 0, state: 'simplified' }],
}

describe('shelf backup zip', () => {
  it('round-trips books, docs, blobs, and settings', async () => {
    const packed = await packBackup({
      version: 1,
      exportedAt: '2026-09-01T00:00:00.000Z',
      settings: { ...defaultSettings, theme: 'night' },
      books: [
        {
          book,
          entries: [{ path: 'OEBPS/text/ch1.xhtml', data: new Uint8Array([1, 2, 3]) }],
          docs: [{ chapterId: 'ch1', doc: { type: 'doc', content: [{ type: 'paragraph' }] } }],
          blobs: [{ id: 'cover', data: new Uint8Array([9]), mime: 'image/jpeg' }],
          annotations: [
            {
              id: 'n1',
              bookId: 'b1',
              chapterId: 'ch1',
              kind: 'note',
              text: '摘',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    })
    const unpacked = await unpackBackup(packed)
    expect(unpacked.version).toBe(1)
    expect(unpacked.settings.theme).toBe('night')
    expect(unpacked.books[0]?.book.title).toBe('边城')
    expect([...unpacked.books[0]!.entries[0]!.data]).toEqual([1, 2, 3])
    expect([...unpacked.books[0]!.blobs[0]!.data]).toEqual([9])
    expect(unpacked.books[0]?.annotations[0]?.text).toBe('摘')
    expect(unpacked.books[0]?.docs[0]?.chapterId).toBe('ch1')
  })

  it('rejects a zip that is not a 素笺 backup', async () => {
    await expect(unpackBackup(new Uint8Array([0, 1, 2, 3, 4]))).rejects.toThrow(/不是素笺书架备份/)
  })
})
