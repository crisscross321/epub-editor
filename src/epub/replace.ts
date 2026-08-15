import type { TiptapDoc, TiptapNode } from '../types/book'

export function replaceAllInDoc(
  doc: TiptapDoc,
  search: string,
  replacement: string,
): { doc: TiptapDoc; count: number } {
  if (!search) return { doc, count: 0 }
  let count = 0
  const walk = (node: TiptapNode): TiptapNode => {
    if (node.type === 'text' && node.text && node.text.indexOf(search) !== -1) {
      const parts = node.text.split(search)
      count += parts.length - 1
      return { ...node, text: parts.join(replacement) }
    }
    if (!node.content) return node
    return { ...node, content: node.content.map(walk) }
  }
  return { doc: { type: 'doc', content: doc.content?.map(walk) }, count }
}

export function countInDoc(doc: TiptapDoc, search: string): number {
  return replaceAllInDoc(doc, search, search).count
}
