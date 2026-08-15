import { describe, expect, it } from 'vitest'
import { toArrayBuffer } from '../epub/bytes'
import { compressImage } from './compress'

const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

describe('compressImage', () => {
  it('returns bytes for a tiny PNG', async () => {
    const blob = new Blob([toArrayBuffer(TINY_PNG)], { type: 'image/png' })
    const result = await compressImage(blob)
    expect(result.bytes.byteLength).toBeGreaterThan(0)
    expect(result.ext).toMatch(/png|jpg/)
  })
})
