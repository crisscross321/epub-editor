import { describe, expect, it } from 'vitest'
import { dumpSizeBytes, isTrashExpired, TRASH_MAX_AGE_MS } from './trash'

describe('isTrashExpired', () => {
  it('expires dumps older than seven days and treats invalid dates as expired', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z')
    expect(isTrashExpired('2026-08-24T00:00:00.000Z', now)).toBe(true)
    expect(isTrashExpired('2026-08-26T00:00:00.000Z', now)).toBe(false)
    expect(isTrashExpired('not-a-date', now)).toBe(true)
    expect(TRASH_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })
})

describe('dumpSizeBytes', () => {
  it('sums entry and blob payloads', () => {
    expect(
      dumpSizeBytes({
        entries: [{ data: new Uint8Array(10) }],
        blobs: [{ data: new Uint8Array(5) }],
      }),
    ).toBe(15)
  })
})
