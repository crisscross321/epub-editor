import { describe, expect, it } from 'vitest'
import { simplifyXhtml } from './simplify'

describe('simplifyXhtml', () => {
  it('maps headings, paragraphs, marks and lists', () => {
    const doc = simplifyXhtml(
      `<html><body>
        <h1>标题</h1>
        <h2>二级</h2>
        <p>一段<strong>粗</strong>和<em>斜</em>还有<b>B</b><i>I</i></p>
        <ul><li>苹果</li></ul>
        <ol><li>第一</li></ol>
      </body></html>`,
      (src) => src,
    )
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(doc.content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    const para = doc.content?.[2]
    expect(para?.type).toBe('paragraph')
    const texts = JSON.stringify(para)
    expect(texts).toContain('粗')
    expect(texts).toContain('bold')
    expect(texts).toContain('italic')
    expect(doc.content?.[3]?.type).toBe('bulletList')
    expect(doc.content?.[4]?.type).toBe('orderedList')
  })

  it('unwraps links to text only', () => {
    const doc = simplifyXhtml('<p>前往<a href="https://example.com">站点</a></p>', (src) => src)
    const blob = JSON.stringify(doc)
    expect(blob).toContain('站点')
    expect(blob).not.toContain('https://example.com')
  })

  it('turns table cells into paragraphs', () => {
    const doc = simplifyXhtml('<table><tr><td>甲</td><td>乙</td></tr></table>', (src) => src)
    const paras = doc.content?.filter((n) => n.type === 'paragraph') ?? []
    expect(JSON.stringify(paras)).toContain('甲')
    expect(JSON.stringify(paras)).toContain('乙')
  })

  it('drops script tags', () => {
    const doc = simplifyXhtml('<p>可见</p><script>alert(1)</script>', (src) => src)
    expect(JSON.stringify(doc)).toContain('可见')
    expect(JSON.stringify(doc)).not.toContain('alert')
  })

  it('resolves image src through the callback', () => {
    const doc = simplifyXhtml(
      '<p><img src="../images/cover.png" alt="图"/></p>',
      (src) => `resolved:${src}`,
    )
    const json = JSON.stringify(doc)
    expect(json).toContain('resolved:../images/cover.png')
  })

  it('keeps image id, width and alignment from data attributes', () => {
    const doc = simplifyXhtml(
      '<p><img src="a.jpg" alt="图" data-image-id="img-a" data-width="40" data-align="left"/></p>',
      (src) => src,
    )
    const image = doc.content?.[0]?.content?.[0]
    expect(image).toMatchObject({
      type: 'image',
      attrs: { src: 'a.jpg', alt: '图', imageId: 'img-a', width: 40, align: 'left' },
    })
  })
})
