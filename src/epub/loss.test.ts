import { describe, expect, it } from 'vitest'
import { analyzeSimplifyLoss, hasLoss, lossSummary } from './loss'

describe('analyzeSimplifyLoss', () => {
  it('counts tables, links and media', () => {
    const loss = analyzeSimplifyLoss(
      '<p>见<a href="n1">注</a></p><table><tr><td>1</td></tr></table><svg></svg><video></video><p style="color:red">红</p>',
    )
    expect(loss.tables).toBe(1)
    expect(loss.links).toBe(1)
    expect(loss.svg).toBe(1)
    expect(loss.media).toBe(1)
    expect(loss.styles).toBe(1)
    expect(hasLoss(loss)).toBe(true)
    expect(lossSummary(loss).join('')).toContain('表格')
  })

  it('is empty for plain paragraphs', () => {
    expect(hasLoss(analyzeSimplifyLoss('<p>正文</p>'))).toBe(false)
  })
})
