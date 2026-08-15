export type ChapterState = 'pristine' | 'simplified'

export interface ChapterIndex {
  id: string
  href: string
  title: string
  spineIndex: number
  state: ChapterState
}

export interface BookRecord {
  id: string
  title: string
  author: string
  language: string
  updatedAt: string
  coverPath?: string
  sourceName?: string
  opfHref: string
  chapters: ChapterIndex[]
}

export interface ParsedEpub {
  title: string
  author: string
  language: string
  coverHref?: string
  coverId?: string
  chapters: ChapterIndex[]
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
