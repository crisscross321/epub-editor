import { describe, expect, it } from 'vitest'
import { parseHtml } from '../epub/xml'
import { isBlankBlock, markBlankBlocks, tightenBlankHtml } from './blankLines'

describe('blank lines', () => {
  it('treats empty paragraphs, br-only blocks, and nbsp-only blocks as blank', () => {
    const doc = parseHtml('<p></p><p><br></p><p>&nbsp;</p><p>正文</p><div><br></div>')
    const [empty, brOnly, nbsp, text, div] = Array.from(doc.body.querySelectorAll('p, div'))
    expect(isBlankBlock(empty!)).toBe(true)
    expect(isBlankBlock(brOnly!)).toBe(true)
    expect(isBlankBlock(nbsp!)).toBe(true)
    expect(isBlankBlock(text!)).toBe(false)
    expect(isBlankBlock(div!)).toBe(true)
  })

  it('marks consecutive br tags as extra breaks', () => {
    const doc = parseHtml('<p>上<br><br>下</p>')
    markBlankBlocks(doc.body)
    const brs = Array.from(doc.querySelectorAll('br'))
    expect(brs[0]?.classList.contains('is-extra-break')).toBe(false)
    expect(brs[1]?.classList.contains('is-extra-break')).toBe(true)
  })

  it('adds is-blank in serialized preview html', () => {
    const html = tightenBlankHtml('<p>一段</p><p><br></p><p>下一段</p>')
    expect(html).toContain('is-blank')
    expect(html).toContain('一段')
  })
})
