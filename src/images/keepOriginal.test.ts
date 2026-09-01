import { describe, expect, it } from 'vitest'
import { shouldKeepOriginal } from './compress'

describe('shouldKeepOriginal', () => {
  it('keeps images already within 1600px and 2MB', () => {
    expect(shouldKeepOriginal({ byteLength: 800_000, width: 1200, height: 800 })).toBe(true)
    expect(shouldKeepOriginal({ byteLength: 800_000, width: 2000, height: 800 })).toBe(false)
    expect(shouldKeepOriginal({ byteLength: 3 * 1024 * 1024, width: 800, height: 800 })).toBe(false)
  })
})
