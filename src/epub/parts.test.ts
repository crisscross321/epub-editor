import { describe, expect, it } from 'vitest'
import type { BookPart, BookRecord, ChapterIndex } from '../types/book'
import {
  bookOutline,
  canMergeChapters,
  canMoveChapter,
  chineseNumber,
  dissolvePart,
  inferKind,
  insertChapters,
  moveChapterStep,
  moveChapterToIndex,
  normalizeParts,
  parseChapterTitle,
  parseOrdinal,
  parsePartTitle,
  resolveOrdinals,
  sortChapters,
  startPartAt,
  structureChapters,
} from './parts'

type Book = Pick<BookRecord, 'chapters' | 'parts' | 'partWord' | 'chapterNumbering'>

function ch(id: string, extra: Partial<ChapterIndex> = {}, spineIndex = 0): ChapterIndex {
  return { id, href: `${id}.xhtml`, title: id, spineIndex, state: 'simplified', ...extra }
}

function book(list: Array<[string, Partial<ChapterIndex>?]>, parts: BookPart[] = [], extra: Partial<Book> = {}): Book {
  return { chapters: list.map(([id, e], i) => ch(id, e, i)), parts, ...extra }
}

const P1 = { id: 'p1', title: '风起' }
const P2 = { id: 'p2', title: '' }
const P3 = { id: 'p3', title: '雨落' }

function layout(b: Book): string {
  return sortChapters(b.chapters)
    .map((c) => `${c.id}:${c.partId ?? '-'}`)
    .join(' ')
}

describe('numerals', () => {
  it('writes Chinese numbers', () => {
    expect([1, 10, 11, 20, 21, 100, 101, 110, 1010].map(chineseNumber)).toEqual([
      '一', '十', '十一', '二十', '二十一', '一百', '一百零一', '一百一十', '一千零一十',
    ])
  })

  it('reads Arabic, full-width, and Chinese ordinals', () => {
    expect(parseOrdinal('12')).toBe(12)
    expect(parseOrdinal('１２')).toBe(12)
    expect(parseOrdinal('十二')).toBe(12)
    expect(parseOrdinal('一百零一')).toBe(101)
    expect(parseOrdinal('两')).toBe(2)
    expect(parseOrdinal('二〇')).toBe(20)
    expect(parseOrdinal('甲')).toBeUndefined()
  })
})

describe('title recognition', () => {
  it('recognises part titles in several forms', () => {
    expect(parsePartTitle('第一卷 风起')).toEqual({ number: 1, word: '卷', rest: '风起' })
    expect(parsePartTitle('第二册：雨落')).toEqual({ number: 2, word: '册', rest: '雨落' })
    expect(parsePartTitle('第三部分')).toEqual({ number: 3, word: '部分', rest: '' })
    expect(parsePartTitle('卷二 远行')).toEqual({ number: 2, word: '卷', rest: '远行' })
    expect(parsePartTitle('第一卷 第三章 夜宴')?.rest).toBe('第三章 夜宴')
    expect(parsePartTitle('第一章 夜宴')).toBeUndefined()
  })

  it('recognises chapter ordinals', () => {
    expect(parseChapterTitle('第十二章 夜宴')).toEqual({ number: 12, rest: '夜宴' })
    expect(parseChapterTitle('第 3 章')).toEqual({ number: 3, rest: '' })
    expect(parseChapterTitle('夜宴')).toBeUndefined()
  })

  it('infers unnumbered front and back matter', () => {
    for (const t of ['序章', '楔子', '前言', '序', '尾声', '后记', '番外一 旧梦', '间章', 'Prologue', '版权信息', '第一卷 风起']) {
      expect(inferKind(t)).toBe('unnumbered')
    }
    for (const t of ['夜宴', '第一章 序曲', '序曲', '', '第一卷 第二章 夜宴']) expect(inferKind(t)).toBe('chapter')
  })
})

describe('bookOutline', () => {
  it('numbers only real chapters and leaves old books unchanged', () => {
    const plain = bookOutline(book([['a'], ['b', { title: '白塔' }]]))
    expect(plain.headings.get('a')).toBe('第 1 章 a')
    expect(plain.headings.get('b')).toBe('第 2 章 白塔')
    expect(plain.groups).toHaveLength(1)

    const withPrologue = bookOutline(book([['x', { title: '楔子', kind: 'unnumbered' }], ['a'], ['b']]))
    expect(withPrologue.headings.get('x')).toBe('楔子')
    expect(withPrologue.headings.get('a')).toBe('第 1 章 a')
    expect(withPrologue.headings.get('b')).toBe('第 2 章 b')
  })

  it('groups chapters by part with continuous numbering by default', () => {
    const outline = bookOutline(
      book([['x', { kind: 'unnumbered', title: '序章' }], ['a', { partId: 'p1' }], ['b', { partId: 'p1' }], ['c', { partId: 'p2' }]], [P1, P2]),
    )
    expect(outline.groups.map((g) => g.heading)).toEqual(['', '第一册 风起', '第二册'])
    expect(outline.groups.map((g) => g.chapters.map((c) => c.id))).toEqual([['x'], ['a', 'b'], ['c']])
    expect(outline.groups.map((g) => g.range)).toEqual([undefined, [1, 2], [3, 3]])
    expect(outline.headings.get('c')).toBe('第 3 章 c')
  })

  it('restarts numbering per part and honours the part word', () => {
    const outline = bookOutline(
      book([['a', { partId: 'p1' }], ['b', { partId: 'p1' }], ['c', { partId: 'p2' }]], [P1, P2], {
        chapterNumbering: 'perPart',
        partWord: '卷',
      }),
    )
    expect(outline.groups.map((g) => g.heading)).toEqual(['第一卷 风起', '第二卷'])
    expect(outline.headings.get('c')).toBe('第 1 章 c')
  })

  it('keeps empty parts as empty groups', () => {
    const outline = bookOutline(book([['a', { partId: 'p1' }]], [P1, P2]))
    expect(outline.groups.map((g) => g.chapters.length)).toEqual([1, 0])
  })

  it('shows 未命名 for untitled unnumbered entries', () => {
    expect(bookOutline(book([['a', { kind: 'unnumbered', title: '' }]])).headings.get('a')).toBe('未命名')
  })
})

describe('normalizeParts', () => {
  it('repairs out-of-order part assignments', () => {
    const b = book([['a', { partId: 'p2' }], ['b', { partId: 'p1' }], ['c'], ['d', { partId: 'p2' }]], [P1, P2])
    expect(layout(normalizeParts(b))).toBe('a:p2 b:p2 c:p2 d:p2')
  })

  it('drops references to missing parts', () => {
    expect(layout(normalizeParts(book([['a', { partId: 'gone' }]])))).toBe('a:-')
  })

  it('returns the same object when nothing needs fixing', () => {
    const b = book([['a'], ['b', { partId: 'p1' }]], [P1])
    expect(normalizeParts(b)).toBe(b)
  })
})

describe('chapter operations', () => {
  const twoParts = () =>
    book([['x'], ['a', { partId: 'p1' }], ['b', { partId: 'p1' }], ['c', { partId: 'p2' }], ['d', { partId: 'p2' }]], [P1, P2])

  it('new chapters inherit the part of the chapter they follow', () => {
    const next = insertChapters(twoParts(), 'b', [ch('n')])
    expect(layout(next)).toBe('x:- a:p1 b:p1 n:p1 c:p2 d:p2')
    expect(layout(insertChapters(twoParts(), '', [ch('m')]))).toBe('x:- a:p1 b:p1 c:p2 d:p2 m:p2')
  })

  it('swaps within a part', () => {
    expect(layout(moveChapterStep(twoParts(), 'a', 1))).toBe('x:- b:p1 a:p1 c:p2 d:p2')
  })

  it('crosses a part boundary without swapping', () => {
    expect(layout(moveChapterStep(twoParts(), 'c', -1))).toBe('x:- a:p1 b:p1 c:p1 d:p2')
    expect(layout(moveChapterStep(twoParts(), 'b', 1))).toBe('x:- a:p1 b:p2 c:p2 d:p2')
    expect(layout(moveChapterStep(twoParts(), 'a', -1))).toBe('x:- a:- b:p1 c:p2 d:p2')
  })

  it('walks into empty parts one step at a time', () => {
    const b = book([['a', { partId: 'p1' }], ['b', { partId: 'p3' }]], [P1, P2, P3])
    const once = moveChapterStep(b, 'b', -1)
    expect(layout(once)).toBe('a:p1 b:p2')
    expect(layout(moveChapterStep(once, 'b', -1))).toBe('a:p1 b:p1')
  })

  it('only disables moves at the true ends', () => {
    const b = twoParts()
    expect(canMoveChapter(b, 'x', -1)).toBe(false)
    expect(canMoveChapter(b, 'a', -1)).toBe(true)
    expect(canMoveChapter(b, 'd', 1)).toBe(false)
    expect(canMoveChapter(book([['a'], ['b']]), 'b', 1)).toBe(false)
    expect(canMoveChapter(book([['a', { partId: 'p1' }]], [P1, P2]), 'a', 1)).toBe(true)
  })

  it('move-to-position inherits the part found at the target', () => {
    expect(layout(moveChapterToIndex(twoParts(), 'd', 1))).toBe('x:- d:p1 a:p1 b:p1 c:p2')
    expect(layout(moveChapterToIndex(twoParts(), 'a', 99))).toBe('x:- b:p1 c:p2 d:p2 a:p2')
    expect(layout(moveChapterToIndex(twoParts(), 'c', 0))).toBe('c:- x:- a:p1 b:p1 d:p2')
  })

  it('merges only within the same part and kind', () => {
    const [x, a, b, c] = sortChapters(twoParts().chapters)
    expect(canMergeChapters(a!, b!)).toBe(true)
    expect(canMergeChapters(b!, c!)).toBe(false)
    expect(canMergeChapters(x!, a!)).toBe(false)
    expect(canMergeChapters(a!, { ...b!, kind: 'unnumbered' })).toBe(false)
  })
})

describe('part operations', () => {
  it('starts a new part from a chapter, taking the rest of its part', () => {
    const b = book([['a', { partId: 'p1' }], ['b', { partId: 'p1' }], ['c', { partId: 'p1' }], ['d', { partId: 'p2' }]], [P1, P2])
    const next = startPartAt(b, 'b', P3)
    expect(next.parts?.map((p) => p.id)).toEqual(['p1', 'p3', 'p2'])
    expect(layout(next)).toBe('a:p1 b:p3 c:p3 d:p2')
  })

  it('starts the first part from an ungrouped chapter', () => {
    const next = startPartAt(book([['x'], ['a'], ['b']]), 'a', P1)
    expect(layout(next)).toBe('x:- a:p1 b:p1')
  })

  it('dissolving merges into the previous part, or ungroups the first part', () => {
    const b = book([['a', { partId: 'p1' }], ['b', { partId: 'p2' }]], [P1, P2])
    expect(layout(dissolvePart(b, 'p2'))).toBe('a:p1 b:p1')
    const first = dissolvePart(b, 'p1')
    expect(layout(first)).toBe('a:- b:p2')
    expect(first.parts).toEqual([P2])
  })
})

describe('import structuring', () => {
  let n = 0
  const id = () => `part-${++n}`

  it('strips ordinals that match the computed numbering', () => {
    const { items } = resolveOrdinals(
      [{ title: '楔子', kind: 'unnumbered' as const }, { title: '第一章 出发' }, { title: '第二章' }, { title: '第九章 错位' }],
      false,
    )
    expect(items.map((i) => i.title)).toEqual(['楔子', '出发', '', '第九章 错位'])
  })

  it('detects per-part numbering', () => {
    const result = resolveOrdinals(
      [{ title: '第一章 甲', partId: 'p1' }, { title: '第二章 乙', partId: 'p1' }, { title: '第一章 丙', partId: 'p2' }],
      true,
    )
    expect(result.numbering).toBe('perPart')
    expect(result.items.map((i) => i.title)).toEqual(['甲', '乙', '丙'])
  })

  it('builds parts from nested navigation groups', () => {
    n = 0
    const chapters = [ch('cover', { title: '封面' }, 0), ch('v1', { title: '第一卷 风起' }, 1), ch('c1', { title: '第一章 出发' }, 2), ch('c2', { title: '第二章 抵达' }, 3), ch('c3', { title: '第三章 回程' }, 4)]
    const result = structureChapters(
      chapters,
      [
        { title: '第一卷 风起', ownHref: 'v1.xhtml', hrefs: ['c1.xhtml', 'c2.xhtml'] },
        { title: '第二卷', hrefs: ['c3.xhtml'] },
      ],
      id,
    )
    expect(result.parts).toEqual([{ id: 'part-1', title: '风起' }, { id: 'part-2', title: '' }])
    expect(result.partWord).toBe('卷')
    expect(result.chapters.map((c) => [c.id, c.kind ?? 'chapter', c.partId ?? '-', c.title])).toEqual([
      ['cover', 'unnumbered', '-', '封面'],
      ['v1', 'unnumbered', 'part-1', '第一卷 风起'],
      ['c1', 'chapter', 'part-1', '出发'],
      ['c2', 'chapter', 'part-1', '抵达'],
      ['c3', 'chapter', 'part-2', '回程'],
    ])
  })

  it('ignores nav children that only point inside the same chapter', () => {
    const result = structureChapters(
      [ch('a', { title: '第一章 甲' }, 0)],
      [{ title: '第一章 甲', ownHref: 'a.xhtml', hrefs: ['a.xhtml'] }],
      id,
    )
    expect(result.parts).toEqual([])
    expect(result.chapters[0]?.kind).toBeUndefined()
  })

  it('builds parts from flat titles', () => {
    n = 0
    const result = structureChapters(
      [
        ch('a', { title: '第一卷 第一章 出发' }, 0),
        ch('b', { title: '第一卷 第二章 抵达' }, 1),
        ch('c', { title: '第二卷 第一章 回程' }, 2),
      ],
      [],
      id,
    )
    expect(result.parts.map((p) => p.id)).toEqual(['part-1', 'part-2'])
    expect(result.chapterNumbering).toBe('perPart')
    expect(result.chapters.map((c) => `${c.title}@${c.partId}`)).toEqual(['出发@part-1', '抵达@part-1', '回程@part-2'])
  })
})
