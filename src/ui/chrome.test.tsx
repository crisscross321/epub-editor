import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, TopBar } from './chrome'

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

describe('Dialog', () => {
  it('offers 分享 beside 完成 after a save, without a cancel button', () => {
    let shared = 0
    let closed = 0
    const container = render(
      <Dialog
        title="已保存"
        body="《未命名.epub》已保存到你选择的位置。"
        confirm="完成"
        extra="分享"
        onExtra={() => {
          shared += 1
        }}
        onCancel={() => {
          closed += 1
        }}
        onConfirm={() => {
          closed += 1
        }}
      />,
    )
    const labels = [...container.querySelectorAll('button')].map((btn) => btn.textContent)
    expect(labels).toEqual(['分享', '完成'])
    act(() => {
      ;[...container.querySelectorAll('button')].find((btn) => btn.textContent === '分享')?.click()
    })
    expect(shared).toBe(1)
    expect(closed).toBe(0)
    act(() => {
      ;[...container.querySelectorAll('button')].find((btn) => btn.textContent === '完成')?.click()
    })
    expect(closed).toBe(1)
  })
})
