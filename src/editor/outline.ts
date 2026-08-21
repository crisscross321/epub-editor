import type { TiptapDoc } from '../types/book'
import { textFromNode } from '../content/text'

export interface OutlineItem {
  index: number
  level: number
  title: string
}

export function outlineFromDoc(doc: TiptapDoc): OutlineItem[] {
  const items: OutlineItem[] = []
  ;(doc.content ?? []).forEach((node, index) => {
    if (node.type !== 'heading') return
    const title = textFromNode(node).trim()
    if (!title) return
    items.push({
      index,
      level: Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1))),
      title,
    })
  })
  return items
}
