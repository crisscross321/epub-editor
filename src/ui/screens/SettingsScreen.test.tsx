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
  it('shares color mode with the reader and leaves the rest of layout there', () => {
    let theme = defaultSettings.theme
    const container = render(
      <SettingsScreen
        settings={{ ...defaultSettings, theme }}
        onChange={(patch) => {
          if (patch.theme) theme = patch.theme
        }}
      />,
    )
    expect(container.textContent).toContain('颜色模式')
    expect(container.textContent).not.toContain('字号')
    expect(container.textContent).not.toContain('字体')
    expect(container.textContent).not.toContain('翻页方式')
    expect(container.querySelectorAll('.settings-block').length).toBe(5)
    const night = [...container.querySelectorAll('button')].find((btn) => btn.textContent === '夜读')
    act(() => night?.click())
    expect(theme).toBe('night')
    expect(container.textContent).toContain('备份')
    expect(container.textContent).toContain('存储')
    expect(container.textContent).toContain('回收站')
    expect(container.textContent).toContain('查找和替换')
    expect(container.textContent).toContain('启用通配符')
    expect(container.textContent).toContain('启用后，^p 表示换行')
    const toggle = container.querySelector('[role="switch"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('false')
  })

  it('turns wildcard find on from the editor section', () => {
    let enabled = false
    const container = render(
      <SettingsScreen
        settings={{ ...defaultSettings, findWildcards: enabled }}
        onChange={(patch) => {
          if (patch.findWildcards != null) enabled = patch.findWildcards
        }}
      />,
    )
    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement
    act(() => toggle.click())
    expect(enabled).toBe(true)
  })

  it('lets the backup-day field be cleared before a new number is typed', () => {
    let days = 3
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const draw = () => {
      act(() => {
        root.render(
          <SettingsScreen
            settings={{ ...defaultSettings, backupDays: days }}
            onChange={(patch) => {
              if (patch.backupDays != null) days = patch.backupDays
            }}
          />,
        )
      })
    }
    roots.push({ root, container })
    draw()
    const input = container.querySelector('input[aria-label="超过几天未导出就提醒"]') as HTMLInputElement
    const setValue = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => setValue(''))
    expect(input.value).toBe('')
    expect(days).toBe(3)
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(input.value).toBe('3')
    act(() => setValue(''))
    act(() => setValue('7'))
    expect(input.value).toBe('7')
    expect(days).toBe(7)
    draw()
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(input.value).toBe('7')
  })
})
