import type { TiptapNode } from '../types/book'
import { parseHtml, textOf } from './xml'

export interface TocHeading {
  level: 2 | 3
  id: string
  title: string
}

export function outlineFromXhtml(xhtml: string): TocHeading[] {
  const doc = parseHtml(xhtml)
  const out: TocHeading[] = []
  const nodes = doc.body ? Array.from(doc.body.querySelectorAll('h2,h3')) : []
  for (const el of nodes) {
    const id = el.getAttribute('id') || ''
    const title = textOf(el)
    if (!id || !title) continue
    const level = el.tagName.toLowerCase() === 'h3' ? 3 : 2
    out.push({ level, id, title })
  }
  return out
}

export function nestedNavHtml(
  chapterHref: string,
  chapterTitle: string,
  headings: TocHeading[],
  escapeXml: (s: string) => string,
): string {
  const href = escapeXml(chapterHref)
  if (headings.length === 0) {
    return `      <li><a href="${href}">${escapeXml(chapterTitle)}</a></li>`
  }
  const parts: string[] = [`      <li><a href="${href}">${escapeXml(chapterTitle)}</a><ol>`]
  let openH2 = false
  let openH3list = false
  const closeH3 = () => {
    if (openH3list) {
      parts.push('</ol>')
      openH3list = false
    }
  }
  const closeH2 = () => {
    closeH3()
    if (openH2) {
      parts.push('</li>')
      openH2 = false
    }
  }
  for (const heading of headings) {
    if (heading.level === 2) {
      closeH2()
      parts.push(
        `<li><a href="${href}#${escapeXml(heading.id)}">${escapeXml(heading.title)}</a>`,
      )
      openH2 = true
    } else {
      if (!openH2) {
        parts.push(`<li><a href="${href}">${escapeXml(chapterTitle)}</a>`)
        openH2 = true
      }
      if (!openH3list) {
        parts.push('<ol>')
        openH3list = true
      }
      parts.push(`<li><a href="${href}#${escapeXml(heading.id)}">${escapeXml(heading.title)}</a></li>`)
    }
  }
  closeH2()
  parts.push('</ol></li>')
  return parts.join('')
}

export function headingText(node: TiptapNode): string {
  const parts: string[] = []
  const walk = (n: TiptapNode) => {
    if (n.type === 'text' && n.text) parts.push(n.text)
    n.content?.forEach(walk)
  }
  walk(node)
  return parts.join('').trim()
}
