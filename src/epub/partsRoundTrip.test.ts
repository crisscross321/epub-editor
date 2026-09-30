import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { BookRecord, ParsedEpub } from '../types/book'
import { toArrayBuffer } from './bytes'
import { fixtureEpub3 } from './fixtures'
import { parseEpub } from './parse'
import { packEpub } from './serialize'

const chapters = [
  { id: 'pro', title: '楔子', body: '<h1>楔子</h1><p>很久以前</p>' },
  { id: 'v1', title: '第一卷 风起', body: '<h1>第一卷 风起</h1>' },
  { id: 'c1', title: '第一章 出发', body: '<h1>第一章 出发</h1><p>甲</p>' },
  { id: 'c2', title: '第二章 抵达', body: '<h1>第二章 抵达</h1><p>乙</p>' },
  { id: 'c3', title: '第一章 回程', body: '<h1>第一章 回程</h1><p>丙</p>' },
]

const nestedNav = [
  '<li><a href="text/pro.xhtml">楔子</a></li>',
  '<li><a href="text/v1.xhtml">第一卷 风起</a><ol>',
  '<li><a href="text/c1.xhtml">第一章 出发</a></li>',
  '<li><a href="text/c2.xhtml">第二章 抵达</a></li>',
  '</ol></li>',
  '<li><span>第二卷 雨落</span><ol>',
  '<li><a href="text/c3.xhtml">第一章 回程</a><ol><li><a href="text/c3.xhtml#h2-1">小节</a></li></ol></li>',
  '</ol></li>',
].join('\n')

function toBook(parsed: ParsedEpub, id: string): BookRecord {
  return {
    id,
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    updatedAt: '2026-01-01T00:00:00.000Z',
    opfHref: parsed.opfHref,
    chapters: parsed.chapters,
    parts: parsed.parts,
    partWord: parsed.partWord,
    chapterNumbering: parsed.chapterNumbering,
  }
}

async function navOf(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('OEBPS/nav.xhtml')!.async('string')
}

describe('parts through import and export', () => {
  it('reads parts, kinds, and per-part numbering from a nested EPUB 3 nav', async () => {
    const parsed = await parseEpub(toArrayBuffer(await fixtureEpub3({ chapters, navLis: nestedNav })))
    expect(parsed.parts?.map((p) => p.title)).toEqual(['风起', '雨落'])
    expect(parsed.partWord).toBe('卷')
    expect(parsed.chapterNumbering).toBe('perPart')
    expect(parsed.chapters.map((c) => [c.id, c.kind ?? 'chapter', c.partId ?? '-', c.title])).toEqual([
      ['pro', 'unnumbered', '-', '楔子'],
      ['v1', 'unnumbered', 'part-1', '第一卷 风起'],
      ['c1', 'chapter', 'part-1', '出发'],
      ['c2', 'chapter', 'part-1', '抵达'],
      ['c3', 'chapter', 'part-2', '回程'],
    ])
  })

  it('exports a nested nav with part labels and survives a round trip', async () => {
    const parsed = await parseEpub(toArrayBuffer(await fixtureEpub3({ chapters, navLis: nestedNav })))
    const packed = await packEpub({ book: toBook(parsed, 'rt'), entries: parsed.entries, simplified: new Map() })
    const nav = await navOf(packed)
    expect(nav).toContain('<li><span>第一卷 风起</span><ol>')
    expect(nav).toContain('<li><span>第二卷 雨落</span><ol>')
    expect(nav).toContain('>第 1 章 回程<')
    expect(nav.indexOf('楔子')).toBeLessThan(nav.indexOf('第一卷 风起'))

    const again = await parseEpub(toArrayBuffer(packed))
    expect(again.parts?.map((p) => p.title)).toEqual(['风起', '雨落'])
    expect(again.chapters.map((c) => [c.id, c.partId ?? '-', c.title])).toEqual([
      ['pro', '-', '楔子'],
      ['v1', 'part-1', '第一卷 风起'],
      ['c1', 'part-1', '出发'],
      ['c2', 'part-1', '抵达'],
      ['c3', 'part-2', '回程'],
    ])
  })

  it('skips empty parts in the nav and leaves part-less books flat', async () => {
    const parsed = await parseEpub(toArrayBuffer(await fixtureEpub3()))
    const flat = await navOf(await packEpub({ book: toBook(parsed, 'flat'), entries: parsed.entries, simplified: new Map() }))
    expect(flat).not.toContain('<span>')

    const book = toBook(parsed, 'empty')
    book.parts = [{ id: 'p1', title: '' }, { id: 'p2', title: '空' }]
    book.chapters = book.chapters.map((c) => ({ ...c, partId: 'p1' }))
    const nav = await navOf(await packEpub({ book, entries: parsed.entries, simplified: new Map() }))
    expect(nav).toContain('<span>第一册</span>')
    expect(nav).not.toContain('空')
  })
})
