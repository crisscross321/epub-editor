import { describe, expect, it } from 'vitest'
import { splitImportedText, textToDoc } from './importText'

describe('textToDoc', () => {
  it('turns blank-line paragraphs into nodes', () => {
    const doc = textToDoc('第一段\n\n第二段')
    expect(doc.content).toHaveLength(2)
    expect(doc.content?.[0]?.content?.[0]?.text).toBe('第一段')
  })
})

describe('splitImportedText', () => {
  it('splits markdown files on ATX headings', () => {
    const chapters = splitImportedText('# 序\n风起\n\n# 正篇\n雨落', 'draft.md')
    expect(chapters.map((ch) => ch.title)).toEqual(['序', '正篇'])
  })

  it('splits 第N章 headings', () => {
    const chapters = splitImportedText('第1章 出发\n启程。\n第2章 抵达\n到了。')
    expect(chapters).toHaveLength(2)
    expect(chapters[1]?.title).toBe('第2章 抵达')
  })

  it('keeps a single untitled chapter when there are no headings', () => {
    const chapters = splitImportedText('一整篇散文')
    expect(chapters).toHaveLength(1)
    expect(chapters[0]?.title).toBe('')
  })
})
