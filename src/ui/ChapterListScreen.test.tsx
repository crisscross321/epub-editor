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
      onSetKind={() => {}}
      onStartPart={() => {}}
      onRenamePart={() => {}}
      onDissolvePart={() => {}}
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

const partBook: BookRecord = {
  ...book,
  id: 'b-parts',
  parts: [
    { id: 'p1', title: '风起' },
    { id: 'p2', title: '雨落' },
    { id: 'p3', title: '' },
  ],
  readChapterId: 'c3',
  chapters: [
    { id: 'pro', href: 'p.xhtml', title: '楔子', spineIndex: 0, state: 'simplified', kind: 'unnumbered' },
    { id: 'c1', href: 'c1.xhtml', title: '出发', spineIndex: 1, state: 'simplified', partId: 'p1' },
    { id: 'c2', href: 'c2.xhtml', title: '抵达', spineIndex: 2, state: 'simplified', partId: 'p1' },
    { id: 'c3', href: 'c3.xhtml', title: '回程', spineIndex: 3, state: 'simplified', partId: 'p2' },
  ],
}

function visibleCards(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.chapter-card')].map((el) => el.id.replace('chapter-', ''))
}

function click(el: Element | null | undefined) {
  act(() => {
    ;(el as HTMLElement).click()
  })
}

describe('ChapterListScreen parts', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the flat list when a book has no parts', () => {
    const container = render(screen())
    expect(container.querySelector('.part-switch')).toBeNull()
    expect(container.querySelector('.part-head')).toBeNull()
    expect(container.querySelector('.chapter-index')?.textContent).toBe('第 1 章')
  })

  it('opens only the part holding the current chapter by default', () => {
    const container = render(screen({ book: partBook, focusChapterId: 'c3' }))
    expect([...container.querySelectorAll('.part-title')].map((el) => el.textContent)).toEqual([
      '第一册 风起',
      '第二册 雨落',
      '第三册',
    ])
    expect(visibleCards(container)).toEqual(['pro', 'c3'])
    expect(container.querySelector('#part-p1 .part-meta')?.textContent).toBe('第 1–2 章')
    expect(container.querySelector('#chapter-pro .chapter-index')?.textContent).toBe('不编号')
  })

  it('switches to one part from the switch bar and remembers manual folds', () => {
    const container = render(screen({ book: partBook, focusChapterId: 'c3' }))
    const chips = container.querySelectorAll('.part-switch-list button')
    click(chips[0])
    expect(visibleCards(container)).toEqual(['pro', 'c1', 'c2'])
    expect(JSON.parse(localStorage.getItem('sujian.partFold.b-parts')!)).toEqual(['p2', 'p3'])

    const again = render(screen({ book: partBook, focusChapterId: 'c3' }))
    expect(visibleCards(again)).toEqual(['pro', 'c1', 'c2', 'c3'])
  })

  it('expands everything and collapses everything', () => {
    const container = render(screen({ book: partBook }))
    const [expandAll, collapseAll] = [...container.querySelectorAll('.part-switch > .text-action')]
    click(expandAll)
    expect(visibleCards(container)).toEqual(['pro', 'c1', 'c2', 'c3'])
    expect(container.querySelector('.part-empty')).not.toBeNull()
    click(collapseAll)
    expect(visibleCards(container)).toEqual(['pro'])
  })

  it('reveals the part a chapter moves into', () => {
    const container = render(screen({ book: partBook, focusChapterId: 'c1' }))
    expect(visibleCards(container)).toEqual(['pro', 'c1', 'c2'])
    const moved = { ...partBook, chapters: partBook.chapters.map((ch) => (ch.id === 'c2' ? { ...ch, partId: 'p2' } : ch)) }
    act(() => {
      roots.at(-1)!.root.render(screen({ book: moved, focusChapterId: 'c1' }))
    })
    expect(visibleCards(container)).toEqual(['pro', 'c1', 'c2', 'c3'])
  })

  it('changes chapter kind and starts a part from the badge menu', () => {
    const onSetKind = vi.fn()
    const onStartPart = vi.fn()
    const container = render(screen({ onSetKind, onStartPart }))
    click(container.querySelector('#chapter-ch2 .chapter-index-btn'))
    const options = container.querySelectorAll('#chapter-ch2 .chapter-menu .seg button')
    click(options[1])
    expect(onSetKind).toHaveBeenCalledWith('ch2', 'unnumbered')
    click([...container.querySelectorAll('#chapter-ch2 .chapter-menu button')].find((b) => b.textContent?.includes('新的一册')))
    expect(onStartPart).toHaveBeenCalledWith('ch2')
  })

  it('renames and dissolves a part from its header', () => {
    const onRenamePart = vi.fn()
    const onDissolvePart = vi.fn()
    const container = render(screen({ book: partBook, onRenamePart, onDissolvePart }))
    click(container.querySelector('#part-p2 .part-edit'))
    const input = container.querySelector('.part-editor input') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '归途')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onRenamePart).toHaveBeenCalledWith('p2', '归途')
    click([...container.querySelectorAll('.part-editor button')].find((b) => b.textContent === '取消分册'))
    expect(onDissolvePart).toHaveBeenCalledWith('p2')
  })

  it('lets the first chapter of a part move up into the previous one', () => {
    const container = render(screen({ book: partBook, focusChapterId: 'c3' }))
    const up = container.querySelector('#chapter-c3 button[aria-label="上移"]') as HTMLButtonElement
    const down = container.querySelector('#chapter-c3 button[aria-label="下移"]') as HTMLButtonElement
    const topUp = container.querySelector('#chapter-pro button[aria-label="上移"]') as HTMLButtonElement
    expect(up.disabled).toBe(false)
    expect(down.disabled).toBe(false)
    expect(topUp.disabled).toBe(true)
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
    expect(container.querySelector('.book-head textarea')?.getAttribute('rows')).toBe('2')
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
