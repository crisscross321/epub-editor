const MATCH_PAD = 16

export function moveCaretToStart(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// How far to scroll so a match sits in the band not covered by the sticky find bar.
// Hidden matches move to just below that bar. A match taller than the band stays put
// once its first line is already in view.
export function scrollDeltaForMatch(
  rect: { top: number; bottom: number },
  visibleTop: number,
  visibleBottom: number,
  pad = MATCH_PAD,
): number {
  const limitTop = visibleTop + pad
  const limitBottom = Math.max(limitTop + 1, visibleBottom - pad)
  if (rect.top >= limitTop && rect.bottom <= limitBottom) return 0
  const height = Math.max(0, rect.bottom - rect.top)
  const room = limitBottom - limitTop
  if (height >= room && rect.top >= limitTop && rect.top <= limitBottom) return 0
  return rect.top - limitTop
}

function viewportBottom(): number {
  const viewport = window.visualViewport
  if (!viewport) return window.innerHeight
  return viewport.offsetTop + viewport.height
}

function stickyCoverBottom(root: HTMLElement): number {
  const scope = root.parentElement ?? document
  const chrome = scope.querySelector('.editor-chrome') ?? document.querySelector('.editor-chrome')
  if (!(chrome instanceof HTMLElement)) return 0
  return Math.max(0, chrome.getBoundingClientRect().bottom)
}

function matchLineRect(range: Range): { top: number; bottom: number } | null {
  const rects = range.getClientRects()
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i]
    if (rect && (rect.width > 0 || rect.height > 0)) return { top: rect.top, bottom: rect.bottom }
  }
  const box = range.getBoundingClientRect()
  if (box.width > 0 || box.height > 0) return { top: box.top, bottom: box.bottom }
  return null
}

let revealFrame = 0

function scrollByDelta(delta: number): void {
  if (!delta) return
  const scroller = document.scrollingElement
  if (scroller) scroller.scrollBy(0, delta)
  else window.scrollBy(0, delta)
}

function scrollMatchIntoView(range: Range, root: HTMLElement): void {
  if (!root.isConnected) return
  const rect = matchLineRect(range)
  if (!rect) return
  scrollByDelta(scrollDeltaForMatch(rect, stickyCoverBottom(root), viewportBottom()))
}

export function revealElement(element: HTMLElement): void {
  const editor = element.closest('.ProseMirror')
  const root = editor instanceof HTMLElement ? editor : element
  const apply = () => {
    if (!element.isConnected) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    scrollByDelta(rect.top - (stickyCoverBottom(root) + MATCH_PAD))
  }
  apply()
  cancelAnimationFrame(revealFrame)
  revealFrame = requestAnimationFrame(apply)
}

// The find bar is sticky, so scrollIntoView's viewport center can leave the
// match underneath it. Scroll the match itself into the clear band, then
// correct again after the browser's own selection reveal.
function revealMatch(range: Range, root: HTMLElement): void {
  scrollMatchIntoView(range, root)
  cancelAnimationFrame(revealFrame)
  revealFrame = requestAnimationFrame(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return
    scrollMatchIntoView(selection.getRangeAt(0), root)
  })
}

// Search only this editor, including matches spanning inline formatting nodes.
// window.find searches the whole page (including the search form itself).
export function findInRoot(root: HTMLElement | null, search: string, fromStart: boolean): boolean {
  if (!root || !search) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let text = ''
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    nodes.push({ node, start: text.length })
    text += node.data
  }
  const selection = window.getSelection()
  let start = 0
  if (!fromStart && selection?.rangeCount) {
    const range = selection.getRangeAt(0)
    const found = nodes.find(item => item.node === range.endContainer)
    if (found) start = found.start + range.endOffset
  }
  const source = text.toLocaleLowerCase()
  const needle = search.toLocaleLowerCase()
  let index = source.indexOf(needle, start)
  if (index < 0 && start > 0) index = source.indexOf(needle)
  if (index < 0) return false
  const first = nodes.find(item => item.start + item.node.length > index)
  const last = nodes.find(item => item.start + item.node.length >= index + search.length)
  if (!first || !last) return false
  const range = document.createRange()
  range.setStart(first.node, index - first.start)
  range.setEnd(last.node, index + search.length - last.start)
  root.focus({ preventScroll: true })
  selection?.removeAllRanges()
  selection?.addRange(range)
  revealMatch(range, root)
  return true
}
