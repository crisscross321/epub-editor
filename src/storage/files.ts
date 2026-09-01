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

async function writeAndroidCopy(
  rel: string,
  data: string,
  directory: 'Documents' | 'ExternalStorage',
): Promise<string | null> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const dir = directory === 'Documents' ? Directory.Documents : Directory.ExternalStorage
  await Filesystem.writeFile({ path: rel, data, directory: dir, recursive: true })
  const uri = await Filesystem.getUri({ path: rel, directory: dir })
  return uri.uri
}

export async function writeBytesToLibrary(
  filename: string,
  bytes: Uint8Array,
  ext: string,
): Promise<{ uri: string; message: string }> {
  const name = safeFilename(filename, ext)
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() !== 'android') {
    const blob = new Blob([toArrayBuffer(bytes)])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return { uri: url, message: `已开始下载《${name}》` }
  }
  const data = toBase64(bytes)
  const docUri = await writeAndroidCopy(`素笺/${name}`, data, 'Documents')
  if (!docUri) throw new Error('无法写入文档目录')
  let extra = '已写入「文档/素笺」。'
  try {
    await writeAndroidCopy(`Download/素笺/${name}`, data, 'ExternalStorage')
    extra = '已保存到下载目录「素笺」文件夹。'
  } catch {
    extra = '已写入应用文档目录「文档/素笺」。系统下载目录不可用。'
  }
  return { uri: docUri, message: `已保存《${name}》。${extra}` }
}

export async function saveBytesToUser(
  filename: string,
  bytes: Uint8Array,
  mime: string,
  ext: string,
): Promise<string> {
  const name = safeFilename(filename, ext)
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() === 'android') {
    const written = await writeBytesToLibrary(name, bytes, ext)
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({
        title: name,
        text: name,
        url: written.uri,
        dialogTitle: '保存或分享',
      })
      return written.message
    } catch {
      return `${written.message}分享已取消，文件仍在。`
    }
  }

  const blob = new Blob([toArrayBuffer(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return `已开始下载《${name}》，请到浏览器的下载列表里查看。`
}

export async function saveEpubToUser(filename: string, bytes: Uint8Array): Promise<string> {
  return saveBytesToUser(filename, bytes, 'application/epub+zip', 'epub')
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
