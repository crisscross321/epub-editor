import { afterEach, describe, expect, it } from 'vitest'
import { rememberBlobUrl, revokeAllBlobUrls, revokeBlobUrl, revokeBookImages } from './blobUrls'

afterEach(() => {
  revokeAllBlobUrls()
})

describe('blob url cache', () => {
  it('reuses the same object URL for a key', () => {
    const blob = new Blob(['a'], { type: 'text/plain' })
    const first = rememberBlobUrl('b1::cover', blob)
    const second = rememberBlobUrl('b1::cover', blob)
    expect(second).toBe(first)
  })

  it('revokes a replaced key and book images except the cover', () => {
    const cover = rememberBlobUrl('b1::cover', new Blob(['c']))
    const img = rememberBlobUrl('b1::img', new Blob(['i']))
    rememberBlobUrl('b2::cover', new Blob(['x']))
    revokeBookImages('b1')
    expect(rememberBlobUrl('b1::cover', new Blob(['c']))).toBe(cover)
    expect(rememberBlobUrl('b1::img', new Blob(['i']))).not.toBe(img)
    revokeBlobUrl('b1::cover')
    expect(rememberBlobUrl('b1::cover', new Blob(['c']))).not.toBe(cover)
  })
})
