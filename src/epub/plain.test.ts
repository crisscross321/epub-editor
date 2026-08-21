import { describe, expect, it } from 'vitest'
import { chaptersToMarkdown, shouldRenderOuterTitle } from './plain'

describe('shouldRenderOuterTitle', () => {
  it('hides a duplicate leading heading', () => {
    expect(shouldRenderOuterTitle('<h1>第 1 章 序</h1><p>正文</p>', '第 1 章 序')).toBe(false)
  })

  it('keeps the outer title when body has no matching h1', () => {
    expect(shouldRenderOuterTitle('<p>正文</p>', '第 1 章 序')).toBe(true)
  })
})

describe('chaptersToMarkdown', () => {
  it('prefixes each chapter with an ATX heading', () => {
    expect(chaptersToMarkdown([{ title: '序', body: '风起' }])).toBe('# 序\n\n风起')
  })
})
