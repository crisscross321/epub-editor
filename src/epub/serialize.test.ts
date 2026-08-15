import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { BookRecord, TiptapDoc } from '../types/book'
import { toArrayBuffer } from './bytes'
import { fixtureEpub3 } from './fixtures'
import { bytesEqual, parseEpub } from './parse'
import { docToXhtml, packEpub } from './serialize'
import { simplifyXhtml } from './simplify'


describe('packEpub', () => {
  it('exports a new book with one chapter and keeps mimetype stored first as EPUB 3', async () => {
    const book: BookRecord = {
      id: 'new-1',
      title: '新书',
      author: '我',
      language: 'zh-CN',
      updatedAt: new Date().toISOString(),
      opfHref: 'OEBPS/content.opf',
      chapters: [
        {
          id: 'ch1',
          href: 'OEBPS/text/ch1.xhtml',
          title: '开篇',
          spineIndex: 0,
          state: 'simplified',
        },
      ],
    }
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开篇' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '你好' }] },
      ],
    }
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const packed = await packEpub({
      book,
      entries: new Map(),
      simplified: new Map([
        [
          'ch1',
          {
            xhtml: docToXhtml(doc, '开篇'),
            images: [
              {
                id: 'img1',
                href: 'OEBPS/images/img1.png',
                bytes: png,
                mime: 'image/png',
              },
            ],
          },
        ],
      ]),
      cover: { bytes: png, mime: 'image/png', ext: 'png' },
    })
    const zip = await JSZip.loadAsync(packed)
    expect(zip.file('mimetype')).toBeTruthy()
    const mime = await zip.file('mimetype')!.async('string')
    expect(mime).toBe('application/epub+zip')
    const opf = await zip.file('OEBPS/content.opf')!.async('string')
    expect(opf).toContain('version="3.0"')
    expect(opf).toContain('properties="cover-image"')
    expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy()
    expect(zip.file('OEBPS/text/ch1.xhtml')).toBeTruthy()
    expect(zip.file('OEBPS/images/img1.png')).toBeTruthy()
  })

  it('keeps unopened chapters byte-identical when only the middle chapter is simplified', async () => {
    const original = await fixtureEpub3()
    const parsed = await parseEpub(toArrayBuffer(original))
    const ch2 = parsed.chapters[1]!
    const xhtml = await new TextDecoder().decode(parsed.entries.get(ch2.href)!)
    const doc = simplifyXhtml(xhtml, () => '')
    doc.content = [
      ...(doc.content ?? []),
      { type: 'paragraph', content: [{ type: 'text', text: '已修改' }] },
    ]
    const book: BookRecord = {
      id: 'imp',
      title: parsed.title,
      author: parsed.author,
      language: parsed.language,
      updatedAt: new Date().toISOString(),
      opfHref: parsed.opfHref,
      chapters: parsed.chapters.map((c) =>
        c.id === ch2.id ? { ...c, state: 'simplified' as const } : c,
      ),
    }
    const packed = await packEpub({
      book,
      entries: parsed.entries,
      simplified: new Map([
        [ch2.id, { xhtml: docToXhtml(doc, ch2.title, parsed.language), images: [] }],
      ]),
    })
    const zip = await JSZip.loadAsync(packed)
    const ch1 = parsed.chapters[0]!
    const ch3 = parsed.chapters[2]!
    const out1 = await zip.file(ch1.href)!.async('uint8array')
    const out3 = await zip.file(ch3.href)!.async('uint8array')
    expect(bytesEqual(out1, parsed.entries.get(ch1.href)!)).toBe(true)
    expect(bytesEqual(out3, parsed.entries.get(ch3.href)!)).toBe(true)
    const out2 = await zip.file(ch2.href)!.async('string')
    expect(out2).toContain('已修改')
  })

  it('updates spine and nav after add, delete and reorder', async () => {
    const original = await fixtureEpub3()
    const parsed = await parseEpub(toArrayBuffer(original))
    const chapters = [
      { ...parsed.chapters[2]!, spineIndex: 0 },
      { ...parsed.chapters[0]!, spineIndex: 1 },
      {
        id: 'newch',
        href: 'OEBPS/text/newch.xhtml',
        title: '新章',
        spineIndex: 2,
        state: 'simplified' as const,
      },
    ]
    const book: BookRecord = {
      id: 'imp2',
      title: parsed.title,
      author: parsed.author,
      language: parsed.language,
      updatedAt: new Date().toISOString(),
      opfHref: parsed.opfHref,
      chapters,
    }
    const packed = await packEpub({
      book,
      entries: parsed.entries,
      simplified: new Map([
        [
          'newch',
          {
            xhtml: docToXhtml(
              { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '新' }] }] },
              '新章',
            ),
            images: [],
          },
        ],
      ]),
    })
    const zip = await JSZip.loadAsync(packed)
    const opf = await zip.file('OEBPS/content.opf')!.async('string')
    const spineOrder = [...opf.matchAll(/idref="([^"]+)"/g)].map((m) => m[1])
    expect(spineOrder).toEqual(['ch3', 'ch1', 'newch'])
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string')
    expect(nav.indexOf('第三章')).toBeLessThan(nav.indexOf('第一章'))
    expect(nav).toContain('新章')
    expect(nav).not.toContain('第二章')
  })

  it('writes heading ids and nested nav for h2 and h3', async () => {
    const book: BookRecord = {
      id: 'toc-1',
      title: '目录书',
      author: '我',
      language: 'zh-CN',
      updatedAt: new Date().toISOString(),
      opfHref: 'OEBPS/content.opf',
      chapters: [
        {
          id: 'ch1',
          href: 'OEBPS/text/ch1.xhtml',
          title: '开篇',
          spineIndex: 0,
          state: 'simplified',
        },
      ],
    }
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '节一' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '点A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
      ],
    }
    const packed = await packEpub({
      book,
      entries: new Map(),
      simplified: new Map([['ch1', { xhtml: docToXhtml(doc, '开篇'), images: [] }]]),
    })
    const zip = await JSZip.loadAsync(packed)
    const xhtml = await zip.file('OEBPS/text/ch1.xhtml')!.async('string')
    expect(xhtml).toMatch(/<h2 id="h2-1">节一<\/h2>/)
    expect(xhtml).toMatch(/<h3 id="h2-1-h3-1">点A<\/h3>/)
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string')
    expect(nav).toContain('第 1 章 开篇')
    expect(nav).toContain('text/ch1.xhtml#h2-1')
    expect(nav).toContain('text/ch1.xhtml#h2-1-h3-1')
    expect(nav).toContain('节一')
    expect(nav).toContain('点A')
  })

  it('writes image width and alignment as data attributes and inline style', () => {
    const xhtml = docToXhtml(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'image',
                attrs: { src: 'images/a.jpg', alt: '图', imageId: 'img-a', width: 60, align: 'right' },
              },
            ],
          },
        ],
      },
      '图章',
    )
    expect(xhtml).toContain('data-width="60"')
    expect(xhtml).toContain('data-align="right"')
    expect(xhtml).toContain('width:60%')
    expect(xhtml).toContain('margin:12px 0 12px auto')
  })
})
