import { describe, expect, it } from 'vitest'
import { formatBytes, hasRoomFor, isQuotaExceeded, quotaMessage } from './persist'

describe('hasRoomFor', () => {
  it('keeps a 5MB reserve on top of the incoming payload', () => {
    const quota = 100 * 1024 * 1024
    const usage = 90 * 1024 * 1024
    expect(hasRoomFor(usage, quota, 4 * 1024 * 1024)).toBe(true)
    expect(hasRoomFor(usage, quota, 6 * 1024 * 1024)).toBe(false)
  })
})

describe('isQuotaExceeded', () => {
  it('recognizes QuotaExceededError and quota-like messages', () => {
    expect(isQuotaExceeded(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaExceeded(new Error('IndexedDB QuotaExceededError'))).toBe(true)
    expect(isQuotaExceeded(new Error('network'))).toBe(false)
  })
})

describe('formatBytes', () => {
  it('formats bytes for the shortage message', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
    expect(quotaMessage(90 * 1024 * 1024, 100 * 1024 * 1024, 20 * 1024 * 1024)).toContain('存储空间不足')
  })
})
