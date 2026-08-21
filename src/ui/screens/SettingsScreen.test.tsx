import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings } from '../../storage/settings'
import { SettingsScreen } from './SettingsScreen'

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

describe('SettingsScreen', () => {
  it('labels reading options and separates setting groups', () => {
    const container = render(<SettingsScreen settings={defaultSettings} onChange={() => {}} />)
    expect(container.textContent).toContain('颜色模式')
    expect(container.textContent).toContain('字号')
    expect(container.textContent).toContain('字体')
    expect(container.textContent).toContain('翻页方式')
    expect(container.querySelectorAll('.settings-block').length).toBe(3)
    expect(container.querySelectorAll('.settings-item').length).toBe(4)
  })
})
