import { describe, expect, it } from 'vitest'
import type { TiptapDoc, TiptapNode } from '../types/book'
import { docSearchText } from './newlines'
import { replaceAllInDoc } from './replace'

const text = (value: string, marks?: { type: string }[]): TiptapNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
})

const para = (...content: TiptapNode[]): TiptapNode => ({
  type: 'paragraph',
  ...(content.length ? { content } : {}),
})

const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content })

describe('replaceAllInDoc wildcards', () => {
  it('treats ^p as ordinary text while wildcards are off', () => {
    const source = doc(para(text('第一段')), para(text('第二段')))
    const { count, doc: next } = replaceAllInDoc(source, '^p', '', { wildcards: false })
    expect(count).toBe(0)
    expect(next).toEqual(source)
  })

  it('joins paragraphs when a line break is replaced with nothing', () => {
    const source = doc(para(text('第一段')), para(text('第二段')))
    const { count, doc: next } = replaceAllInDoc(source, '^p', '', { wildcards: true })
    expect(count).toBe(1)
    expect(docSearchText(next)).toBe('第一段第二段')
  })

  it('turns one blank line into a single break', () => {
    const blank = doc(
      para(text('第一段')),
      { type: 'paragraph', content: [{ type: 'hardBreak' }] },
      para(text('第二段')),
    )
    expect(docSearchText(blank)).toBe('第一段\n\n第二段')
    const { count, doc: next } = replaceAllInDoc(blank, '^p^p', '^p', { wildcards: true })
    expect(count).toBe(1)
    expect(docSearchText(next)).toBe('第一段\n第二段')
  })

  it('matches a hard break inside a paragraph', () => {
    const source = doc(
      para(text('上'), { type: 'hardBreak' }, text('下')),
      para(text('再一段')),
    )
    expect(docSearchText(source)).toBe('上\n下\n再一段')
    const { doc: next } = replaceAllInDoc(source, '上^p下', '上下', { wildcards: true })
    expect(docSearchText(next)).toBe('上下\n再一段')
  })

  it('splits a paragraph when the replacement contains a line break', () => {
    const source = doc(para(text('甲乙丙')))
    const { doc: next } = replaceAllInDoc(source, '乙', '^p', { wildcards: true })
    expect(docSearchText(next)).toBe('甲\n丙')
  })

  it('leaves an untouched heading in place', () => {
    const source = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('白塔')] },
      para(text('第一段')),
      { type: 'paragraph', content: [{ type: 'hardBreak' }] },
      para(text('第二段')),
    )
    const { doc: next } = replaceAllInDoc(source, '^p^p', '^p', { wildcards: true })
    expect(next.content?.[0]).toEqual(source.content?.[0])
    expect(docSearchText(next)).toBe('白塔\n第一段\n第二段')
  })

  it('keeps marks on text that was not replaced', () => {
    const source = doc(para(text('甲', [{ type: 'bold' }])), para(text('乙')))
    const { doc: next } = replaceAllInDoc(source, '^p', '', { wildcards: true })
    expect(docSearchText(next)).toBe('甲乙')
    expect(next.content?.[0]?.content?.[0]).toMatchObject({ text: '甲', marks: [{ type: 'bold' }] })
    expect(next.content?.[0]?.content?.[1]).toMatchObject({ text: '乙' })
  })

  it('finds a literal ^p written as ^^p', () => {
    const source = doc(para(text('见^p处')))
    const { count, doc: next } = replaceAllInDoc(source, '^^p', '星', { wildcards: true })
    expect(count).toBe(1)
    expect(docSearchText(next)).toBe('见星处')
  })

  it('replaces one match at the cursor and leaves the earlier break', () => {
    const source = doc(para(text('甲')), para(text('乙')), para(text('丙')))
    const { count, doc: next } = replaceAllInDoc(source, '^p', 'X', { wildcards: true, from: 2, once: true })
    expect(count).toBe(1)
    expect(docSearchText(next)).toBe('甲\n乙X丙')
  })

  it('does not treat an image as a blank line', () => {
    const image: TiptapNode = { type: 'image', attrs: { src: 'a.jpg', alt: '图' } }
    const source = doc(para(text('前文')), para(image), para(text('后文')))
    const { count, doc: next } = replaceAllInDoc(source, '^p^p', '^p', { wildcards: true })
    expect(count).toBe(0)
    expect(next).toEqual(source)
  })
})
