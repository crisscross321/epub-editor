import type { TiptapDoc, TiptapNode } from '../types/book'
import { parseHtml } from '../epub/xml'

export function textFromNode(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(textFromNode).join('')
}

export function textFromDoc(doc: TiptapDoc): string {
  return (doc.content ?? []).map(textFromNode).join('\n')
}

export function textFromHtml(html: string): string {
  return (parseHtml(html).body?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function countChars(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0
  const latin = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .match(/[A-Za-z0-9]+/g)?.length ?? 0
  return cjk + latin
}

export function snippetAround(text: string, index: number, query: string, radius = 18): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

export interface TextHit {
  index: number
  snippet: string
}

export function findHits(text: string, query: string): TextHit[] {
  if (!query) return []
  const hits: TextHit[] = []
  let from = 0
  while (from < text.length) {
    const index = text.indexOf(query, from)
    if (index < 0) break
    hits.push({ index, snippet: snippetAround(text, index, query) })
    from = index + Math.max(query.length, 1)
  }
  return hits
}

export function readingMinutes(chars: number, perMinute = 400): number {
  if (chars <= 0) return 0
  return Math.max(1, Math.round(chars / perMinute))
}
