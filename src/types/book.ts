export type ChapterState = 'pristine' | 'simplified'
export type ChapterKind = 'chapter' | 'unnumbered'
export type PartWord = '册' | '卷' | '部' | '部分' | '篇'
export type ChapterNumbering = 'continuous' | 'perPart'

export interface ChapterIndex {
  id: string
  href: string
  title: string
  spineIndex: number
  state: ChapterState
  kind?: ChapterKind
  partId?: string
}

export interface BookPart {
  id: string
  title: string
}

export interface BookRecord {
  id: string
  title: string
  author: string
  language: string
  updatedAt: string
  addedAt?: string
  coverPath?: string
  sourceName?: string
  opfHref: string
  chapters: ChapterIndex[]
  parts?: BookPart[]
  chapterNumbering?: ChapterNumbering
  partWord?: PartWord
  description?: string
  publisher?: string
  series?: string
  tags?: string[]
  starred?: boolean
  lastExportedAt?: string
  lastReadAt?: string
  readChapterId?: string
  readOffset?: number
}

export type AnnotationKind = 'bookmark' | 'highlight' | 'note'

export interface Annotation {
  id: string
  bookId: string
  chapterId: string
  kind: AnnotationKind
  text: string
  note?: string
  offset?: number
  createdAt: string
}

export interface ChapterDump {
  bookId: string
  chapter: ChapterIndex
  doc?: TiptapDoc
  entry?: Uint8Array
}

export interface TrashDump {
  id: string
  book: BookRecord
  entries: { path: string; data: Uint8Array }[]
  docs: { chapterId: string; doc: TiptapDoc }[]
  blobs: { id: string; data: Uint8Array; mime: string }[]
  trashedAt: string
}

export interface ParsedEpub {
  title: string
  author: string
  language: string
  coverHref?: string
  coverId?: string
  chapters: ChapterIndex[]
  parts?: BookPart[]
  chapterNumbering?: ChapterNumbering
  partWord?: PartWord
  entries: Map<string, Uint8Array>
  navHref?: string
  opfHref: string
}

export interface TiptapMark {
  type: string
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  marks?: TiptapMark[]
  text?: string
  content?: TiptapNode[]
}

export interface TiptapDoc {
  type: 'doc'
  content?: TiptapNode[]
}

export interface PackedImage {
  id: string
  href: string
  bytes: Uint8Array
  mime: string
}

export interface PackInput {
  book: BookRecord
  entries: Map<string, Uint8Array>
  simplified: Map<
    string,
    {
      xhtml: string
      images: PackedImage[]
    }
  >
  cover?: { bytes: Uint8Array; mime: string; ext: string }
}
