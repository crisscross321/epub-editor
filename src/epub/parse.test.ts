import { toArrayBuffer } from './bytes'
import { describe, expect, it } from 'vitest'
import { EpubError } from './errors'
import { fixtureEpub2Ncx, fixtureEpub3 } from './fixtures'
import { parseEpub } from './parse'

describe('parseEpub', () => {
  it('reads title, author, language and chapter list from a minimal EPUB 3', async () => {
    const bytes = await fixtureEpub3()
    const parsed = await parseEpub(toArrayBuffer(bytes))
    expect(parsed.title).toBe('测试书')
    expect(parsed.author).toBe('作者甲')
    expect(parsed.language).toBe('zh-CN')
    expect(parsed.chapters.map((c) => c.title)).toEqual(['第一章', '第二章', '第三章'])
    expect(parsed.chapters.every((c) => c.state === 'pristine')).toBe(true)
    expect(parsed.opfHref).toBe('OEBPS/content.opf')
  })

  it('rejects encrypted books', async () => {
    const bytes = await fixtureEpub3({ encrypted: true })
    await expect(parseEpub(toArrayBuffer(bytes))).rejects.toMatchObject({
      code: 'encrypted',
    })
    await expect(parseEpub(toArrayBuffer(bytes))).rejects.toBeInstanceOf(EpubError)
  })

  it('rejects garbage bytes', async () => {
    const buf = new TextEncoder().encode('not an epub').buffer
    await expect(parseEpub(buf)).rejects.toMatchObject({ code: 'not-zip' })
  })

  it('rejects missing OPF', async () => {
    const bytes = await fixtureEpub3({ skipOpf: true })
    await expect(parseEpub(toArrayBuffer(bytes))).rejects.toMatchObject({
      code: 'no-opf',
    })
  })

  it('rejects empty spine', async () => {
    const bytes = await fixtureEpub3({ emptySpine: true })
    await expect(parseEpub(toArrayBuffer(bytes))).rejects.toMatchObject({
      code: 'empty-spine',
    })
  })

  it('reads EPUB 2 NCX titles', async () => {
    const bytes = await fixtureEpub2Ncx()
    const parsed = await parseEpub(toArrayBuffer(bytes))
    expect(parsed.title).toBe('旧版书')
    expect(parsed.chapters).toHaveLength(1)
    expect(parsed.chapters[0]?.title).toBe('NCX标题')
  })

  it('excludes spine items marked linear=no', async () => {
    const bytes = await fixtureEpub3({ linearNoExtra: true })
    const parsed = await parseEpub(toArrayBuffer(bytes))
    expect(parsed.chapters.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3'])
  })
})
