import { describe, expect, it } from 'vitest'
import { htmlFromPaste } from './paste'

describe('htmlFromPaste', () => {
  it('keeps bold and lists from html and drops inline color spans', () => {
    const html = htmlFromPaste(
      '<p><span style="color:red">你好</span> <b>世界</b></p><ul><li>一项</li></ul>',
      '你好 世界',
    )
    expect(html).toContain('世界')
    expect(html).toContain('<strong>')
    expect(html.toLowerCase()).toContain('<li>')
    expect(html).not.toContain('color:red')
  })

  it('turns plain text line breaks into paragraphs', () => {
    const html = htmlFromPaste(undefined, '上句\n下句')
    expect(html).toContain('上句')
    expect(html).toContain('下句')
    expect(html.match(/<p/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
