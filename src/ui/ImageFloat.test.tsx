import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageFloat, imageFloatStyle } from './ImageFloat'

const roots: Array<{ root: Root; container: HTMLDivElement }> = []

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function render(ui: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  roots.push({ root, container })
  return container
}

afterEach(() => {
  act(() => {
    for (const item of roots) item.root.unmount()
  })
  for (const item of roots) item.container.remove()
  roots.length = 0
})

const float = (onDelete = () => {}) => (
  <ImageFloat
    width={100}
    align="center"
    onWidth={() => {}}
    onAlign={() => {}}
    onDelete={onDelete}
  />
)

describe('ImageFloat', () => {
  it('puts a red delete action last', () => {
    const container = render(float())
    const buttons = [...container.querySelectorAll('button')]
    const last = buttons.at(-1)
    expect(last?.textContent).toBe('删除')
    expect(last?.className).toContain('is-danger')
  })

  it('calls onDelete when 删除 is clicked', () => {
    const onDelete = vi.fn()
    const container = render(float(onDelete))
    const del = [...container.querySelectorAll('button')].find((btn) => btn.textContent === '删除')
    act(() => {
      del?.click()
    })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('keeps the wider toolbar on screen when the image sits near the right edge', () => {
    window.innerWidth = 400
    const style = imageFloatStyle(new DOMRect(350, 200, 80, 80))
    expect(style.left).toBe(40)
  })
})
