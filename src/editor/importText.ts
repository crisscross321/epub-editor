import { inferKind, parseChapterTitle, parsePartTitle, resolveOrdinals } from '../epub/parts'
import type { ChapterKind, ChapterNumbering, PartWord, TiptapDoc, TiptapNode } from '../types/book'

export interface ImportedChapter {
  title: string
  doc: TiptapDoc
  kind?: ChapterKind
  part?: number
}

export interface ImportedText {
  chapters: ImportedChapter[]
  parts: { title: string }[]
  partWord?: PartWord
  chapterNumbering?: ChapterNumbering
}

const NUM = '[0-9０-９零〇一二两三四五六七八九十百千]+'
const HEADING_LINE = new RegExp(
  `^(第[^\\n]{0,12}章[^\\n]*|(?:第\\s*${NUM}\\s*(?:部分|[册卷部篇])|[卷册]\\s*${NUM}|序章|序幕|楔子|引子|序言|前言|尾声|终章|后记|番外|间章)(?=$|[\\s:：、.．·\\-—])[^\\n]{0,40})$`,
  'gm',
)

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

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function structureImportedText(raw: string, filename = ''): ImportedText {
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return { chapters: [{ title: '', doc: textToDoc('') }], parts: [] }

  const mdName = /\.md$/i.test(filename)
  const mdChapters = splitByHeading(text, /^#{1,2}\s+(.+)$/gm)
  const ordinalChapters = splitByHeading(text, HEADING_LINE)

  const chunks =
    mdName || (mdChapters.length > 1 && mdChapters.length >= ordinalChapters.length)
      ? mdChapters
      : ordinalChapters.length > 1
        ? ordinalChapters
        : [{ title: '', body: text }]

  const parts: { title: string }[] = []
  const words: PartWord[] = []
  let current: { index: number; number: number } | undefined
  const out: ImportedChapter[] = []
  const openPart = (title: string, number: number) => {
    parts.push({ title })
    current = { index: parts.length - 1, number }
  }

  chunks.forEach((chunk, i) => {
    const title = chunk.title.replace(/^#+\s*/, '').trim()
    const part = parsePartTitle(title)
    if (part) {
      words.push(part.word)
      if (!parseChapterTitle(part.rest)) {
        openPart(part.rest, part.number)
        if (chunk.body.trim()) out.push({ title: '引言', doc: textToDoc(chunk.body), kind: 'unnumbered', part: current!.index })
        return
      }
      if (!current || current.number !== part.number) openPart('', part.number)
      out.push({ title: part.rest, doc: textToDoc(chunk.body), part: current!.index })
      return
    }
    const preface = !title && i === 0 && chunks.length > 1
    out.push({
      title: preface ? '前言' : title,
      doc: textToDoc(chunk.body),
      kind: preface ? 'unnumbered' : inferKind(title),
      part: current?.index,
    })
  })
  if (out.length === 0) out.push({ title: '', doc: textToDoc(''), part: current?.index })

  const resolved = resolveOrdinals(
    out.map((ch) => ({ ...ch, partId: ch.part === undefined ? undefined : String(ch.part) })),
    parts.length > 0,
  )
  return {
    chapters: resolved.items.map(({ partId: _partId, ...ch }) => ch),
    parts,
    partWord: mostCommon(words),
    chapterNumbering: parts.length ? resolved.numbering : undefined,
  }
}

export function splitImportedText(raw: string, filename = ''): ImportedChapter[] {
  return structureImportedText(raw, filename).chapters
}
