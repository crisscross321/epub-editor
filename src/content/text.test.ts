import { describe, expect, it } from 'vitest'
import { countChars, findHits, readingMinutes, textFromDoc } from './text'

describe('countChars', () => {
  it('counts CJK characters and latin words', () => {
    expect(countChars('素笺 hello world')).toBe(4)
    expect(countChars('')).toBe(0)
  })
})

describe('findHits', () => {
  it('returns snippets for every occurrence', () => {
    const hits = findHits('春风又绿江南岸，春风不度玉门关', '春风')
    expect(hits).toHaveLength(2)
    expect(hits[0]?.snippet).toContain('春风')
  })

  it('returns nothing for an empty query', () => {
    expect(findHits('正文', '')).toEqual([])
  })
})

describe('readingMinutes', () => {
  it('rounds up to at least one minute', () => {
    expect(readingMinutes(10)).toBe(1)
    expect(readingMinutes(800)).toBe(2)
  })
})

describe('textFromDoc', () => {
  it('walks nested nodes', () => {
    expect(
      textFromDoc({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '昨夜' },
              { type: 'text', text: '雨疏风骤', marks: [{ type: 'bold' }] },
            ],
          },
        ],
      }),
    ).toBe('昨夜雨疏风骤')
  })
})
