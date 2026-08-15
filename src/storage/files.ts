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

export function pickEpubFile(): Promise<File | null> {
  return pickFile('.epub,application/epub+zip')
}

export function pickImageFile(): Promise<File | null> {
  return pickFile('image/*')
}

export async function saveEpubToUser(filename: string, bytes: Uint8Array): Promise<void> {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.getPlatform() !== 'web') {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    let binary = ''
    bytes.forEach((b) => {
      binary += String.fromCharCode(b)
    })
    await Filesystem.writeFile({
      path: filename,
      data: btoa(binary),
      directory: Directory.Documents,
    })
    return
  }
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/epub+zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
