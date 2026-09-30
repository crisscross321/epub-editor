import { afterEach, describe, expect, it } from 'vitest'
import { findInRoot } from './find'

afterEach(() => { document.body.innerHTML = '' })

describe('findInRoot', () => {
  it('finds text across formatting nodes and wraps only within the editor', () => {
    document.body.innerHTML = '<p>夜宴</p><div contenteditable="true">夜<b>宴</b>，又是夜宴</div>'
    const root = document.querySelector('div')!
    expect(findInRoot(root, '夜宴', true)).toBe(true)
    expect(window.getSelection()?.toString()).toBe('夜宴')
    const first = window.getSelection()!.anchorNode
    expect(root.contains(first)).toBe(true)
    expect(findInRoot(root, '夜宴', false)).toBe(true)
    expect(window.getSelection()!.anchorNode).not.toBe(first)
    expect(findInRoot(root, '夜宴', false)).toBe(true)
    expect(window.getSelection()!.anchorNode).toBe(first)
  })
  it('does not match text outside the editor or empty queries', () => {
    document.body.innerHTML = '<p>夜宴</p><div contenteditable="true">白塔</div>'
    const root = document.querySelector('div')!
    expect(findInRoot(root, '夜宴', true)).toBe(false)
    expect(findInRoot(root, '', true)).toBe(false)
  })
})
