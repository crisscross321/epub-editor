export function readingPercent(chapterIndex: number, chapterCount: number, offset: number): number {
  if (chapterCount <= 0) return 0
  const clamped = Math.min(1, Math.max(0, offset))
  const raw = ((chapterIndex + clamped) / chapterCount) * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
}

const DAY_MS = 86_400_000

export function needsBackupReminder(input: {
  updatedAt: string
  lastExportedAt?: string
  now?: number
  days?: number
}): boolean {
  const updated = Date.parse(input.updatedAt)
  if (Number.isNaN(updated)) return false
  if (input.lastExportedAt && updated <= Date.parse(input.lastExportedAt)) return false
  const days = input.days ?? 3
  const now = input.now ?? Date.now()
  return now - updated >= days * DAY_MS
}

export function hasExported(input: { lastExportedAt?: string }): boolean {
  return Boolean(input.lastExportedAt)
}

export function exportStatusNote(input: { lastExportedAt?: string; lastExportPath?: string }): string {
  if (!hasExported(input)) return '尚未导出'
  return input.lastExportPath ? `已导出 · ${input.lastExportPath}` : '已导出'
}

export function isBackupReminderDismissed(input: {
  dismissedAt?: string
  now?: number
  days?: number
}): boolean {
  if (!input.dismissedAt) return false
  const dismissed = Date.parse(input.dismissedAt)
  if (Number.isNaN(dismissed)) return false
  const days = input.days ?? 3
  const now = input.now ?? Date.now()
  return now - dismissed < days * DAY_MS
}

export function coverHue(title: string): number {
  let hash = 0
  for (const ch of title || '素笺') hash = (hash * 33 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}
