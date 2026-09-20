export type ChapterBox = { id: string; top: number; height: number }
export type ChapterRange = { from: number; to: number }

export function chapterWindow(index: number, count: number): ChapterRange {
  if (count <= 0) return { from: 0, to: -1 }
  const i = Math.min(Math.max(0, index), count - 1)
  return { from: Math.max(0, i - 1), to: Math.min(count - 1, i + 2) }
}

export function nextHydrationRange(
  prev: ChapterRange,
  index: number,
  count: number,
  reset = false,
): ChapterRange {
  const desired = chapterWindow(index, count)
  if (reset || prev.to < prev.from) return desired
  const expanded = {
    from: Math.min(prev.from, desired.from),
    to: Math.max(prev.to, desired.to),
  }
  const keepFrom = Math.max(0, index - 2)
  const keepTo = Math.min(count - 1, index + 3)
  return {
    from: Math.max(expanded.from, keepFrom),
    to: Math.min(expanded.to, keepTo),
  }
}

export function jumpSettled(input: {
  desired: number
  actual: number
  maxScroll: number
  tries: number
  maxTries?: number
}): boolean {
  if (Math.abs(input.desired - input.actual) <= 8) return true
  if (input.desired > input.actual && input.actual >= input.maxScroll - 1) return true
  return input.tries > (input.maxTries ?? 30)
}

export function chapterIdAtScroll(
  boxes: ChapterBox[],
  scrollTop: number,
  viewportHeight: number,
  scrollHeight: number,
): string | undefined {
  if (boxes.length === 0) return undefined
  const maxScroll = Math.max(0, scrollHeight - viewportHeight)
  if (maxScroll <= 0) return undefined
  const readable = boxes.filter((box) => box.height > 1)
  const list = readable.length > 0 ? readable : boxes
  let id = list[0]!.id
  for (const box of list) {
    if (box.top <= scrollTop + 1) id = box.id
  }
  return id
}

export function offsetInChapter(scrollTop: number, viewportHeight: number, box: ChapterBox): number {
  const range = box.height - viewportHeight
  if (range <= 0) return scrollTop > box.top + 1 ? 1 : 0
  return Math.min(1, Math.max(0, (scrollTop - box.top) / range))
}

export function scrollTopForOffset(viewportHeight: number, box: ChapterBox, offset: number): number {
  const range = Math.max(0, box.height - viewportHeight)
  return box.top + Math.min(1, Math.max(0, offset)) * range
}

export function scrollDeltaForWindowShift(
  prevFrom: number,
  nextFrom: number,
  heightAtIndex: (index: number) => number,
): number {
  if (nextFrom === prevFrom) return 0
  let delta = 0
  if (nextFrom > prevFrom) {
    for (let i = prevFrom; i < nextFrom; i++) delta -= heightAtIndex(i)
  } else {
    for (let i = nextFrom; i < prevFrom; i++) delta += heightAtIndex(i)
  }
  return delta
}

export function canApplyChapterJump(input: {
  targetHeight: number
  previousHeight?: number | null
}): boolean {
  return input.targetHeight > 0
}

export function shouldShiftScrollForResize(
  resizedIsBeforeCurrent: boolean,
  heightDelta: number,
  resizedCurrentWhileScrolled = false,
): boolean {
  return heightDelta !== 0 && (resizedIsBeforeCurrent || resizedCurrentWhileScrolled)
}

export function mergeChapterBodies(
  prev: Record<string, string>,
  rows: { id: string; body: string }[],
): Record<string, string> {
  let changed = false
  const next = { ...prev }
  for (const row of rows) {
    if (next[row.id] !== row.body) {
      next[row.id] = row.body
      changed = true
    }
  }
  return changed ? next : prev
}

export function readChapterBoxes(stream: HTMLElement): ChapterBox[] {
  return [...stream.querySelectorAll<HTMLElement>('[data-chapter-id]')].map((el) => ({
    id: el.getAttribute('data-chapter-id') ?? '',
    top: el.offsetTop,
    height: el.offsetHeight,
  }))
}
