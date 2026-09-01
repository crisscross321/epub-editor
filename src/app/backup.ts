import JSZip from 'jszip'
import type { AppSettings } from '../storage/settings'
import type { Annotation, BookRecord, TiptapDoc } from '../types/book'

export const BACKUP_VERSION = 1

export interface BackupBook {
  book: BookRecord
  entries: { path: string; data: Uint8Array }[]
  docs: { chapterId: string; doc: TiptapDoc }[]
  blobs: { id: string; data: Uint8Array; mime: string }[]
  annotations: Annotation[]
}

export interface ShelfBackup {
  version: number
  exportedAt: string
  settings: AppSettings
  books: BackupBook[]
}

interface BackupManifest {
  version: number
  exportedAt: string
  bookIds: string[]
}

export async function packBackup(data: ShelfBackup): Promise<Uint8Array> {
  const zip = new JSZip()
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt,
    bookIds: data.books.map((item) => item.book.id),
  }
  zip.file('manifest.json', JSON.stringify({ ...manifest, kind: 'sujian-shelf' }))
  zip.file('settings.json', JSON.stringify(data.settings))
  for (const item of data.books) {
    const root = `books/${item.book.id}`
    zip.file(`${root}/book.json`, JSON.stringify(item.book))
    zip.file(`${root}/docs.json`, JSON.stringify(item.docs))
    zip.file(`${root}/annotations.json`, JSON.stringify(item.annotations))
    zip.file(
      `${root}/blobs.json`,
      JSON.stringify(item.blobs.map((blob) => ({ id: blob.id, mime: blob.mime }))),
    )
    for (const entry of item.entries) {
      zip.file(`${root}/entries/${entry.path}`, entry.data)
    }
    for (const blob of item.blobs) {
      zip.file(`${root}/blobs/${blob.id}`, blob.data)
    }
  }
  return zip.generateAsync({ type: 'uint8array' })
}

export async function unpackBackup(bytes: Uint8Array): Promise<ShelfBackup> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('不是素笺书架备份')
  }
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('不是素笺书架备份')
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest & { kind?: string }
  if (manifest.kind !== 'sujian-shelf' || manifest.version !== BACKUP_VERSION) {
    throw new Error('不是素笺书架备份')
  }
  const settingsFile = zip.file('settings.json')
  if (!settingsFile) throw new Error('不是素笺书架备份')
  const settings = JSON.parse(await settingsFile.async('string')) as AppSettings
  const books: BackupBook[] = []
  for (const id of manifest.bookIds) {
    const root = `books/${id}`
    const bookFile = zip.file(`${root}/book.json`)
    if (!bookFile) continue
    const book = JSON.parse(await bookFile.async('string')) as BookRecord
    const docs = JSON.parse((await zip.file(`${root}/docs.json`)?.async('string')) || '[]') as BackupBook['docs']
    const annotations = JSON.parse(
      (await zip.file(`${root}/annotations.json`)?.async('string')) || '[]',
    ) as Annotation[]
    const blobMeta = JSON.parse((await zip.file(`${root}/blobs.json`)?.async('string')) || '[]') as {
      id: string
      mime: string
    }[]
    const entries: BackupBook['entries'] = []
    const entryFolder = zip.folder(`${root}/entries`)
    if (entryFolder) {
      const jobs: Promise<void>[] = []
      entryFolder.forEach((relativePath, file) => {
        if (file.dir) return
        jobs.push(
          file.async('uint8array').then((data) => {
            entries.push({ path: relativePath, data })
          }),
        )
      })
      await Promise.all(jobs)
    }
    const blobs: BackupBook['blobs'] = []
    for (const meta of blobMeta) {
      const data = await zip.file(`${root}/blobs/${meta.id}`)?.async('uint8array')
      if (data) blobs.push({ id: meta.id, data, mime: meta.mime })
    }
    books.push({ book, entries, docs, blobs, annotations })
  }
  return {
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    settings,
    books,
  }
}
