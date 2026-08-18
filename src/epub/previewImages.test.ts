import { describe, expect, it } from 'vitest'
import { bytesToDataUrl } from './bytes'
import { inlineRelativeImages } from './previewImages'

describe('inlineRelativeImages', () => {
  it('replaces relative img src with a data URL from the chapter folder', async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const files = new Map([['OEBPS/images/a.png', png]])
    const html = await inlineRelativeImages(
      '<html><body><img src="../images/a.png" alt="图"/></body></html>',
      'OEBPS/text/ch1.xhtml',
      async (path) => files.get(path),
    )
    expect(html).toContain(`src="${bytesToDataUrl(png, 'image/png')}"`)
    expect(html).not.toContain('../images/a.png')
  })

  it('leaves missing images and already-absolute sources alone', async () => {
    const html = await inlineRelativeImages(
      '<html><body><img src="../images/missing.jpg"/><img src="https://example.com/a.png"/></body></html>',
      'OEBPS/text/ch1.xhtml',
      async () => undefined,
    )
    expect(html).toContain('../images/missing.jpg')
    expect(html).toContain('https://example.com/a.png')
  })
})
