export function moveCaretToStart(root: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

type FindFn = (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean

function browserFind(text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean): boolean {
  const finder = (window as Window & { find?: FindFn }).find
  if (typeof finder !== 'function') return false
  return finder.call(window, text, caseSensitive, backwards, wrap)
}

export function findInRoot(
  root: HTMLElement | null,
  search: string,
  fromStart: boolean,
  findFn: FindFn = browserFind,
): boolean {
  if (!search || !root) return false
  if (fromStart) moveCaretToStart(root)
  if (findFn(search, false, false, false)) return true
  if (fromStart) return false
  moveCaretToStart(root)
  return findFn(search, false, false, false)
}
