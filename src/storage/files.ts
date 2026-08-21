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

function safeFilename(name: string, ext: string): string {
  const trimmed = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || '未命名'
  return trimmed.toLowerCase().endsWith(`.${ext}`) ? trimmed : `${trimmed}.${ext}`
}

function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[])
  }
  return btoa(binary)
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
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const path = `exports/${name}`
    await Filesystem.writeFile({
      path,
      data: toBase64(bytes),
      directory: Directory.Cache,
      recursive: true,
    })
    const uri = await Filesystem.getUri({ path, directory: Directory.Cache })
    try {
      await Share.share({
        title: name,
        text: name,
        url: uri.uri,
        dialogTitle: '保存或分享',
      })
      return `导出成功。请在弹出的菜单里选「文件」「下载」或微信等，把《${name}》存到你找得到的位置。`
    } catch {
      return `文件已生成，但分享菜单被取消或无法打开。请再点一次导出。`
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
