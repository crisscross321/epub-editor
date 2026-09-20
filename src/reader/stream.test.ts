import { describe, expect, it } from 'vitest'
import {
  canApplyChapterJump,
  chapterIdAtScroll,
  chapterWindow,
  jumpSettled,
  mergeChapterBodies,
  nextHydrationRange,
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

  it('stays on the second-to-last chapter when the last chapter is shorter than the viewport', () => {
    const boxes = [
      { id: 'prev', top: 0, height: 1200 },
      { id: 'current', top: 1200, height: 3000 },
      { id: 'empty', top: 4200, height: 60 },
    ]
    expect(chapterIdAtScroll(boxes, 3500, 700, 4260)).toBe('current')
    expect(chapterIdAtScroll(boxes, 3560, 700, 4260)).toBe('current')
  })
})

describe('nextHydrationRange', () => {
  it('does not drop the chapter above the second-to-last when index flickers onto an empty last chapter', () => {
    const onSecondLast = nextHydrationRange({ from: 0, to: -1 }, 3, 5, true)
    expect(onSecondLast).toEqual({ from: 2, to: 4 })
    expect(nextHydrationRange(onSecondLast, 4, 5)).toEqual({ from: 2, to: 4 })
    expect(nextHydrationRange({ from: 2, to: 4 }, 3, 5)).toEqual({ from: 2, to: 4 })
  })

  it('expands forward as the reader advances and only drops chapters far behind', () => {
    const start = nextHydrationRange({ from: 0, to: -1 }, 0, 8, true)
    expect(start).toEqual({ from: 0, to: 2 })
    const later = nextHydrationRange(start, 4, 8)
    expect(later.from).toBe(2)
    expect(later.to).toBe(6)
  })

  it('resets around the jump target instead of hydrating the whole prefix', () => {
    expect(nextHydrationRange({ from: 0, to: 2 }, 10, 12, true)).toEqual({ from: 9, to: 11 })
  })
})

describe('jumpSettled', () => {
  it('settles when the stream cannot scroll as far as the target start', () => {
    expect(
      jumpSettled({ desired: 4000, actual: 3300, maxScroll: 3300, tries: 0 }),
    ).toBe(true)
  })

  it('keeps waiting when the target is reachable but not aligned yet', () => {
    expect(
      jumpSettled({ desired: 800, actual: 0, maxScroll: 4000, tries: 0 }),
    ).toBe(false)
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
  it('jumps once the target chapter has height even if the previous slot is still a spacer', () => {
    expect(canApplyChapterJump({ targetHeight: 800, previousHeight: 0 })).toBe(true)
    expect(canApplyChapterJump({ targetHeight: 0, previousHeight: 1200 })).toBe(false)
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

  it('shifts scroll when the current first chapter changes height after leaving its start', () => {
    expect(shouldShiftScrollForResize(false, -800, true)).toBe(true)
    expect(shouldShiftScrollForResize(false, 800, true)).toBe(true)
    expect(shouldShiftScrollForResize(false, 800, false)).toBe(false)
  })
})

describe('mergeChapterBodies', () => {
  it('keeps the previous record when refetched HTML is unchanged', () => {
    const prev = { ch1: '<p>茶峒</p>', ch2: '<p>白塔</p>' }
    expect(mergeChapterBodies(prev, [
      { id: 'ch1', body: '<p>茶峒</p>' },
      { id: 'ch2', body: '<p>白塔</p>' },
    ])).toBe(prev)
  })

  it('replaces only chapters whose HTML actually changed', () => {
    const prev = { ch1: '<p>茶峒</p>', ch2: '<p>白塔</p>' }
    const next = mergeChapterBodies(prev, [{ id: 'ch2', body: '<p>白塔改</p>' }])
    expect(next).not.toBe(prev)
    expect(next).toEqual({ ch1: '<p>茶峒</p>', ch2: '<p>白塔改</p>' })
  })
})
