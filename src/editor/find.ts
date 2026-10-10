import { decodeWildcard } from './wildcards'

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

const OBJECT = '\uFFFC'
const BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE)$/

interface DomPoint {
  kind: 'char'
  node: Text
  offset: number
}

interface DomLine {
  text: string
  block: HTMLElement
  points: DomPoint[]
}

function blankLine(block: HTMLElement): DomLine {
  return { text: '', block, points: [] }
}

function inlineLines(el: HTMLElement): DomLine[] {
  const lines: DomLine[] = [blankLine(el)]
  let meaningful = false
  let brs = 0
  const current = () => lines[lines.length - 1]!
  const visit = (node: Node) => {
    if (node instanceof HTMLBRElement) {
      brs += 1
      lines.push(blankLine(el))
      return
    }
    if (node instanceof HTMLImageElement) {
      meaningful = true
      current().text += OBJECT
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const data = node.textContent ?? ''
      for (let i = 0; i < data.length; i += 1) {
        if (data[i] === '\uFEFF') continue
        meaningful = true
        current().text += data[i]
        current().points.push({ kind: 'char', node: node as Text, offset: i })
      }
      return
    }
    node.childNodes.forEach(visit)
  }
  el.childNodes.forEach(visit)
  if (!meaningful) return Array.from({ length: Math.max(1, brs) }, () => blankLine(el))
  return lines
}

function linesOf(el: HTMLElement): DomLine[] {
  const blocks = [...el.children].filter((child): child is HTMLElement => child instanceof HTMLElement && BLOCK.test(child.tagName))
  if (blocks.length) return blocks.flatMap((child) => linesOf(child))
  return inlineLines(el)
}

function domLines(root: HTMLElement): DomLine[] {
  return [...root.children].flatMap((el) => (el instanceof HTMLElement ? linesOf(el) : []))
}

export function domSearchText(root: HTMLElement): string {
  return domLines(root).map((line) => line.text).join('\n')
}

function endOfLine(line: DomLine): { node: Node; offset: number } {
  if (!line.points.length) return { node: line.block, offset: 0 }
  const last = line.points[line.points.length - 1]!
  return { node: last.node, offset: last.offset + 1 }
}

function endpoint(lines: DomLine[], index: number): { node: Node; offset: number } {
  let cursor = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (index <= cursor + line.text.length) {
      const local = index - cursor
      if (!line.points.length) return { node: line.block, offset: 0 }
      if (local >= line.points.length) return endOfLine(line)
      const point = line.points[local]!
      return { node: point.node, offset: point.offset }
    }
    cursor += line.text.length
    if (i < lines.length - 1) {
      if (index === cursor) return endOfLine(line)
      cursor += 1
    }
  }
  const last = lines[lines.length - 1]
  return last ? endOfLine(last) : { node: lines[0]!.block, offset: 0 }
}

export function selectionTapeIndex(root: HTMLElement | null): number {
  if (!root) return 0
  const selection = window.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return 0
  const range = selection.getRangeAt(0)
  const lines = domLines(root)
  let cursor = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (!line.points.length && line.block.contains(range.startContainer)) {
      const owned = lines.some((other) =>
        other.points.some((point) => point.node === range.startContainer),
      )
      if (!owned) return cursor
    }
    for (const point of line.points) {
      if (point.node === range.startContainer && point.offset === range.startOffset) return cursor
      cursor += 1
    }
    if (line.points.length) {
      const tail = line.points[line.points.length - 1]!
      if (tail.node === range.startContainer && range.startOffset === tail.offset + 1) return cursor
    }
    if (i < lines.length - 1) cursor += 1
  }
  return 0
}

function findWithBreaks(root: HTMLElement, search: string, fromStart: boolean): boolean {
  const needle = decodeWildcard(search, true).needle
  if (!needle) return false
  const lines = domLines(root)
  if (!lines.length) return false
  const text = lines.map((line) => line.text).join('\n')
  const source = text.toLocaleLowerCase()
  const folded = needle.toLocaleLowerCase()
  if (source.length !== text.length || folded.length !== needle.length) return false
  const selection = window.getSelection()
  let start = 0
  if (!fromStart && selection?.rangeCount && root.contains(selection.anchorNode)) {
    start = selectionTapeIndex(root)
  }
  let index = source.indexOf(folded, start)
  if (index < 0 && start > 0) index = source.indexOf(folded)
  if (index < 0) return false
  const range = document.createRange()
  const from = endpoint(lines, index)
  const to = endpoint(lines, index + folded.length)
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  root.focus({ preventScroll: true })
  selection?.removeAllRanges()
  selection?.addRange(range)
  if (matchLineRect(range)) revealMatch(range, root)
  else {
    let cursor = 0
    let block = lines[0]?.block ?? root
    for (const line of lines) {
      if (index <= cursor + line.text.length) {
        block = line.block
        break
      }
      cursor += line.text.length + 1
    }
    revealElement(block)
  }
  return true
}

// Search only this editor, including matches spanning inline formatting nodes.
// window.find searches the whole page (including the search form itself).
export function findInRoot(root: HTMLElement | null, search: string, fromStart: boolean, wildcards = false): boolean {
  if (!root || !search) return false
  if (wildcards) return findWithBreaks(root, search, fromStart)
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
