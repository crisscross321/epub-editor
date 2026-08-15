import { describe, expect, it } from 'vitest'
import { parseHtml } from './xml'
import { nestedNavHtml, outlineFromXhtml } from './toc'

describe('outlineFromXhtml', () => {
  it('collects h2 and h3 that already have ids', () => {
    const headings = outlineFromXhtml(`<body>
      <h1 id="ch">章</h1>
      <h2 id="h2-1">节一</h2>
      <h3 id="h2-1-h3-1">点A</h3>
      <h2>没有 id 的二级</h2>
    </body>`)
    expect(headings).toEqual([
      { level: 2, id: 'h2-1', title: '节一' },
      { level: 3, id: 'h2-1-h3-1', title: '点A' },
    ])
  })
})

describe('nestedNavHtml', () => {
  it('nests h3 under h2 so readers can show a multi-level toc', () => {
    const html = nestedNavHtml(
      'text/ch1.xhtml',
      '第一章',
      [
        { level: 2, id: 'h2-1', title: '节一' },
        { level: 3, id: 'h2-1-h3-1', title: '点A' },
        { level: 3, id: 'h2-1-h3-2', title: '点B' },
        { level: 2, id: 'h2-2', title: '节二' },
      ],
      (s) => s,
    )
    const doc = parseHtml(`<ol>${html}</ol>`)
    const chapterLi = doc.body.querySelector(':scope > ol > li')
    const chapterLink = chapterLi?.querySelector(':scope > a')
    expect(chapterLink?.getAttribute('href')).toBe('text/ch1.xhtml')
    expect(chapterLink?.textContent).toBe('第一章')
    const h2Items = chapterLi?.querySelectorAll(':scope > ol > li') ?? []
    expect(h2Items).toHaveLength(2)
    expect(h2Items[0]?.querySelector(':scope > a')?.textContent).toBe('节一')
    expect(h2Items[0]?.querySelector(':scope > a')?.getAttribute('href')).toBe('text/ch1.xhtml#h2-1')
    const h3Items = h2Items[0]?.querySelectorAll(':scope > ol > li') ?? []
    expect(h3Items).toHaveLength(2)
    expect(h3Items[0]?.textContent).toBe('点A')
    expect(h2Items[1]?.querySelector(':scope > a')?.textContent).toBe('节二')
    expect(h2Items[1]?.querySelectorAll(':scope > ol > li')).toHaveLength(0)
  })
})
