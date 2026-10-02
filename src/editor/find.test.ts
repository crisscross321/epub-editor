import { afterEach, describe, expect, it, vi } from 'vitest'
import { findInRoot, scrollDeltaForMatch } from './find'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function viewportBottom(): number {
  const viewport = window.visualViewport
  if (!viewport) return window.innerHeight
  return viewport.offsetTop + viewport.height
}

describe('findInRoot', () => {
  it('finds text across formatting nodes and wraps only within the editor', () => {
    document.body.innerHTML = '<p>夜宴</p><div contenteditable="true">夜<b>宴</b>，又是夜宴</div>'
    const root = document.querySelector('div')!
    expect(findInRoot(root, '夜宴', true)).toBe(true)
    expect(window.getSelection()?.toString()).toBe('夜宴')
    const first = window.getSelection()!.anchorNode
    expect(root.contains(first)).toBe(true)
    expect(findInRoot(root, '夜宴', false)).toBe(true)
    expect(window.getSelection()!.anchorNode).not.toBe(first)
    expect(findInRoot(root, '夜宴', false)).toBe(true)
    expect(window.getSelection()!.anchorNode).toBe(first)
  })
  it('does not match text outside the editor or empty queries', () => {
    document.body.innerHTML = '<p>夜宴</p><div contenteditable="true">白塔</div>'
    const root = document.querySelector('div')!
    expect(findInRoot(root, '夜宴', true)).toBe(false)
    expect(findInRoot(root, '', true)).toBe(false)
  })
})

describe('scrollDeltaForMatch', () => {
  it('moves a match down from underneath the find bar', () => {
    expect(scrollDeltaForMatch({ top: 80, bottom: 108 }, 216, 800)).toBe(80 - 232)
  })

  it('brings a match that sits below the visible area up under the find bar', () => {
    expect(scrollDeltaForMatch({ top: 900, bottom: 928 }, 216, 800)).toBe(900 - 232)
  })

  it('leaves a match that is already clear of the find bar', () => {
    expect(scrollDeltaForMatch({ top: 400, bottom: 428 }, 216, 800)).toBe(0)
  })

  it('keeps the start of a tall match below the find bar', () => {
    expect(scrollDeltaForMatch({ top: 40, bottom: 900 }, 216, 800)).toBe(40 - 232)
  })

  it('does not move a tall match whose start is already visible', () => {
    expect(scrollDeltaForMatch({ top: 300, bottom: 1200 }, 216, 800)).toBe(0)
  })
})

describe('findInRoot scroll', () => {
  it('scrolls a covered match clear of the sticky find bar', () => {
    document.body.innerHTML = '<div><div class="editor-chrome"></div><div contenteditable="true"><p>夜宴</p></div></div>'
    const chrome = document.querySelector('.editor-chrome') as HTMLElement
    vi.spyOn(chrome, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 56, 390, 160))
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([new DOMRect(12, 80, 36, 28)] as unknown as DOMRectList)
    const scroller = document.scrollingElement ?? document.documentElement
    const scrollBy = vi.spyOn(scroller, 'scrollBy').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
    const root = document.querySelector('[contenteditable]') as HTMLElement
    expect(findInRoot(root, '夜宴', true)).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith(0, scrollDeltaForMatch({ top: 80, bottom: 108 }, 216, viewportBottom()))
  })

  it('does not scroll a match that is already below the find bar', () => {
    document.body.innerHTML = '<div><div class="editor-chrome"></div><div contenteditable="true"><p>夜宴</p></div></div>'
    const chrome = document.querySelector('.editor-chrome') as HTMLElement
    vi.spyOn(chrome, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 56, 390, 160))
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([new DOMRect(12, 400, 36, 28)] as unknown as DOMRectList)
    const scroller = document.scrollingElement ?? document.documentElement
    const scrollBy = vi.spyOn(scroller, 'scrollBy').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
    const root = document.querySelector('[contenteditable]') as HTMLElement
    expect(findInRoot(root, '夜宴', true)).toBe(true)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
