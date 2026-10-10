import { describe, expect, it } from 'vitest'
import { parseWildcards, tokensToNeedle } from './wildcards'

describe('parseWildcards', () => {
  it('keeps the typed characters when wildcards are off', () => {
    expect(tokensToNeedle(parseWildcards('^p^^', false))).toBe('^p^^')
  })

  it('reads ^p as a line break and ^^ as a caret', () => {
    expect(parseWildcards('。^p下', true)).toEqual([
      { type: 'text', text: '。' },
      { type: 'break' },
      { type: 'text', text: '下' },
    ])
    expect(tokensToNeedle(parseWildcards('^p^p', true))).toBe('\n\n')
    expect(tokensToNeedle(parseWildcards('^^p', true))).toBe('^p')
    expect(tokensToNeedle(parseWildcards('a^^b', true))).toBe('a^b')
    expect(tokensToNeedle(parseWildcards('^P', true))).toBe('^P')
  })
})
