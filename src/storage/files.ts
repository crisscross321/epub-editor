import { toArrayBuffer } from '../epub/bytes'

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      cleanup()
      resolve(file)
    })
    input.addEventListener('cancel', () => {
      cleanup()
      resolve(null)
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function pickTextFile(): Promise<File | null> {
  return pickFile('.txt,.md,text/plain,text/markdown')
}

export function pickEpubFile(): Promise<File | null> {
  return pickFile('.epub,application/epub+zip')
}

export function pickImageFile(): Promise<File | null> {
  return pickFile('image/*')
}

export function pickBackupFile(): Promise<File | null> {
  return pickFile('.zip,application/zip,.sujian')
}

function safeFilename(name: string, ext: string): string {
  const trimmed = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || '未命名'
  return trimmed.toLowerCase().endsWith(`.${ext}`) ? trimmed : `${trimmed}.${ext}`
}

export function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[])
  }
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function downloadBlob(name: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveBackupToDocuments(filename: string, bytes: Uint8Array): Promise<string> {
  const name = safeFilename(filename, 'zip')
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() === 'android') {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: `素笺/${name}`,
      data: toBase64(bytes),
      directory: Directory.Documents,
      recursive: true,
    })
    return `文档/素笺/${name}`
  }
  downloadBlob(name, bytes, 'application/zip')
  return `下载/${name}`
}

const EPUB_MIME = 'application/epub+zip'

export type SavedEpub = {
  name: string
  mime: string
  uri?: string
  bytes?: Uint8Array
  displayPath?: string
  location: 'picked' | 'download'
}

type SaveDocumentPlugin = {
  save(options: { filename: string; mime: string; data: string }): Promise<{ uri: string; displayPath?: string }>
  pickDirectory(): Promise<{ uri: string; displayPath?: string }>
  saveInDirectory(options: {
    directoryUri: string
    filename: string
    mime: string
    data: string
  }): Promise<{ uri: string; displayPath?: string }>
  share(options: { uri: string; mime: string; title: string }): Promise<void>
}

type DirectoryHandle = {
  name: string
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
  }>
}

export type SaveDirectory = {
  displayPath?: string
  write: (filename: string, bytes: Uint8Array, mime: string, ext: string) => Promise<{ uri?: string; displayPath?: string }>
}

type SaveFilePicker = (options: {
  suggestedName?: string
  types?: Array<{ description?: string; accept: Record<string, string[]> }>
}) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
}>

const STORAGE_FOLDERS: Record<string, string> = {
  Download: '下载',
  Downloads: '下载',
  Documents: '文档',
}

export function displayPathFromUri(uri: string): string | undefined {
  let id = ''
  try {
    const pathname = decodeURIComponent(new URL(uri).pathname)
    const documentAt = pathname.lastIndexOf('/document/')
    const treeAt = pathname.lastIndexOf('/tree/')
    const at = Math.max(documentAt, treeAt)
    if (at < 0) return
    const marker = documentAt >= treeAt ? '/document/' : '/tree/'
    id = pathname.slice(at + marker.length)
  } catch {
    return
  }
  if (!id) return
  if (id.startsWith('raw:')) return friendlyStoragePath(id.slice(4))
  const colon = id.indexOf(':')
  return friendlyStoragePath(colon >= 0 ? id.slice(colon + 1) : id)
}

function friendlyStoragePath(path: string): string | undefined {
  let normalized = path.replace(/^\/storage\/emulated\/0\//, '').replace(/^\/+/, '')
  if (!normalized) return
  const slash = normalized.indexOf('/')
  const head = slash >= 0 ? normalized.slice(0, slash) : normalized
  const tail = slash >= 0 ? normalized.slice(slash) : ''
  return `${STORAGE_FOLDERS[head] ?? head}${tail}`
}

export function savedEpubMessage(saved: SavedEpub): string {
  return `已保存 · ${saved.displayPath || saved.name}`
}

export function isUserCancel(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'cancelled') {
    return true
  }
  const message = error instanceof Error ? error.message : ''
  return message === '已取消' || message === 'cancelled' || message === 'canceled' || message === 'Share canceled'
}

export function canShareSavedEpub(saved: SavedEpub): boolean {
  if (saved.uri) return true
  if (!saved.bytes || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    return navigator.canShare({ files: [epubFile(saved)] })
  } catch {
    return false
  }
}

function epubFile(saved: SavedEpub): File {
  return new File([toArrayBuffer(saved.bytes!)], saved.name, { type: saved.mime })
}

function saveFilePicker(): SaveFilePicker | undefined {
  return (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
}

let saveDocumentBox: Promise<{ plugin: SaveDocumentPlugin }> | undefined

function loadSaveDocument(): Promise<{ plugin: SaveDocumentPlugin }> {
  // The Capacitor proxy answers every property, including `then`. Returning it
  // from an async function makes the caller adopt it as a promise, call
  // `then()`, and never settle — the save overlay stays up forever.
  saveDocumentBox ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    plugin: registerPlugin<SaveDocumentPlugin>('SaveDocument'),
  }))
  return saveDocumentBox
}

export async function savePickedFile(
  filename: string,
  bytes: Uint8Array,
  mime: string,
  ext: string,
): Promise<SavedEpub | null> {
  const name = safeFilename(filename, ext)
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() === 'android') {
    try {
      const { plugin } = await loadSaveDocument()
      const saved = await plugin.save({ filename: name, mime, data: toBase64(bytes) })
      return {
        name,
        mime,
        uri: saved.uri,
        displayPath: saved.displayPath || displayPathFromUri(saved.uri),
        location: 'picked',
      }
    } catch (error) {
      if (isUserCancel(error)) return null
      throw error
    }
  }

  const picker = saveFilePicker()
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(new Blob([toArrayBuffer(bytes)], { type: mime }))
      await writable.close()
      return { name, mime, bytes, location: 'picked' }
    } catch (error) {
      if (isUserCancel(error)) return null
      throw error
    }
  }

  downloadBlob(name, bytes, mime)
  return { name, mime, bytes, displayPath: `下载/${name}`, location: 'download' }
}

export async function saveEpubToUser(filename: string, bytes: Uint8Array): Promise<SavedEpub | null> {
  return savePickedFile(filename, bytes, EPUB_MIME, 'epub')
}

function directoryPicker(): (() => Promise<DirectoryHandle>) | undefined {
  return (globalThis as { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker
}

export async function pickSaveDirectory(): Promise<SaveDirectory | null> {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() === 'android') {
    try {
      const { plugin } = await loadSaveDocument()
      const picked = await plugin.pickDirectory()
      const displayPath = picked.displayPath || displayPathFromUri(picked.uri)
      return {
        displayPath,
        write: async (filename, bytes, mime, ext) => {
          const name = safeFilename(filename, ext)
          const saved = await plugin.saveInDirectory({
            directoryUri: picked.uri,
            filename: name,
            mime,
            data: toBase64(bytes),
          })
          return {
            uri: saved.uri,
            displayPath: saved.displayPath || (displayPath ? `${displayPath}/${name}` : name),
          }
        },
      }
    } catch (error) {
      if (isUserCancel(error)) return null
      throw error
    }
  }

  const picker = directoryPicker()
  if (picker) {
    try {
      const handle = await picker()
      return {
        displayPath: handle.name,
        write: async (filename, bytes, mime, ext) => {
          const name = safeFilename(filename, ext)
          const file = await handle.getFileHandle(name, { create: true })
          const writable = await file.createWritable()
          await writable.write(new Blob([toArrayBuffer(bytes)], { type: mime }))
          await writable.close()
          return { displayPath: `${handle.name}/${name}` }
        },
      }
    } catch (error) {
      if (isUserCancel(error)) return null
      throw error
    }
  }

  return {
    displayPath: '下载',
    write: async (filename, bytes, mime, ext) => {
      const name = safeFilename(filename, ext)
      downloadBlob(name, bytes, mime)
      return { displayPath: `下载/${name}` }
    },
  }
}

export async function shareSavedEpub(saved: SavedEpub): Promise<void> {
  if (saved.uri) {
    const { plugin } = await loadSaveDocument()
    await plugin.share({ uri: saved.uri, mime: saved.mime, title: saved.name })
    return
  }
  if (!saved.bytes || typeof navigator.share !== 'function') throw new Error('这台设备不能分享文件')
  const file = epubFile(saved)
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    throw new Error('这台设备不能分享文件')
  }
  try {
    await navigator.share({ files: [file], title: saved.name })
  } catch (error) {
    if (isUserCancel(error)) return
    throw error
  }
}

function filenameFromUrl(url: string): string {
  const last = decodeURIComponent(url.split('?')[0]?.split('#')[0]?.split('/').pop() || '导入.epub')
  return last || '导入.epub'
}

export async function readBytesFromAppUrl(url: string): Promise<{ bytes: Uint8Array; name: string }> {
  const name = filenameFromUrl(url)
  try {
    const { Filesystem } = await import('@capacitor/filesystem')
    const result = await Filesystem.readFile({ path: url })
    const data = result.data
    if (typeof data === 'string') return { bytes: fromBase64(data), name }
    if (data instanceof Blob) return { bytes: new Uint8Array(await data.arrayBuffer()), name }
  } catch {
    /* fall through to fetch */
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('打不开这个文件')
  return { bytes: new Uint8Array(await res.arrayBuffer()), name }
}
