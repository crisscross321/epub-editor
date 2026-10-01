/** The chapter title is the leading H1. Later headings stay selectable. */
export function leadingChapterTitle(root: ParentNode): HTMLElement | null {
  const first = root.firstElementChild
  return first instanceof HTMLElement && first.tagName === 'H1' ? first : null
}

function collapsedAt(node: Node, offset: number): Range {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  return range
}

function firstText(root: Node): Text | null {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode() as Text | null
}

function lastText(root: Node): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  let current = walker.nextNode()
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }
  return last
}

function startsAtChapterTitle(range: Range, title: HTMLElement): boolean {
  const titleStart = document.createRange()
  titleStart.selectNodeContents(title)
  titleStart.collapse(true)
  if (range.compareBoundaryPoints(Range.START_TO_START, titleStart) <= 0) return true
  // Some engines report the first character as a text offset, later than the heading boundary.
  const text = firstText(title)
  return !!text && range.startContainer === text && range.startOffset === 0
}

/** Desktop select-all uses the element boundary. Android select-all runs from the first character to the last. */
function rangeCoversEditor(range: Range, root: HTMLElement, title: HTMLElement): boolean {
  try {
    const contents = document.createRange()
    contents.selectNodeContents(root)
    if (
      range.compareBoundaryPoints(Range.START_TO_START, contents) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, contents) >= 0
    ) {
      return true
    }
    if (!startsAtChapterTitle(range, title)) return false
    const end = lastText(root)
    if (!end) return false
    return range.compareBoundaryPoints(Range.END_TO_END, collapsedAt(end, end.length)) >= 0
  } catch {
    return false
  }
}

export function selectEditorExceptChapterTitle(root: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const title = leadingChapterTitle(root)
  const start = title?.nextSibling
  if (title && start) {
    range.setStartBefore(start)
    const end = root.lastChild
    if (end) range.setEndAfter(end)
  } else if (title) {
    range.setStartAfter(title)
    range.collapse(true)
  } else {
    range.selectNodeContents(root)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

let adjusting = false

/** Shrink a whole-editor selection so it no longer includes the chapter title. */
export function excludeChapterTitleFromSelectAll(root: HTMLElement): boolean {
  if (adjusting) return false
  const title = leadingChapterTitle(root)
  if (!title?.nextSibling) return false
  const sel = window.getSelection()
  if (!sel?.rangeCount) return false
  const anchor = sel.anchorNode
  if (!anchor || (anchor !== root && !root.contains(anchor))) return false
  if (!rangeCoversEditor(sel.getRangeAt(0), root, title)) return false
  adjusting = true
  try {
    selectEditorExceptChapterTitle(root)
  } finally {
    adjusting = false
  }
  return true
}
