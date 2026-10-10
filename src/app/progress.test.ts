import { describe, expect, it } from 'vitest'
import { exportStatusNote, isBackupReminderDismissed, needsBackupReminder, readingPercent } from './progress'

describe('readingPercent', () => {
  it('maps chapter index and in-chapter offset to 0-100', () => {
    expect(readingPercent(0, 4, 0)).toBe(0)
    expect(readingPercent(1, 4, 0.5)).toBe(38)
    expect(readingPercent(3, 4, 1)).toBe(100)
  })
})

describe('export status copy', () => {
  it('states only whether the book has been exported', () => {
    expect(exportStatusNote({})).toBe('尚未导出')
    expect(exportStatusNote({ lastExportedAt: '2026-08-21T00:00:00.000Z' })).toBe('已导出')
  })

  it('appends the stored path when one was recorded', () => {
    expect(
      exportStatusNote({ lastExportedAt: '2026-08-21T00:00:00.000Z', lastExportPath: '下载/素笺/海边.epub' }),
    ).toBe('已导出 · 下载/素笺/海边.epub')
  })
})

describe('needsBackupReminder', () => {
  it('waits out the quiet period after an edit, including one made since the last export', () => {
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-21T00:00:00.000Z',
        lastExportedAt: '2026-08-20T00:00:00.000Z',
        now: Date.parse('2026-08-22T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(false)
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-21T00:00:00.000Z',
        lastExportedAt: '2026-08-20T00:00:00.000Z',
        now: Date.parse('2026-08-24T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(true)
  })

  it('stays quiet when the latest edit has already been exported', () => {
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-20T00:00:00.000Z',
        lastExportedAt: '2026-08-21T00:00:00.000Z',
        now: Date.parse('2026-09-01T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(false)
  })

  it('reminds never-exported books after the quiet period', () => {
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-08-03T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(false)
    expect(
      needsBackupReminder({
        updatedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-08-21T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(true)
  })
})

describe('isBackupReminderDismissed', () => {
  it('hides the reminder until the quiet period after dismiss has passed', () => {
    expect(
      isBackupReminderDismissed({
        dismissedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-08-02T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(true)
    expect(
      isBackupReminderDismissed({
        dismissedAt: '2026-08-01T00:00:00.000Z',
        now: Date.parse('2026-08-04T00:00:00.000Z'),
        days: 3,
      }),
    ).toBe(false)
  })
})
