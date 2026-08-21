import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookRecord } from '../types/book'
import { LONG_PRESS_MS } from './selection'
import { ChapterListScreen } from './screens/ChapterListScreen'

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

const book: BookRecord = {
  id: 'b1',
  title: '边城',
  author: '沈从文',
  language: 'zh-CN',
  updatedAt: '2026-01-01T00:00:00.000Z',
  opfHref: 'OEBPS/content.opf',
  chapters: [
    { id: 'ch1', href: 'a.xhtml', title: '茶峒', spineIndex: 0, state: 'simplified' },
    { id: 'ch2', href: 'b.xhtml', title: '白塔', spineIndex: 1, state: 'simplified' },
  ],
}

function screen(overrides: Partial<Parameters<typeof ChapterListScreen>[0]> = {}) {
  return (
    <ChapterListScreen
      book={book}
      coverUrl={null}
      selected={new Set()}
      onToggleSelect={() => {}}
      onClearSelect={() => {}}
      onMeta={() => {}}
      onCover={() => {}}
      onOpenChapter={() => {}}
      onPreviewChapter={() => {}}
      onRenameChapter={() => {}}
      onInsert={() => {}}
      onDelete={() => {}}
      onMove={() => {}}
      onPreview={() => {}}
      onExport={() => {}}
      onExportMenu={() => {}}
      onInfo={() => {}}
      onMerge={() => {}}
      onMoveTo={() => {}}
      onReplaceAll={() => {}}
      {...overrides}
    />
  )
}

describe('ChapterListScreen multi-select', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides checkboxes and batch actions until a long press', () => {
    const container = render(screen())
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.textContent).not.toContain('合并所选')
  })

  it('enters select mode after long-pressing a chapter', () => {
    const onToggleSelect = vi.fn()
    const container = render(screen({ onToggleSelect }))
    const card = container.querySelector('.chapter-card')
    act(() => {
      card!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull()
    expect(container.textContent).toContain('合并所选')
    expect(onToggleSelect).toHaveBeenCalledWith('ch1')
  })

  it('keeps the multi-select checkbox compact', () => {
    const container = render(screen())
    const card = container.querySelector('.chapter-card')
    act(() => {
      card!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    const check = container.querySelector('input.chapter-check') as HTMLInputElement | null
    expect(check).toBeTruthy()
    expect(check?.className).toContain('chapter-check')
  })
})

describe('ChapterListScreen layout', () => {
  it('shows book info, actions, and chapter blocks as three sections', () => {
    const container = render(screen())
    const panels = container.querySelectorAll('.book-panel')
    expect(panels.length).toBe(3)
    expect(container.textContent).toContain('摘要')
    expect(container.textContent).toContain('书籍信息')
    expect(container.textContent).toContain('继续阅读')
    expect(container.querySelector('.book-replace input[placeholder="查找……"]')).toBeTruthy()
    expect(container.querySelector('.book-replace input[placeholder="替换内容"]')).toBeTruthy()
    expect(container.querySelectorAll('.chapter-card').length).toBe(2)
    expect(container.querySelectorAll('.book-head .field-inline').length).toBe(3)
    expect(container.querySelector('.book-head textarea')).toBeNull()
  })

  it('runs book-wide replace from the inline fields', async () => {
    const onReplaceAll = vi.fn().mockResolvedValue({ count: 3, skipped: 1 })
    const container = render(screen({ onReplaceAll }))
    const find = container.querySelector('.book-replace input[placeholder="查找……"]') as HTMLInputElement
    const replacement = container.querySelector('.book-replace input[placeholder="替换内容"]') as HTMLInputElement
    const setValue = (input: HTMLInputElement, value: string) => {
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      proto?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => {
      setValue(find, '茶峒')
      setValue(replacement, '边城')
    })
    const submit = [...container.querySelectorAll('button')].find((btn) => btn.textContent === '替换')
    await act(async () => {
      submit?.click()
    })
    expect(onReplaceAll).toHaveBeenCalledWith('茶峒', '边城')
    const hint = container.querySelector('.book-replace-hint')
    expect(hint?.textContent).toBe('共替换 3 处，1 章尚未编辑未改动')
    expect(hint?.previousElementSibling?.classList.contains('book-replace')).toBe(true)
  })
})
