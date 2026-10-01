import { afterEach, describe, expect, it } from 'vitest'
import { excludeChapterTitleFromSelectAll, selectEditorExceptChapterTitle } from './selectAll'

const mounted: HTMLElement[] = []

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  mounted.push(root)
  return root
}

function selectAll(root: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(root)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  for (const node of mounted) node.remove()
  mounted.length = 0
})

describe('select all in the editor', () => {
  it('skips the leading chapter title and keeps later headings', () => {
    const root = mount('<h1>茶峒</h1><p>近水人家。</p><h2>白塔</h2><h3>渡口</h3>')
    selectAll(root)
    expect(excludeChapterTitleFromSelectAll(root)).toBe(true)
    const text = window.getSelection()?.toString() ?? ''
    expect(text).toContain('近水人家')
    expect(text).toContain('白塔')
    expect(text).toContain('渡口')
    expect(text).not.toContain('茶峒')
  })

  it('selects an h2 when the chapter has no leading h1', () => {
    const root = mount('<h2>白塔</h2><p>近水人家。</p>')
    selectEditorExceptChapterTitle(root)
    const text = window.getSelection()?.toString() ?? ''
    expect(text).toContain('白塔')
    expect(text).toContain('近水人家')
  })

  it('does not treat a mid-chapter h1 as the chapter title to skip', () => {
    const root = mount('<p>前文</p><h1>夜宴</h1><p>后文</p>')
    selectEditorExceptChapterTitle(root)
    const text = window.getSelection()?.toString() ?? ''
    expect(text).toContain('夜宴')
    expect(text).toContain('前文')
  })

  it('drops the chapter title when the selection runs from its first character to the end', () => {
    const root = mount('<h1>茶峒</h1><p>近水人家。</p><h2>白塔</h2>')
    const first = root.querySelector('h1')!.firstChild!
    const last = root.querySelector('h2')!.firstChild!
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(last, last.textContent!.length)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(excludeChapterTitleFromSelectAll(root)).toBe(true)
    const text = sel.toString()
    expect(text).toContain('近水人家')
    expect(text).toContain('白塔')
    expect(text).not.toContain('茶峒')
  })

  it('keeps a title selection that does not reach the end of the chapter', () => {
    const root = mount('<h1>茶峒</h1><p>近水人家。</p><h2>白塔</h2>')
    const first = root.querySelector('h1')!.firstChild!
    const para = root.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(para, 2)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(excludeChapterTitleFromSelectAll(root)).toBe(false)
    expect(sel.toString()).toContain('茶峒')
  })

  it('leaves a selection that is only inside a later heading', () => {
    const root = mount('<h1>茶峒</h1><h2>白塔</h2>')
    const heading = root.querySelector('h2')!
    const range = document.createRange()
    range.selectNodeContents(heading)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(excludeChapterTitleFromSelectAll(root)).toBe(false)
    expect(sel.toString()).toContain('白塔')
  })
})
