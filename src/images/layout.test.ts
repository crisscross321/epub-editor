import { describe, expect, it } from 'vitest'
import { bumpWidth, clampWidth, imageCss } from './layout'

describe('image layout', () => {
  it('clamps width between 20 and 100', () => {
    expect(clampWidth(5)).toBe(20)
    expect(clampWidth(150)).toBe(100)
    expect(clampWidth(47.6)).toBe(48)
  })

  it('steps width by 10 percent', () => {
    expect(bumpWidth(100, -1)).toBe(90)
    expect(bumpWidth(20, -1)).toBe(20)
    expect(bumpWidth(95, 1)).toBe(100)
  })

  it('emits css that readers can keep as inline style', () => {
    expect(imageCss(60, 'right')).toContain('width:60%')
    expect(imageCss(60, 'right')).toContain('margin:12px 0 12px auto')
    expect(imageCss(40, 'left')).toContain('margin:12px auto 12px 0')
    expect(imageCss(100, 'center')).toContain('margin:12px auto')
  })
})
