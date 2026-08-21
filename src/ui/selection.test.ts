import { describe, expect, it } from 'vitest'
import { nextStarred, toggleSelected } from './selection'

describe('toggleSelected', () => {
  it('adds then removes an id', () => {
    const once = toggleSelected([], 'a')
    expect([...once]).toEqual(['a'])
    expect([...toggleSelected(once, 'a')]).toEqual([])
  })
})

describe('nextStarred', () => {
  it('stars when any selected book is not starred', () => {
    expect(
      nextStarred(
        [
          { id: 'a', starred: true },
          { id: 'b' },
        ],
        ['a', 'b'],
      ),
    ).toBe(true)
  })

  it('unstars when every selected book is already starred', () => {
    expect(
      nextStarred(
        [
          { id: 'a', starred: true },
          { id: 'b', starred: true },
        ],
        ['a', 'b'],
      ),
    ).toBe(false)
  })
})
