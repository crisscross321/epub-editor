export type ChapterBox = { id: string; top: number; height: number }

export function chapterWindow(index: number, count: number): { from: number; to: number } {
  if (count <= 0) return { from: 0, to: -1 }
  const i = Math.min(Math.max(0, index), count - 1)
  return { from: Math.max(0, i - 1), to: Math.min(count - 1, i + 2) }
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
  previousHeight: number | null
}): boolean {
  if (input.targetHeight <= 0) return false
  if (input.previousHeight != null && input.previousHeight <= 0) return false
  return true
}

export function shouldShiftScrollForResize(resizedIsBeforeCurrent: boolean, heightDelta: number): boolean {
  return resizedIsBeforeCurrent && heightDelta !== 0
}

export function readChapterBoxes(stream: HTMLElement): ChapterBox[] {
  return [...stream.querySelectorAll<HTMLElement>('[data-chapter-id]')].map((el) => ({
    id: el.getAttribute('data-chapter-id') ?? '',
    top: el.offsetTop,
    height: el.offsetHeight,
  }))
}
