export const TRASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function isTrashExpired(
  trashedAt: string,
  nowMs: number,
  maxAgeMs = TRASH_MAX_AGE_MS,
): boolean {
  const t = Date.parse(trashedAt)
  if (!Number.isFinite(t)) return true
  return nowMs - t > maxAgeMs
}

export function dumpSizeBytes(dump: {
  entries: { data: Uint8Array }[]
  blobs: { data: Uint8Array }[]
}): number {
  let n = 0
  for (const entry of dump.entries) n += entry.data.byteLength
  for (const blob of dump.blobs) n += blob.data.byteLength
  return n
}
