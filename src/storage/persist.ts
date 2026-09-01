const RESERVE_BYTES = 5 * 1024 * 1024

export function hasRoomFor(
  usage: number,
  quota: number,
  needed: number,
  reserveBytes = RESERVE_BYTES,
): boolean {
  return quota - usage >= needed + reserveBytes
}

export function isQuotaExceeded(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (err.name === 'QuotaExceededError' || err.code === 22) return true
  }
  if (err instanceof Error && /quota/i.test(err.message)) return true
  return false
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${Math.max(0, Math.round(n))} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function quotaMessage(usage: number, quota: number, needed: number): string {
  return `存储空间不足。还剩 ${formatBytes(Math.max(0, quota - usage))}，这次大约需要 ${formatBytes(needed)}。请先导出或删除不用的书。`
}

export async function requestPersistentStorage(): Promise<'granted' | 'denied' | 'unsupported'> {
  const storage = navigator.storage
  if (!storage?.persist) return 'unsupported'
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'granted'
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

export async function readStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || typeof estimate.quota !== 'number') return null
    return { usage: estimate.usage ?? 0, quota: estimate.quota }
  } catch {
    return null
  }
}

export async function assertRoomFor(needed: number): Promise<void> {
  const estimate = await readStorageEstimate()
  if (!estimate) return
  if (!hasRoomFor(estimate.usage, estimate.quota, needed)) {
    throw new Error(quotaMessage(estimate.usage, estimate.quota, needed))
  }
}
