import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { TopBar } from './chrome'

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

describe('TopBar', () => {
  it('places the slogan beside 素笺', () => {
    const container = render(<TopBar slogan="写在脑海里的书，装进EPUB里存下。" />)
    const lockup = container.querySelector('.brand-lockup')
    expect(lockup?.textContent).toContain('素笺')
    expect(lockup?.querySelector('.brand-slogan')?.textContent).toBe('写在脑海里的书，装进EPUB里存下。')
  })

  it('renders 设置 in a bubble on the right', () => {
    const container = render(
      <TopBar
        slogan="写在脑海里的书，装进EPUB里存下。"
        right={
          <button className="btn btn-bubble btn-compact" type="button">
            设置
          </button>
        }
      />,
    )
    const settings = [...container.querySelectorAll('button')].find((btn) => btn.textContent === '设置')
    expect(settings?.className).toContain('btn-bubble')
  })
})
