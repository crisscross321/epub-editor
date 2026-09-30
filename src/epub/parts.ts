import type {
  BookPart,
  BookRecord,
  ChapterIndex,
  ChapterKind,
  ChapterNumbering,
  PartWord,
} from '../types/book'
import { displayChapterName, exportChapterHeading } from './headings'

export const DEFAULT_PART_WORD: PartWord = '册'
export const PART_WORDS: readonly PartWord[] = ['册', '卷', '部', '部分', '篇']

type PartsBook = Pick<BookRecord, 'chapters' | 'parts' | 'partWord' | 'chapterNumbering'>

export function partWordOf(book: Pick<BookRecord, 'partWord'>): PartWord {
  return book.partWord ?? DEFAULT_PART_WORD
}

export function kindOf(chapter: Pick<ChapterIndex, 'kind'>): ChapterKind {
  return chapter.kind ?? 'chapter'
}

export function sortChapters(chapters: readonly ChapterIndex[]): ChapterIndex[] {
  return [...chapters].sort((a, b) => a.spineIndex - b.spineIndex)
}

function reindex(chapters: ChapterIndex[]): ChapterIndex[] {
  return chapters.map((ch, spineIndex) => (ch.spineIndex === spineIndex ? ch : { ...ch, spineIndex }))
}

export function withPart(chapter: ChapterIndex, partId: string | undefined): ChapterIndex {
  if (chapter.partId === partId) return chapter
  const { partId: _old, ...rest } = chapter
  return partId ? { ...rest, partId } : rest
}

export function withKind(chapter: ChapterIndex, kind: ChapterKind): ChapterIndex {
  const { kind: _old, ...rest } = chapter
  return kind === 'chapter' ? rest : { ...rest, kind }
}

// ---------- Numerals ----------

const CN_DIGITS = '零一二三四五六七八九'
const CN_VALUE: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

export function chineseNumber(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 10000) return String(n)
  const units = ['', '十', '百', '千']
  const digits = String(n).split('').map(Number)
  let out = ''
  let zero = false
  digits.forEach((d, i) => {
    if (d === 0) {
      zero = out !== ''
      return
    }
    if (zero) out += '零'
    zero = false
    out += CN_DIGITS[d]! + units[digits.length - 1 - i]!
  })
  return out.startsWith('一十') ? out.slice(1) : out
}

export function parseOrdinal(raw: string): number | undefined {
  const s = raw.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  if (!s) return undefined
  if (/^\d+$/.test(s)) return Number(s) || undefined
  const chars = [...s]
  if (!chars.some((c) => c in CN_UNIT)) {
    let value = 0
    for (const c of chars) {
      if (!(c in CN_VALUE)) return undefined
      value = value * 10 + CN_VALUE[c]!
    }
    return value || undefined
  }
  let total = 0
  let current = 0
  for (const c of chars) {
    if (c in CN_VALUE) current = CN_VALUE[c]!
    else if (c in CN_UNIT) {
      total += (current || 1) * CN_UNIT[c]!
      current = 0
    } else return undefined
  }
  return total + current || undefined
}

// ---------- Title recognition ----------

const NUM = '[0-9０-９零〇一二两三四五六七八九十百千]+'
const SEP = '[\\s:：、.．·\\-—]*'
const PART_PREFIX = new RegExp(
  `^\\s*(?:第\\s*(${NUM})\\s*(部分|[册卷部篇])|(卷|册)\\s*(${NUM})(?![0-9０-９]))${SEP}`,
  'u',
)
const CHAPTER_PREFIX = new RegExp(`^\\s*第\\s*(${NUM})\\s*章${SEP}`, 'u')

const UNNUMBERED_EXACT =
  /^(序|序言|自序|代序|前言|引言|卷首语|楔子|引子|序章|序幕|尾声|终章|后记|跋|封面|版权|版权页|版权信息|目录|扉页|献词|致谢|简介|内容简介|作者简介|作者的话|写在前面)$/u
const UNNUMBERED_PREFIX = /^(序章|序幕|楔子|引子|尾声|终章|番外|外传|间章|后记)/u
const UNNUMBERED_EN =
  /^(prologue|epilogue|preface|foreword|introduction|afterword|acknowledge?ments|cover|copyright|contents|table of contents|title page|dedication)\b/i

export function parsePartTitle(title: string): { number: number; word: PartWord; rest: string } | undefined {
  const match = PART_PREFIX.exec(title)
  if (!match) return undefined
  const number = parseOrdinal(match[1] ?? match[4] ?? '')
  if (!number) return undefined
  const word = (match[2] ?? match[3]) as PartWord
  return { number, word, rest: title.slice(match[0].length).trim() }
}

export function parseChapterTitle(title: string): { number: number; rest: string } | undefined {
  const match = CHAPTER_PREFIX.exec(title)
  if (!match) return undefined
  const number = parseOrdinal(match[1] ?? '')
  if (!number) return undefined
  return { number, rest: title.slice(match[0].length).trim() }
}

export function inferKind(title: string): ChapterKind {
  const t = title.trim()
  if (!t) return 'chapter'
  if (UNNUMBERED_EXACT.test(t) || UNNUMBERED_PREFIX.test(t) || UNNUMBERED_EN.test(t)) return 'unnumbered'
  const part = parsePartTitle(t)
  if (part && !parseChapterTitle(part.rest)) return 'unnumbered'
  return 'chapter'
}

// ---------- Invariant: chapters of one part stay contiguous ----------

export function normalizeParts<T extends PartsBook>(book: T): T {
  const parts = book.parts ?? []
  const rank = new Map(parts.map((part, i) => [part.id, i]))
  const fixed = new Map<string, string | undefined>()
  let prev = -1
  for (const ch of sortChapters(book.chapters)) {
    let r = ch.partId !== undefined && rank.has(ch.partId) ? rank.get(ch.partId)! : -1
    if (r < prev) r = prev
    prev = r
    const partId = r < 0 ? undefined : parts[r]!.id
    if (partId !== ch.partId) fixed.set(ch.id, partId)
  }
  if (fixed.size === 0) return book
  return {
    ...book,
    chapters: book.chapters.map((ch) => (fixed.has(ch.id) ? withPart(ch, fixed.get(ch.id)) : ch)),
  }
}

function rankFn(book: PartsBook): (ch: ChapterIndex | undefined) => number {
  const rank = new Map((book.parts ?? []).map((part, i) => [part.id, i]))
  return (ch) => (ch?.partId !== undefined ? (rank.get(ch.partId) ?? -1) : -1)
}

// ---------- Labels ----------

export function formatPartHeading(index: number, title: string, word: PartWord): string {
  const name = title.trim()
  const label = `第${chineseNumber(index + 1)}${word}`
  return name ? `${label} ${name}` : label
}

export function unnumberedHeading(title: string): string {
  return displayChapterName(title) || '未命名'
}

export interface PartGroup {
  part?: BookPart
  heading: string
  chapters: ChapterIndex[]
  range?: [number, number]
}

export interface BookOutline {
  chapters: ChapterIndex[]
  groups: PartGroup[]
  headings: Map<string, string>
  numbers: Map<string, number>
  groupOf: Map<string, PartGroup>
}

export function bookOutline(input: PartsBook): BookOutline {
  const book = normalizeParts(input)
  const parts = book.parts ?? []
  const word = partWordOf(book)
  const perPart = book.chapterNumbering === 'perPart' && parts.length > 0
  const head: PartGroup = { heading: '', chapters: [] }
  const partGroups: PartGroup[] = parts.map((part, i) => ({
    part,
    heading: formatPartHeading(i, part.title, word),
    chapters: [],
  }))
  const byId = new Map(parts.map((part, i) => [part.id, partGroups[i]!]))
  const chapters = sortChapters(book.chapters)
  const headings = new Map<string, string>()
  const numbers = new Map<string, number>()
  const groupOf = new Map<string, PartGroup>()
  let n = 0
  let current: PartGroup | undefined
  for (const ch of chapters) {
    const group = (ch.partId && byId.get(ch.partId)) || head
    if (perPart && group !== current) n = 0
    current = group
    group.chapters.push(ch)
    groupOf.set(ch.id, group)
    if (kindOf(ch) === 'chapter') {
      n += 1
      numbers.set(ch.id, n)
      headings.set(ch.id, exportChapterHeading(n - 1, ch.title))
      group.range = [group.range?.[0] ?? n, n]
    } else {
      headings.set(ch.id, unnumberedHeading(ch.title))
    }
  }
  const groups = head.chapters.length || partGroups.length === 0 ? [head, ...partGroups] : partGroups
  return { chapters, groups, headings, numbers, groupOf }
}

export function chapterHeading(book: PartsBook, chapterId: string): string {
  return bookOutline(book).headings.get(chapterId) ?? ''
}

// ---------- Chapter operations ----------

export function insertChapters<T extends PartsBook>(book: T, afterId: string, created: ChapterIndex[]): T {
  const sorted = sortChapters(book.chapters)
  const afterIndex = sorted.findIndex((ch) => ch.id === afterId)
  const insertAt = afterIndex < 0 ? sorted.length : afterIndex + 1
  const anchor = afterIndex < 0 ? sorted.at(-1) : sorted[afterIndex]
  const placed = created.map((ch) => withPart(ch, anchor?.partId))
  return normalizeParts({
    ...book,
    chapters: reindex([...sorted.slice(0, insertAt), ...placed, ...sorted.slice(insertAt)]),
  })
}

export function removeChapter<T extends PartsBook>(book: T, chapterId: string): T {
  return { ...book, chapters: reindex(sortChapters(book.chapters).filter((ch) => ch.id !== chapterId)) }
}

type Step =
  | { type: 'swap'; with: number }
  | { type: 'cross'; partId: string | undefined }

function stepFor(book: PartsBook, chapterId: string, dir: -1 | 1): { sorted: ChapterIndex[]; index: number; step: Step } | undefined {
  const sorted = sortChapters(book.chapters)
  const index = sorted.findIndex((ch) => ch.id === chapterId)
  if (index < 0) return undefined
  const rankOf = rankFn(book)
  const r = rankOf(sorted[index])
  const neighbor = sorted[index + dir]
  if (neighbor && rankOf(neighbor) === r) return { sorted, index, step: { type: 'swap', with: index + dir } }
  const parts = book.parts ?? []
  const target = r + dir
  if (target < -1 || target >= parts.length) return undefined
  return { sorted, index, step: { type: 'cross', partId: target < 0 ? undefined : parts[target]!.id } }
}

export function canMoveChapter(book: PartsBook, chapterId: string, dir: -1 | 1): boolean {
  return Boolean(stepFor(normalizeParts(book), chapterId, dir))
}

export function moveChapterStep<T extends PartsBook>(input: T, chapterId: string, dir: -1 | 1): T {
  const book = normalizeParts(input)
  const found = stepFor(book, chapterId, dir)
  if (!found) return book
  const { sorted, index, step } = found
  if (step.type === 'cross') {
    return { ...book, chapters: book.chapters.map((ch) => (ch.id === chapterId ? withPart(ch, step.partId) : ch)) }
  }
  const next = [...sorted]
  next[index] = sorted[step.with]!
  next[step.with] = sorted[index]!
  return { ...book, chapters: reindex(next) }
}

export function moveChapterToIndex<T extends PartsBook>(input: T, chapterId: string, toIndex: number): T {
  const book = normalizeParts(input)
  const sorted = sortChapters(book.chapters)
  const item = sorted.find((ch) => ch.id === chapterId)
  if (!item) return book
  const rest = sorted.filter((ch) => ch.id !== chapterId)
  const target = Math.min(rest.length, Math.max(0, toIndex))
  const inherit = rest[target] ?? rest.at(-1)
  const moved = inherit ? withPart(item, inherit.partId) : item
  return normalizeParts({ ...book, chapters: reindex([...rest.slice(0, target), moved, ...rest.slice(target)]) })
}

export function canMergeChapters(a: ChapterIndex, b: ChapterIndex): boolean {
  return a.partId === b.partId && kindOf(a) === kindOf(b)
}

export function setChapterKind<T extends PartsBook>(book: T, chapterId: string, kind: ChapterKind): T {
  return { ...book, chapters: book.chapters.map((ch) => (ch.id === chapterId ? withKind(ch, kind) : ch)) }
}

// ---------- Part operations ----------

export function startPartAt<T extends PartsBook>(input: T, chapterId: string, part: BookPart): T {
  const book = normalizeParts(input)
  const sorted = sortChapters(book.chapters)
  const index = sorted.findIndex((ch) => ch.id === chapterId)
  if (index < 0) return book
  const rankOf = rankFn(book)
  const r = rankOf(sorted[index])
  const parts = book.parts ?? []
  const moving = new Set(sorted.slice(index).filter((ch) => rankOf(ch) === r).map((ch) => ch.id))
  return {
    ...book,
    parts: [...parts.slice(0, r + 1), part, ...parts.slice(r + 1)],
    chapters: book.chapters.map((ch) => (moving.has(ch.id) ? withPart(ch, part.id) : ch)),
  }
}

export function renamePart<T extends PartsBook>(book: T, partId: string, title: string): T {
  return {
    ...book,
    parts: (book.parts ?? []).map((part) => (part.id === partId ? { ...part, title } : part)),
  }
}

export function dissolvePart<T extends PartsBook>(input: T, partId: string): T {
  const book = normalizeParts(input)
  const parts = book.parts ?? []
  const r = parts.findIndex((part) => part.id === partId)
  if (r < 0) return book
  const target = r > 0 ? parts[r - 1]!.id : undefined
  return {
    ...book,
    parts: parts.filter((part) => part.id !== partId),
    chapters: book.chapters.map((ch) => (ch.partId === partId ? withPart(ch, target) : ch)),
  }
}

// ---------- Import structuring ----------

export interface TitledItem {
  title: string
  kind?: ChapterKind
  partId?: string
}

export function resolveOrdinals<T extends TitledItem>(
  items: T[],
  hasParts: boolean,
): { items: T[]; numbering: ChapterNumbering } {
  const parsed = items.map((item) => ((item.kind ?? 'chapter') === 'chapter' ? parseChapterTitle(item.title) : undefined))
  const expected = { continuous: [] as number[], perPart: [] as number[] }
  let cont = 0
  let per = 0
  let prevPart: string | undefined | null = null
  items.forEach((item, i) => {
    if (item.partId !== prevPart) per = 0
    prevPart = item.partId
    if ((item.kind ?? 'chapter') !== 'chapter') return
    cont += 1
    per += 1
    expected.continuous[i] = cont
    expected.perPart[i] = per
  })
  const hits = (mode: ChapterNumbering) => parsed.filter((p, i) => p && p.number === expected[mode][i]).length
  const numbering: ChapterNumbering = hasParts && hits('perPart') > hits('continuous') ? 'perPart' : 'continuous'
  return {
    numbering,
    items: items.map((item, i) => {
      const p = parsed[i]
      return p && p.number === expected[numbering][i] ? { ...item, title: p.rest } : item
    }),
  }
}

export interface NavGroupHint {
  title: string
  ownHref?: string
  hrefs: string[]
}

export interface StructuredChapters {
  chapters: ChapterIndex[]
  parts: BookPart[]
  partWord?: PartWord
  chapterNumbering?: ChapterNumbering
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

export function structureChapters(
  input: ChapterIndex[],
  groups: NavGroupHint[],
  newPartId: () => string,
): StructuredChapters {
  const sorted = sortChapters(input)
  const words: PartWord[] = []
  const partOf = new Map<string, string>()
  const kinds = new Map<string, ChapterKind>()
  const titles = new Map<string, string>()
  let parts: { part: BookPart; first: number }[] = []

  const partTitle = (raw: string) => {
    const parsed = parsePartTitle(raw)
    if (parsed) words.push(parsed.word)
    return parsed ? parsed.rest : raw.trim()
  }

  for (const group of groups) {
    const members = sorted.filter((ch) => ch.href === group.ownHref || group.hrefs.includes(ch.href))
    if (!members.some((ch) => ch.href !== group.ownHref)) continue
    const part = { id: newPartId(), title: partTitle(group.title) }
    parts.push({ part, first: Math.min(...members.map((ch) => ch.spineIndex)) })
    for (const ch of members) {
      if (partOf.has(ch.id)) continue
      partOf.set(ch.id, part.id)
      if (ch.href === group.ownHref) kinds.set(ch.id, 'unnumbered')
    }
  }

  if (parts.length === 0) {
    let current: { part: BookPart; number: number } | undefined
    for (const ch of sorted) {
      const parsed = parsePartTitle(ch.title)
      if (parsed) {
        words.push(parsed.word)
        const chapterRest = parseChapterTitle(parsed.rest)
        if (!chapterRest) {
          current = { part: { id: newPartId(), title: parsed.rest }, number: parsed.number }
          parts.push({ part: current.part, first: ch.spineIndex })
          kinds.set(ch.id, 'unnumbered')
        } else {
          if (!current || current.number !== parsed.number) {
            current = { part: { id: newPartId(), title: '' }, number: parsed.number }
            parts.push({ part: current.part, first: ch.spineIndex })
          }
          titles.set(ch.id, parsed.rest)
        }
      }
      if (current) partOf.set(ch.id, current.part.id)
    }
  }

  parts = parts.sort((a, b) => a.first - b.first)
  const items = sorted.map((ch) => {
    const title = titles.get(ch.id) ?? ch.title
    const kind = kinds.get(ch.id) ?? inferKind(title)
    const placed = withPart(withKind({ ...ch, title }, kind), partOf.get(ch.id))
    return placed
  })
  const book = normalizeParts({ chapters: items, parts: parts.map((p) => p.part) })
  const resolved = resolveOrdinals(sortChapters(book.chapters), parts.length > 0)
  return {
    chapters: resolved.items,
    parts: book.parts ?? [],
    partWord: mostCommon(words),
    chapterNumbering: resolved.numbering === 'perPart' ? 'perPart' : undefined,
  }
}
