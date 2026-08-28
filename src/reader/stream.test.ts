import { describe, expect, it } from 'vitest'
import {
  canApplyChapterJump,
  chapterIdAtScroll,
  chapterWindow,
  offsetInChapter,
  scrollDeltaForWindowShift,
  scrollTopForOffset,
  shouldShiftScrollForResize,
} from './stream'

describe('chapterWindow', () => {
  it('keeps the previous and next chapter around the current one', () => {
    expect(chapterWindow(0, 5)).toEqual({ from: 0, to: 2 })
    expect(chapterWindow(2, 5)).toEqual({ from: 1, to: 4 })
    expect(chapterWindow(4, 5)).toEqual({ from: 3, to: 4 })
  })

  it('handles a single chapter and an empty book', () => {
    expect(chapterWindow(0, 1)).toEqual({ from: 0, to: 0 })
    expect(chapterWindow(0, 0)).toEqual({ from: 0, to: -1 })
  })
})

describe('chapterIdAtScroll', () => {
  const boxes = [
    { id: 'a', top: 0, height: 400 },
    { id: 'b', top: 400, height: 400 },
    { id: 'c', top: 800, height: 200 },
  ]

  it('does not change chapter when the whole stream fits on screen', () => {
    expect(chapterIdAtScroll(boxes, 0, 2000, 1000)).toBeUndefined()
  })

  it('uses the chapter at the top of the viewport so the previous ending stays current', () => {
    expect(chapterIdAtScroll(boxes, 0, 300, 1000)).toBe('a')
    expect(chapterIdAtScroll(boxes, 350, 300, 1000)).toBe('a')
    expect(chapterIdAtScroll(boxes, 400, 300, 1000)).toBe('b')
  })

  it('does not treat a peeking next chapter as current just because the stream is at max scroll', () => {
    expect(chapterIdAtScroll(boxes, 700, 300, 1000)).toBe('b')
    expect(chapterIdAtScroll(boxes, 800, 300, 1000)).toBe('c')
  })

  it('stays on the current chapter when the next chapter is only a stub at the bottom', () => {
    const stub = [
      { id: 'a', top: 0, height: 4000 },
      { id: 'b', top: 4000, height: 0 },
    ]
    expect(chapterIdAtScroll(stub, 3300, 700, 4000)).toBe('a')
  })
})

describe('offset and restore', () => {
  const box = { id: 'a', top: 200, height: 800 }

  it('maps scroll position within a tall chapter to 0-1', () => {
    expect(offsetInChapter(200, 200, box)).toBe(0)
    expect(offsetInChapter(500, 200, box)).toBe(0.5)
    expect(offsetInChapter(800, 200, box)).toBe(1)
  })

  it('restores the same scrollTop from an offset', () => {
    expect(scrollTopForOffset(200, box, 0.5)).toBe(500)
  })
})

describe('scrollDeltaForWindowShift', () => {
  const heights = [100, 240, 180, 90]
  const at = (i: number) => heights[i] ?? 0

  it('subtracts removed prefix height when the window moves forward', () => {
    expect(scrollDeltaForWindowShift(1, 2, at)).toBe(-240)
  })

  it('adds newly prepended height when the window moves backward', () => {
    expect(scrollDeltaForWindowShift(2, 1, at)).toBe(240)
  })
})

describe('canApplyChapterJump', () => {
  it('waits until a previous chapter has height so the jump is not to the previous start', () => {
    expect(canApplyChapterJump({ targetHeight: 800, previousHeight: 0 })).toBe(false)
    expect(canApplyChapterJump({ targetHeight: 800, previousHeight: 1200 })).toBe(true)
  })

  it('jumps immediately when there is no previous chapter', () => {
    expect(canApplyChapterJump({ targetHeight: 800, previousHeight: null })).toBe(true)
  })
})

describe('shouldShiftScrollForResize', () => {
  it('shifts scroll when a chapter above the current one changes height', () => {
    expect(shouldShiftScrollForResize(true, 400)).toBe(true)
    expect(shouldShiftScrollForResize(false, 400)).toBe(false)
    expect(shouldShiftScrollForResize(true, 0)).toBe(false)
  })
})
