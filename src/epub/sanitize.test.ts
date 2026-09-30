import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('untrusted EPUB preview', () => {
  it('removes active URLs, event handlers, forms and escaping styles', () => {
    const html = sanitizeHtml('<a href="java\nscript:alert(1)" onclick="alert(1)">危险</a><form action="/delete"><input autofocus></form><p style="position:fixed;inset:0">正文</p><img src="https://tracker.test/pixel">')
    expect(html).not.toMatch(/javascript|onclick|form|input|position|tracker/i)
    expect(html).toContain('正文')
  })
  it('retains inline raster images and safely opens external links', () => {
    const html = sanitizeHtml('<img src="data:image/png;base64,AA=="><a href="https://example.com">资料</a>')
    expect(html).toContain('data:image/png;base64,AA==')
    expect(html).toContain('noopener noreferrer')
    expect(html).toContain('target="_blank"')
  })
})
