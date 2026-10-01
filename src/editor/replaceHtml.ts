import { leadingChapterTitle } from './selectAll'

/**
 * Chrome merges blocks into the heading when insertHTML starts inside an h1.
 * A leading U+FEFF is outside that heading, so the inserted blocks stay siblings.
 * The mark is not an undo step of its own: one undo restores the previous chapter,
 * and U+FEFF is stripped wherever text is trimmed.
 */
const LEADING_MARK = '\uFEFF'

export function replaceEditorHtml(root: HTMLElement, html: string): void {
  root.focus({ preventScroll: true })
  const range = document.createRange()
  const title = leadingChapterTitle(root)
  if (title) {
    const marker = document.createTextNode(LEADING_MARK)
    root.insertBefore(marker, title)
    range.setStart(marker, 0)
    range.setEnd(root, root.childNodes.length)
  } else {
    range.selectNodeContents(root)
  }
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('insertHTML', false, html)
}
