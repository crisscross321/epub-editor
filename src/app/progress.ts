export function readingPercent(chapterIndex: number, chapterCount: number, offset: number): number {
  if (chapterCount <= 0) return 0
  const clamped = Math.min(1, Math.max(0, offset))
  const raw = ((chapterIndex + clamped) / chapterCount) * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
}

export function needsBackupReminder(input: {
  updatedAt: string
  lastExportedAt?: string
  now?: number
  days?: number
}): boolean {
  const days = input.days ?? 3
  const now = input.now ?? Date.now()
  if (!input.lastExportedAt) return now - Date.parse(input.updatedAt) >= days * 86_400_000
  return Date.parse(input.updatedAt) > Date.parse(input.lastExportedAt)
}

export function coverHue(title: string): number {
  let hash = 0
  for (const ch of title || '素笺') hash = (hash * 33 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}
