export function moveCaretToStart(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
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
  first.node.parentElement?.scrollIntoView({ block: 'center' })
  return true
}
