import { describe, expect, it } from 'vitest'
import { findInRoot } from './find'

describe('findInRoot', () => {
  it('wraps from the start when the first pass misses', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let calls = 0
    const findFn = () => {
      calls += 1
      return calls > 1
    }
    expect(findInRoot(root, '夜宴', false, findFn)).toBe(true)
    expect(calls).toBe(2)
  })
})
