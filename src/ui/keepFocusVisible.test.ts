import { describe, expect, it, vi } from 'vitest'
import {
  bindKeyboardReveal,
  keyboardPadding,
  overlayFromViewport,
  pickCaretRect,
  scrollDeltaForRect,
  shouldRevealFocusedInput,
  visibleBoundsWithKeyboard,
} from './keepFocusVisible'

describe('scrollDeltaForRect', () => {
  it('scrolls down when the caret sits below the visible area', () => {
    expect(scrollDeltaForRect({ top: 500, bottom: 530 }, 0, 400)).toBe(154)
  })

  it('scrolls up when the field sits above the visible area', () => {
    expect(scrollDeltaForRect({ top: 10, bottom: 50 }, 80, 400)).toBe(-94)
  })

  it('does nothing when the target is already visible', () => {
    expect(scrollDeltaForRect({ top: 120, bottom: 160 }, 0, 400)).toBe(0)
  })
})

describe('overlayFromViewport', () => {
  it('is zero when the visual viewport still covers the full window', () => {
    expect(overlayFromViewport(800, { height: 800, offsetTop: 0 })).toBe(0)
  })

  it('returns the obscured bottom strip when the visual viewport shrinks', () => {
    expect(overlayFromViewport(800, { height: 500, offsetTop: 0 })).toBe(300)
  })
})

describe('keyboardPadding', () => {
  it('uses the measured overlay plus room for the IME candidate bar', () => {
    expect(
      keyboardPadding({
        innerHeight: 800,
        baselineInnerHeight: 800,
        viewportOverlay: 300,
        virtualKeyboardHeight: 0,
        focused: true,
      }),
    ).toBe(348)
  })

  it('does not invent a keyboard just because a desktop editor is focused', () => {
    expect(
      keyboardPadding({
        innerHeight: 800,
        baselineInnerHeight: 800,
        viewportOverlay: 0,
        virtualKeyboardHeight: 0,
        focused: true,
      }),
    ).toBe(0)
  })

  it('only adds a small pad when the layout viewport already shrank', () => {
    expect(
      keyboardPadding({
        innerHeight: 500,
        baselineInnerHeight: 800,
        viewportOverlay: 0,
        virtualKeyboardHeight: 0,
        focused: true,
      }),
    ).toBe(48)
  })

  it('clears padding when nothing is focused and no overlay is reported', () => {
    expect(
      keyboardPadding({
        innerHeight: 800,
        baselineInnerHeight: 800,
        viewportOverlay: 0,
        virtualKeyboardHeight: 0,
        focused: false,
      }),
    ).toBe(0)
  })
})

describe('visibleBoundsWithKeyboard', () => {
  it('treats the bottom of the screen as covered when the visual viewport never shrinks', () => {
    expect(visibleBoundsWithKeyboard(800, { height: 800, offsetTop: 0 }, 360)).toEqual({
      top: 0,
      bottom: 440,
    })
  })

  it('does not subtract the keyboard twice after the visual viewport already shrunk', () => {
    expect(visibleBoundsWithKeyboard(800, { height: 500, offsetTop: 0 }, 348)).toEqual({
      top: 0,
      bottom: 452,
    })
  })
})

describe('shouldRevealFocusedInput', () => {
  it('follows a collapsed caret so the last lines stay above the IME', () => {
    expect(shouldRevealFocusedInput({ collapsed: true, interacting: false })).toBe(true)
  })

  it('does not steal the viewport while the user is dragging a text selection', () => {
    expect(shouldRevealFocusedInput({ collapsed: false, interacting: false })).toBe(false)
  })

  it('does not reveal while a touch gesture is active', () => {
    expect(shouldRevealFocusedInput({ collapsed: true, interacting: true })).toBe(false)
  })
})

describe('bindKeyboardReveal', () => {
  it('does not scroll the page while a contenteditable range is being dragged', () => {
    const editor = document.createElement('div')
    editor.className = 'ProseMirror'
    editor.contentEditable = 'true'
    editor.append('茶峒临溪而建，白塔在山后。')
    document.body.appendChild(editor)
    editor.focus()
    const text = editor.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const spy = vi.spyOn(document.scrollingElement ?? document.documentElement, 'scrollBy')
    const unbind = bindKeyboardReveal()
    document.dispatchEvent(new Event('selectionchange'))
    expect(spy).not.toHaveBeenCalled()
    unbind()
    spy.mockRestore()
    editor.remove()
  })
})

describe('pickCaretRect', () => {
  it('keeps a collapsed caret that still has a height', () => {
    expect(pickCaretRect({ top: 400, bottom: 424, width: 0, height: 24 }, { top: 380, bottom: 440 })).toEqual({
      top: 400,
      bottom: 424,
    })
  })

  it('falls back when the range reports an empty box at the end of the document', () => {
    expect(pickCaretRect({ top: 0, bottom: 0, width: 0, height: 0 }, { top: 720, bottom: 748 })).toEqual({
      top: 720,
      bottom: 748,
    })
  })
})
