import type { TiptapDoc, TiptapMark, TiptapNode } from '../types/book'
import { parseHtml } from './xml'

const SKIP = new Set(['script', 'style', 'svg', 'video', 'audio', 'head'])

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

function headingLevel(tag: string): number | null {
  const match = /^h([1-6])$/.exec(tag)
  return match ? Number(match[1]) : null
}

function inlineChildren(el: Element, resolveHref: (src: string) => string, marks: TiptapMark[]): TiptapNode[] {
  const out: TiptapNode[] = []
  el.childNodes.forEach((child) => {
    out.push(...inlineNodes(child, resolveHref, marks))
  })
  return mergeText(out)
}

function mergeText(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (
      node.type === 'text' &&
      prev?.type === 'text' &&
      JSON.stringify(prev.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      prev.text = `${prev.text ?? ''}${node.text ?? ''}`
    } else {
      out.push(node)
    }
  }
  return out
}

function inlineNodes(node: Node, resolveHref: (src: string) => string, marks: TiptapMark[]): TiptapNode[] {
  if (isText(node)) {
    const text = node.textContent ?? ''
    if (!text) return []
    return [{ type: 'text', text, marks: marks.length ? marks : undefined }]
  }
  if (!isElement(node)) return []
  const tag = node.tagName.toLowerCase()
  if (SKIP.has(tag)) return []
  if (tag === 'br') {
    return [{ type: 'hardBreak' }]
  }
  if (tag === 'img') {
    const src = node.getAttribute('src') ?? ''
    const resolved = resolveHref(src)
    if (!resolved) return []
    return [
      {
        type: 'image',
        attrs: { src: resolved, alt: node.getAttribute('alt') ?? '' },
      },
    ]
  }
  let nextMarks = marks
  if (tag === 'strong' || tag === 'b') nextMarks = [...marks, { type: 'bold' }]
  if (tag === 'em' || tag === 'i') nextMarks = [...marks, { type: 'italic' }]
  return inlineChildren(node, resolveHref, nextMarks)
}

function paragraphLike(el: Element, resolveHref: (src: string) => string): TiptapNode {
  const content = inlineChildren(el, resolveHref, [])
  return {
    type: 'paragraph',
    content: content.length ? content : undefined,
  }
}

function list(el: Element, type: 'bulletList' | 'orderedList', resolveHref: (src: string) => string): TiptapNode {
  const items: TiptapNode[] = []
  el.childNodes.forEach((child) => {
    if (!isElement(child)) return
    if (child.tagName.toLowerCase() !== 'li') return
    const blocks = blockNodes(child, resolveHref)
    const content = blocks.length ? blocks : [paragraphLike(child, resolveHref)]
    items.push({ type: 'listItem', content })
  })
  return { type, content: items }
}

function blockNodes(el: Element, resolveHref: (src: string) => string): TiptapNode[] {
  const out: TiptapNode[] = []
  const flushTextish = (nodes: Node[]) => {
    if (nodes.length === 0) return
    const wrapper = el.ownerDocument.createElement('p')
    nodes.forEach((n) => wrapper.appendChild(n.cloneNode(true)))
    const para = paragraphLike(wrapper, resolveHref)
    if (para.content?.some((n) => n.type === 'text' && (n.text ?? '').trim()) || para.content?.some((n) => n.type === 'image')) {
      out.push(para)
    }
  }

  let buffer: Node[] = []
  el.childNodes.forEach((child) => {
    if (isText(child)) {
      if ((child.textContent ?? '').trim()) buffer.push(child)
      return
    }
    if (!isElement(child)) return
    const tag = child.tagName.toLowerCase()
    if (SKIP.has(tag)) return

    const level = headingLevel(tag)
    if (level) {
      flushTextish(buffer)
      buffer = []
      out.push({
        type: 'heading',
        attrs: { level },
        content: inlineChildren(child, resolveHref, []),
      })
      return
    }
    if (tag === 'p') {
      flushTextish(buffer)
      buffer = []
      out.push(paragraphLike(child, resolveHref))
      return
    }
    if (tag === 'ul') {
      flushTextish(buffer)
      buffer = []
      out.push(list(child, 'bulletList', resolveHref))
      return
    }
    if (tag === 'ol') {
      flushTextish(buffer)
      buffer = []
      out.push(list(child, 'orderedList', resolveHref))
      return
    }
    if (tag === 'table') {
      flushTextish(buffer)
      buffer = []
      child.querySelectorAll('th,td').forEach((cell) => {
        out.push(paragraphLike(cell, resolveHref))
      })
      return
    }
    if (tag === 'img' || tag === 'br' || tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i' || tag === 'a' || tag === 'span') {
      buffer.push(child)
      return
    }
    flushTextish(buffer)
    buffer = []
    out.push(...blockNodes(child, resolveHref))
  })
  flushTextish(buffer)
  return out
}

export function simplifyXhtml(xhtml: string, resolveHref: (src: string) => string): TiptapDoc {
  const doc = parseHtml(xhtml)
  const root = doc.body ?? doc.documentElement
  const content = blockNodes(root, resolveHref)
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

export function emptyDoc(): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}
