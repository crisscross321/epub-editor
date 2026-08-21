import type { TiptapDoc, TiptapNode } from '../types/book'

export interface ImportedChapter {
  title: string
  doc: TiptapDoc
}

function paragraph(text: string): TiptapNode {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' }
}

function heading(level: number, text: string): TiptapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: text ? [{ type: 'text', text }] : undefined,
  }
}

export function textToDoc(body: string): TiptapDoc {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const content: TiptapNode[] = []
  let buffer: string[] = []
  const flush = () => {
    const text = buffer.join('\n').trim()
    buffer = []
    if (text) content.push(paragraph(text))
  }
  for (const line of lines) {
    const md = /^(#{1,3})\s+(.+)$/.exec(line.trim())
    if (md) {
      flush()
      content.push(heading(md[1]!.length, md[2]!.trim()))
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    buffer.push(line)
  }
  flush()
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function splitByHeading(raw: string, pattern: RegExp): { title: string; body: string }[] {
  const parts = raw.split(pattern)
  if (parts.length <= 1) return []
  const chapters: { title: string; body: string }[] = []
  let prefix = parts[0]!.trim()
  if (prefix) chapters.push({ title: '', body: prefix })
  for (let i = 1; i < parts.length; i += 2) {
    const title = (parts[i] ?? '').trim()
    const body = (parts[i + 1] ?? '').trim()
    chapters.push({ title, body })
  }
  return chapters.filter((ch) => ch.title || ch.body)
}

export function splitImportedText(raw: string, filename = ''): ImportedChapter[] {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return [{ title: '', doc: textToDoc('') }]

  const mdName = /\.md$/i.test(filename)
  const mdChapters = splitByHeading(text, /^#{1,2}\s+(.+)$/gm)
  const ordinalChapters = splitByHeading(text, /^(第[^\n]{0,12}章[^\n]*)$/gm)

  const chunks =
    mdName || (mdChapters.length > 1 && mdChapters.length >= ordinalChapters.length)
      ? mdChapters
      : ordinalChapters.length > 1
        ? ordinalChapters
        : [{ title: '', body: text }]

  return chunks.map((chunk) => ({
    title: chunk.title.replace(/^#+\s*/, '').trim(),
    doc: textToDoc(chunk.body),
  }))
}
