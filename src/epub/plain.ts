import type { TiptapDoc } from '../types/book'
import { textFromDoc, textFromHtml } from '../content/text'

export function chapterToPlain(title: string, htmlOrDoc: string | TiptapDoc): string {
  const body = typeof htmlOrDoc === 'string' ? textFromHtml(htmlOrDoc) : textFromDoc(htmlOrDoc).replace(/\n+/g, '\n')
  return [title.trim(), body.trim()].filter(Boolean).join('\n\n')
}

export function chaptersToPlain(chapters: { title: string; body: string }[]): string {
  return chapters.map((ch) => chapterToPlain(ch.title, ch.body)).join('\n\n\n')
}

export function chaptersToMarkdown(chapters: { title: string; body: string }[]): string {
  return chapters
    .map((ch) => {
      const heading = ch.title.trim() ? `# ${ch.title.trim()}` : '# 未命名'
      const body = ch.body.trim()
      return body ? `${heading}\n\n${body}` : heading
    })
    .join('\n\n')
}

export function firstHeadingText(html: string): string {
  const match = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html)
  if (!match) return ''
  return textFromHtml(match[1] ?? '')
}

export function shouldRenderOuterTitle(html: string, heading: string): boolean {
  const inner = firstHeadingText(html)
  if (!inner) return true
  return inner.replace(/\s+/g, '') !== heading.replace(/\s+/g, '')
}
