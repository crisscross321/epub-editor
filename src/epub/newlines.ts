import type { TiptapDoc, TiptapMark, TiptapNode } from '../types/book'
import type { WildcardToken } from '../editor/wildcards'

const OBJECT = '\uFFFC'

type Run = { type: 'text'; text: string; marks?: TiptapMark[] } | { type: 'image'; node: TiptapNode }

interface SrcLine {
  chunk: number
  heading?: number
  runs: Run[]
}

interface Chunk {
  node: TiptapNode
  lineStart: number
  lineCount: number
}

type ContentAtom =
  | { k: 'c'; ch: string; marks?: TiptapMark[]; line: number }
  | { k: 'img'; node: TiptapNode; line: number }

type Atom = ContentAtom | { k: 'br'; left: number; right: number }

interface OutLine {
  runs: Run[]
  exact: number | null
  heading?: number
}

function marksOf(marks?: TiptapMark[]): TiptapMark[] | undefined {
  return marks?.length ? marks : undefined
}

function lineRuns(content: TiptapNode[] | undefined): Run[][] {
  const nodes = content ?? []
  const breaksOnly = nodes.length > 0 && nodes.every((node) => node.type === 'hardBreak')
  if (nodes.length === 0) return [[]]
  // A paragraph whose only child is the caret break is one blank line, not two.
  if (breaksOnly) return Array.from({ length: nodes.length === 1 ? 1 : nodes.length }, () => [])
  const lines: Run[][] = [[]]
  const add = (run: Run) => {
    const line = lines[lines.length - 1]!
    const prev = line[line.length - 1]
    if (
      run.type === 'text' &&
      prev?.type === 'text' &&
      JSON.stringify(prev.marks ?? []) === JSON.stringify(run.marks ?? [])
    ) {
      prev.text += run.text
      return
    }
    if (run.type === 'text' && !run.text) return
    line.push(run)
  }
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      lines.push([])
      continue
    }
    if (node.type === 'image') {
      add({ type: 'image', node })
      continue
    }
    if (node.type === 'text') add({ type: 'text', text: node.text ?? '', marks: marksOf(node.marks) })
  }
  return lines
}

function expand(node: TiptapNode): Array<{ heading?: number; runs: Run[] }> {
  if (node.type === 'heading') {
    const level = Number(node.attrs?.level ?? 1)
    return lineRuns(node.content).map((runs) => ({ heading: level, runs }))
  }
  if (node.type === 'paragraph') return lineRuns(node.content).map((runs) => ({ runs }))
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const lines: Array<{ heading?: number; runs: Run[] }> = []
    for (const item of node.content ?? []) {
      const children = item.content ?? []
      if (!children.length) lines.push({ runs: [] })
      else for (const child of children) lines.push(...expand(child))
    }
    return lines.length ? lines : [{ runs: [] }]
  }
  if (node.type === 'image') return [{ runs: [{ type: 'image', node }] }]
  const text = gather(node)
  return [{ runs: text ? [{ type: 'text', text }] : [] }]
}

function gather(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'image') return OBJECT
  return (node.content ?? []).map(gather).join('')
}

function collect(doc: TiptapDoc): { lines: SrcLine[]; chunks: Chunk[] } {
  const lines: SrcLine[] = []
  const chunks: Chunk[] = []
  for (const node of doc.content ?? []) {
    const drafts = expand(node)
    const lineStart = lines.length
    for (const draft of drafts) lines.push({ chunk: chunks.length, heading: draft.heading, runs: draft.runs })
    chunks.push({ node, lineStart, lineCount: drafts.length })
  }
  return { lines, chunks }
}

function linePlain(line: SrcLine): string {
  return line.runs.map((run) => (run.type === 'text' ? run.text : OBJECT)).join('')
}

export function docSearchText(doc: TiptapDoc): string {
  return collect(doc).lines.map(linePlain).join('\n')
}

function toAtoms(lines: SrcLine[]): Atom[] {
  const atoms: Atom[] = []
  lines.forEach((line, index) => {
    if (index > 0) atoms.push({ k: 'br', left: index - 1, right: index })
    for (const run of line.runs) {
      if (run.type === 'image') {
        atoms.push({ k: 'img', node: run.node, line: index })
        continue
      }
      for (let i = 0; i < run.text.length; i += 1) atoms.push({ k: 'c', ch: run.text[i]!, marks: run.marks, line: index })
    }
  })
  return atoms
}

function atomChar(atom: Atom): string {
  if (atom.k === 'br') return '\n'
  if (atom.k === 'img') return OBJECT
  return atom.ch
}

function tokensToAtoms(tokens: WildcardToken[]): Atom[] {
  const atoms: Atom[] = []
  for (const token of tokens) {
    if (token.type === 'break') {
      atoms.push({ k: 'br', left: -1, right: -1 })
      continue
    }
    for (let i = 0; i < token.text.length; i += 1) atoms.push({ k: 'c', ch: token.text[i]!, line: -1 })
  }
  return atoms
}

function runsFromAtoms(atoms: ContentAtom[]): Run[] {
  const runs: Run[] = []
  for (const atom of atoms) {
    if (atom.k === 'img') {
      runs.push({ type: 'image', node: atom.node })
      continue
    }
    if (atom.k !== 'c') continue
    const prev = runs[runs.length - 1]
    if (prev?.type === 'text' && JSON.stringify(prev.marks ?? []) === JSON.stringify(atom.marks ?? [])) {
      prev.text += atom.ch
      continue
    }
    const marks = marksOf(atom.marks)
    runs.push({ type: 'text', text: atom.ch, ...(marks ? { marks } : {}) })
  }
  return runs
}

function sameRuns(a: Run[], b: Run[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function exactLine(group: ContentAtom[], src: SrcLine[], openRight: number | null, closeLeft: number | null): number | null {
  if (!group.length) {
    const index =
      openRight != null && closeLeft != null && openRight === closeLeft
        ? openRight
        : openRight == null && closeLeft === 0
          ? 0
          : closeLeft == null && openRight === src.length - 1
            ? openRight
            : openRight == null && closeLeft == null && src.length === 1
              ? 0
              : null
    if (index == null || !src[index] || src[index].runs.length) return null
    return index
  }
  const ids = [...new Set(group.map((atom) => atom.line))]
  if (ids.length !== 1 || ids[0]! < 0) return null
  const index = ids[0]!
  if (!src[index] || !sameRuns(runsFromAtoms(group), src[index].runs)) return null
  return index
}

function atomsToLines(atoms: Atom[], src: SrcLine[]): OutLine[] {
  const groups: ContentAtom[][] = [[]]
  const openRight: Array<number | null> = [null]
  const closeLeft: Array<number | null> = []
  for (const atom of atoms) {
    if (atom.k === 'br') {
      closeLeft.push(atom.left)
      groups.push([])
      openRight.push(atom.right)
      continue
    }
    groups[groups.length - 1]!.push(atom)
  }
  closeLeft.push(null)
  return groups.map((group, index) => {
    const exact = exactLine(group, src, openRight[index] ?? null, closeLeft[index] ?? null)
    const heading = exact != null ? src[exact]?.heading : undefined
    return { runs: runsFromAtoms(group), exact, heading }
  })
}

function toNode(line: OutLine): TiptapNode {
  const content = line.runs.map((run) =>
    run.type === 'image'
      ? run.node
      : { type: 'text', text: run.text, ...(run.marks ? { marks: run.marks } : {}) },
  )
  if (line.heading) {
    return { type: 'heading', attrs: { level: line.heading }, ...(content.length ? { content } : {}) }
  }
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function emit(outLines: OutLine[], src: SrcLine[], chunks: Chunk[]): TiptapNode[] {
  const nodes: TiptapNode[] = []
  let index = 0
  while (index < outLines.length) {
    const exact = outLines[index]?.exact
    if (exact != null) {
      const chunk = chunks[src[exact]!.chunk]
      const count = chunk?.lineCount ?? 0
      const intact =
        !!chunk &&
        chunk.lineStart === exact &&
        index + count <= outLines.length &&
        outLines.slice(index, index + count).every((line, offset) => line.exact === chunk.lineStart + offset)
      if (intact && chunk) {
        nodes.push(chunk.node)
        index += count
        continue
      }
    }
    nodes.push(toNode(outLines[index]!))
    index += 1
  }
  return nodes.length ? nodes : [{ type: 'paragraph' }]
}

export function replaceWithBreaks(
  doc: TiptapDoc,
  needle: string,
  replacement: WildcardToken[],
  options?: { from?: number; once?: boolean },
): { doc: TiptapDoc; count: number } {
  if (!needle) return { doc, count: 0 }
  const { lines, chunks } = collect(doc)
  const atoms = toAtoms(lines)
  const text = atoms.map(atomChar).join('')
  const spans: Array<[number, number]> = []
  let from = options?.from ?? 0
  let cursor = 0
  while (cursor <= text.length) {
    const at = text.indexOf(needle, cursor)
    if (at < 0) break
    const end = at + needle.length
    if (end <= from) {
      cursor = at + Math.max(needle.length, 1)
      continue
    }
    spans.push([at, end])
    if (options?.once) break
    from = -1
    cursor = end
  }
  if (!spans.length) return { doc, count: 0 }
  const next: Atom[] = []
  let prev = 0
  for (const [start, end] of spans) {
    next.push(...atoms.slice(prev, start), ...tokensToAtoms(replacement))
    prev = end
  }
  next.push(...atoms.slice(prev))
  return { doc: { type: 'doc', content: emit(atomsToLines(next, lines), lines, chunks) }, count: spans.length }
}
