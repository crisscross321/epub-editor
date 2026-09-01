const urls = new Map<string, string>()

export function rememberBlobUrl(key: string, blob: Blob): string {
  const existing = urls.get(key)
  if (existing) return existing
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  return url
}

export function revokeBlobUrl(key: string): void {
  const url = urls.get(key)
  if (!url) return
  URL.revokeObjectURL(url)
  urls.delete(key)
}

export function revokeBookImages(bookId: string, keepCover = true): void {
  const prefix = `${bookId}::`
  for (const key of [...urls.keys()]) {
    if (!key.startsWith(prefix)) continue
    if (keepCover && key === `${bookId}::cover`) continue
    revokeBlobUrl(key)
  }
}

export function revokeAllBlobUrls(): void {
  for (const key of [...urls.keys()]) revokeBlobUrl(key)
}
