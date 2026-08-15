import type { TiptapDoc, TiptapNode } from '../types/book'
import { headingText } from './toc'

export function isH1(node: TiptapNode | undefined): boolean {
  return !!node && node.type === 'heading' && Number(node.attrs?.level) === 1
}

function h1Node(title: string): TiptapNode {
  return {
    type: 'heading',
    attrs: { level: 1 },
    content: title ? [{ type: 'text', text: title }] : undefined,
  }
}

function withH1Text(node: TiptapNode, title: string): TiptapNode {
  return {
    ...node,
    content: title ? [{ type: 'text', text: title }] : undefined,
  }
}

export function withoutLeadingH1(doc: TiptapDoc): TiptapDoc {
  const content = [...(doc.content ?? [])]
  const first = content[0]
  if (isH1(first)) {
    content.shift()
  }
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

export function withChapterHeading(doc: TiptapDoc, title: string): TiptapDoc {
  const stripped = withoutLeadingH1(doc)
  return {
    type: 'doc',
    content: [h1Node(title), ...(stripped.content ?? [])],
  }
}

export function stripChapterOrdinal(text: string): string {
  return text
    .replace(/^\s*第\s*[0-9０-９一二三四五六七八九十百千零〇两]+\s*章[：:、.\s]*/u, '')
    .trim()
}

export function displayChapterName(title: string): string {
  const trimmed = title.trim()
  if (/^第 \d+ 章$/.test(trimmed)) return ''
  return trimmed
}

export function exportChapterHeading(index: number, title: string): string {
  const name = displayChapterName(title)
  return name ? `第 ${index + 1} 章 ${name}` : `第 ${index + 1} 章`
}

export interface ChapterSlice {
  title: string
  doc: TiptapDoc
}

export function splitDocByH1(doc: TiptapDoc, fallbackTitle: string): ChapterSlice[] {
  const nodes = doc.content ?? []
  const fallback = displayChapterName(fallbackTitle)
  if (nodes.length === 0) {
    return [{ title: fallback, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }]
  }

  const slices: { title: string; nodes: TiptapNode[] }[] = []
  let current: { title: string; nodes: TiptapNode[] } | null = null

  const start = (title: string, first?: TiptapNode) => {
    current = { title, nodes: first ? [first] : [] }
    slices.push(current)
  }

  for (const node of nodes) {
    if (isH1(node)) {
      const title = stripChapterOrdinal(headingText(node))
      const heading = withH1Text(node, title)
      if (!current) {
        start(title, heading)
      } else if (current.nodes.length === 0) {
        current.title = title
        current.nodes.push(heading)
      } else {
        start(title, heading)
      }
    } else {
      if (!current) start(fallback)
      current!.nodes.push(node)
    }
  }

  return slices.map((slice) => ({
    title: slice.title,
    doc: {
      type: 'doc',
      content: slice.nodes.length ? slice.nodes : [{ type: 'paragraph' }],
    },
  }))
}

export function ensureLeadingH1(doc: TiptapDoc, title: string): TiptapDoc {
  const name = displayChapterName(title)
  const content = doc.content ?? []
  if (isH1(content[0]) || !name) {
    return {
      type: 'doc',
      content: content.length ? content : [{ type: 'paragraph' }],
    }
  }
  return {
    type: 'doc',
    content: [h1Node(name), ...content],
  }
}
