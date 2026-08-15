import { describe, expect, it } from 'vitest'
import {
  exportChapterHeading,
  splitDocByH1,
  stripChapterOrdinal,
  withChapterHeading,
  withoutLeadingH1,
} from './headings'
import { replaceAllInDoc } from './replace'
import type { TiptapDoc } from '../types/book'

const sample: TiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '旧名' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '你好世界，世界你好' }] },
  ],
}

describe('chapter heading', () => {
  it('treats chapter title as the only leading h1', () => {
    const exported = withChapterHeading(sample, '开篇')
    expect(exported.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(JSON.stringify(exported.content?.[0])).toContain('开篇')
    expect(JSON.stringify(exported.content?.[0])).not.toContain('旧名')
  })

  it('strips leading h1 for export rewriting', () => {
    const body = withoutLeadingH1(sample)
    expect(body.content?.[0]?.type).toBe('paragraph')
  })
})

describe('stripChapterOrdinal', () => {
  it('drops a leading 第N章 so the stored name does not duplicate the position label', () => {
    expect(stripChapterOrdinal('第1章 夜宴')).toBe('夜宴')
    expect(stripChapterOrdinal('第 1 章 夜宴')).toBe('夜宴')
    expect(stripChapterOrdinal('第一章 夜宴')).toBe('夜宴')
    expect(stripChapterOrdinal('第1章')).toBe('')
    expect(stripChapterOrdinal('夜宴')).toBe('夜宴')
  })
})

describe('exportChapterHeading', () => {
  it('uses the current spine position, not a number stored in the title', () => {
    expect(exportChapterHeading(0, '夜宴')).toBe('第 1 章 夜宴')
    expect(exportChapterHeading(1, '夜宴')).toBe('第 2 章 夜宴')
    expect(exportChapterHeading(0, '')).toBe('第 1 章')
    expect(exportChapterHeading(2, '第 3 章')).toBe('第 3 章')
  })
})

describe('splitDocByH1', () => {
  it('keeps a leading h1 as this chapter and splits later h1s into new chapters', () => {
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开篇' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '前文' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '第2章 夜宴' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '后文' }] },
      ],
    }
    const parts = splitDocByH1(doc, '旧章名')
    expect(parts).toHaveLength(2)
    expect(parts[0]?.title).toBe('开篇')
    expect(JSON.stringify(parts[0]?.doc)).toContain('前文')
    expect(JSON.stringify(parts[0]?.doc)).not.toContain('后文')
    expect(parts[1]?.title).toBe('夜宴')
    expect(JSON.stringify(parts[1]?.doc)).toContain('后文')
  })

  it('splits when the first h1 is in the middle of the current chapter', () => {
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '前文' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '夜宴' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '后文' }] },
      ],
    }
    const parts = splitDocByH1(doc, '旧章名')
    expect(parts).toHaveLength(2)
    expect(parts[0]?.title).toBe('旧章名')
    expect(parts[1]?.title).toBe('夜宴')
  })
})

describe('replaceAllInDoc', () => {
  it('replaces every occurrence in text nodes', () => {
    const { doc, count } = replaceAllInDoc(withoutLeadingH1(sample), '世界', '人间')
    expect(count).toBe(2)
    expect(JSON.stringify(doc)).toContain('人间')
    expect(JSON.stringify(doc)).not.toContain('世界')
  })
})
