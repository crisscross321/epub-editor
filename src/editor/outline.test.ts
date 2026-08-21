import { describe, expect, it } from 'vitest'
import { outlineFromDoc } from './outline'

describe('outlineFromDoc', () => {
  it('collects heading titles in order', () => {
    expect(
      outlineFromDoc({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开篇' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '小节' }] },
        ],
      }),
    ).toEqual([
      { index: 0, level: 1, title: '开篇' },
      { index: 2, level: 2, title: '小节' },
    ])
  })
})
