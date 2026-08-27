export type Route =
  | { name: 'shelf' }
  | { name: 'chapters'; bookId: string }
  | { name: 'editor'; bookId: string; chapterId: string; from?: 'preview' | 'chapters' }
  | { name: 'preview'; bookId: string; chapterId?: string; from?: 'editor' | 'chapters' }
  | { name: 'settings'; bookId?: string }
  | { name: 'info'; bookId: string }

export function editorBackRoute(
  route: Extract<Route, { name: 'editor' }>,
): Extract<Route, { name: 'preview' | 'chapters' }> {
  if (route.from === 'preview') {
    return { name: 'preview', bookId: route.bookId, chapterId: route.chapterId }
  }
  return { name: 'chapters', bookId: route.bookId }
}

export function previewBackTarget(route: Extract<Route, { name: 'preview' }>): 'editor' | 'chapters' {
  return route.from === 'editor' ? 'editor' : 'chapters'
}
