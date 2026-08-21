import { describe, expect, it } from 'vitest'
import { checkExport } from './exportCheck'

describe('checkExport', () => {
  it('flags missing cover, empty chapter and unnamed title', () => {
    const issues = checkExport({
      title: '未命名',
      language: '',
      hasCover: false,
      chapters: [{ id: 'ch1', title: '序', empty: true }],
      imageBytes: [3_000_000],
    })
    expect(issues.map((i) => i.id)).toEqual(['title', 'language', 'cover', 'empty-ch1', 'images'])
  })
})
