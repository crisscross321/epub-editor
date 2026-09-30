export type ReadingAnchor = { element: Element; top: number; chapterId: string | null; childIndex: number }

// Capture a visible block, not the height of the whole chapter: images below
// the viewport must never move the current paragraph.
export function captureAnchor(stream: HTMLElement): ReadingAnchor | null {
  const top = stream.getBoundingClientRect().top
  const blocks = stream.querySelectorAll('.preview-chapter:not(.is-spacer) > *')
  for (const element of blocks) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom > top && rect.height > 0) return { element, top: rect.top - top, chapterId: element.parentElement?.getAttribute('data-chapter-id') ?? null, childIndex: Array.from(element.parentElement?.children ?? []).indexOf(element) }
  }
  return null
}

export function restoreAnchor(stream: HTMLElement, anchor: ReadingAnchor | null): void {
  if (!anchor) return
  const chapter = Array.from(stream.querySelectorAll('[data-chapter-id]')).find(el => el.getAttribute('data-chapter-id') === anchor.chapterId)
  const element = stream.contains(anchor.element) ? anchor.element : chapter?.children[anchor.childIndex]
  if (!element) return
  const delta = element.getBoundingClientRect().top - stream.getBoundingClientRect().top - anchor.top
  if (Math.abs(delta) > 0.5) stream.scrollTop += delta
}
