import { describe, expect, it } from 'vitest'
import { needsBackupReminder, readingPercent } from './progress'

describe('readingPercent', () => {
  it('maps chapter index and in-chapter offset to 0-100', () => {
    expect(readingPercent(0, 4, 0)).toBe(0)
    expect(readingPercent(1, 4, 0.5)).toBe(38)
    expect(readingPercent(3, 4, 1)).toBe(100)
  })
})

describe('needsBackupReminder', () => {
  it('reminds when a book changed after the last export', () => {
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-21T00:00:00.000Z',
        lastExportedAt: '2026-08-20T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('reminds never-exported books after the quiet period', () => {
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-08-21T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(true)
  })
})
