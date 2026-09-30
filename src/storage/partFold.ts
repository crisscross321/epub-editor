const PREFIX = 'sujian.partFold.'

export function loadPartFold(bookId: string): string[] | null {
  try {
    const raw = localStorage.getItem(PREFIX + bookId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

export function savePartFold(bookId: string, collapsed: Iterable<string>): void {
  try {
    localStorage.setItem(PREFIX + bookId, JSON.stringify([...collapsed]))
  } catch {
    /* fold state is optional */
  }
}

export function clearPartFold(bookId: string): void {
  try {
    localStorage.removeItem(PREFIX + bookId)
  } catch {
    /* fold state is optional */
  }
}

export function initialCollapsed(
  partIds: string[],
  stored: string[] | null,
  focusPartId: string | undefined,
): Set<string> {
  const known = new Set(partIds)
  const collapsed = stored
    ? new Set(stored.filter((id) => known.has(id)))
    : new Set(partIds.filter((id) => id !== (focusPartId ?? partIds[0])))
  if (focusPartId) collapsed.delete(focusPartId)
  return collapsed
}
