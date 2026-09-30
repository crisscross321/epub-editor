import type { TiptapDoc } from '../types/book'
import { textFromDoc, textFromHtml } from '../content/text'

export interface PlainChapter {
  title: string
  body: string
  part?: string
}

export function chapterToPlain(title: string, htmlOrDoc: string | TiptapDoc): string {
  const body = typeof htmlOrDoc === 'string' ? textFromHtml(htmlOrDoc) : textFromDoc(htmlOrDoc).replace(/\n+/g, '\n')
  return [title.trim(), body.trim()].filter(Boolean).join('\n\n')
}

export function chaptersToPlain(chapters: PlainChapter[]): string {
  return chapters
    .map((ch) => {
      const text = chapterToPlain(ch.title, ch.body)
      return ch.part ? `${ch.part.trim()}\n\n\n${text}` : text
    })
    .join('\n\n\n')
}

export function chaptersToMarkdown(chapters: PlainChapter[]): string {
  const nested = chapters.some((ch) => ch.part)
  return chapters
    .map((ch) => {
      const title = ch.title.trim() || '未命名'
      const heading = nested ? `## ${title}` : `# ${title}`
      const body = ch.body.trim()
      const block = body ? `${heading}\n\n${body}` : heading
      return ch.part ? `# ${ch.part.trim()}\n\n${block}` : block
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
