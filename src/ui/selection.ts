export const LONG_PRESS_MS = 480

export function toggleSelected(selected: Iterable<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function nextStarred(
  books: { id: string; starred?: boolean }[],
  ids: string[],
): boolean {
  const targets = books.filter((book) => ids.includes(book.id))
  if (targets.length === 0) return true
  return !targets.every((book) => book.starred)
}
