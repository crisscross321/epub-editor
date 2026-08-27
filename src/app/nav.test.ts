import { describe, expect, it } from 'vitest'
import { editorBackRoute, previewBackTarget } from './nav'

describe('reading/editor back', () => {
  it('does not loop back to editor after returning from edit to reading', () => {
    const afterFirstBack = editorBackRoute({
      name: 'editor',
      bookId: 'b1',
      chapterId: 'c1',
      from: 'preview',
    })
    expect(afterFirstBack).toEqual({ name: 'preview', bookId: 'b1', chapterId: 'c1' })
    expect(afterFirstBack.name).toBe('preview')
    if (afterFirstBack.name !== 'preview') return
    expect(previewBackTarget(afterFirstBack)).toBe('chapters')
  })

  it('returns from editor to chapter list when edit started from chapters', () => {
    expect(
      editorBackRoute({
        name: 'editor',
        bookId: 'b1',
        chapterId: 'c1',
        from: 'chapters',
      }),
    ).toEqual({ name: 'chapters', bookId: 'b1' })
  })

  it('returns from preview to editor only when preview was opened from the editor toolbar', () => {
    expect(
      previewBackTarget({ name: 'preview', bookId: 'b1', chapterId: 'c1', from: 'editor' }),
    ).toBe('editor')
    expect(
      previewBackTarget({ name: 'preview', bookId: 'b1', chapterId: 'c1', from: 'chapters' }),
    ).toBe('chapters')
  })
})
