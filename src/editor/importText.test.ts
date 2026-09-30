import { describe, expect, it } from 'vitest'
import { splitImportedText, structureImportedText, textToDoc } from './importText'

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
    expect(chapters[1]?.title).toBe('抵达')
  })

  it('keeps ordinals that do not match the computed numbering', () => {
    const chapters = splitImportedText('第1章 出发\n启程。\n第5章 跳跃\n到了。')
    expect(chapters.map((ch) => ch.title)).toEqual(['出发', '第5章 跳跃'])
  })

  it('marks prologues and untitled leading text as unnumbered', () => {
    const chapters = splitImportedText('作者的一点说明。\n楔子\n很久以前。\n第一章 出发\n启程。\n番外 旧梦\n后来。')
    expect(chapters.map((ch) => [ch.title, ch.kind])).toEqual([
      ['前言', 'unnumbered'],
      ['楔子', 'unnumbered'],
      ['出发', 'chapter'],
      ['番外 旧梦', 'unnumbered'],
    ])
    const md = splitImportedText('# 楔子\n很久以前\n\n# 出发\n启程', 'a.md')
    expect(md.map((ch) => ch.kind)).toEqual(['unnumbered', 'chapter'])
  })
})

describe('structureImportedText', () => {
  it('opens a part at each volume line and keeps its intro text', () => {
    const result = structureImportedText(
      ['第一卷 风起', '卷首的话。', '第一章 出发', '启程。', '第二章 抵达', '到了。', '第二卷 雨落', '第一章 回程', '归来。'].join('\n'),
    )
    expect(result.parts).toEqual([{ title: '风起' }, { title: '雨落' }])
    expect(result.partWord).toBe('卷')
    expect(result.chapterNumbering).toBe('perPart')
    expect(result.chapters.map((ch) => [ch.title, ch.kind, ch.part])).toEqual([
      ['引言', 'unnumbered', 0],
      ['出发', 'chapter', 0],
      ['抵达', 'chapter', 0],
      ['回程', 'chapter', 1],
    ])
  })

  it('reads volume and chapter written on one line', () => {
    const result = structureImportedText('第一册 第一章 出发\n启程。\n第一册 第二章 抵达\n到了。\n第二册 第三章 回程\n归来。')
    expect(result.parts).toEqual([{ title: '' }, { title: '' }])
    expect(result.chapterNumbering).toBe('continuous')
    expect(result.chapters.map((ch) => [ch.title, ch.part])).toEqual([
      ['出发', 0],
      ['抵达', 0],
      ['回程', 1],
    ])
  })

  it('does not treat sentences that start like a volume as headings', () => {
    const result = structureImportedText('第一章 出发\n第一部电影让我落泪。\n第二章 抵达\n到了。')
    expect(result.parts).toEqual([])
    expect(result.chapters).toHaveLength(2)
  })

  it('keeps a single untitled chapter when there are no headings', () => {
    const chapters = splitImportedText('一整篇散文')
    expect(chapters).toHaveLength(1)
    expect(chapters[0]?.title).toBe('')
  })
})
