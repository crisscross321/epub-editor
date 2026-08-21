import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookRecord } from '../types/book'
import { LONG_PRESS_MS } from './selection'
import { BookshelfScreen } from './screens/BookshelfScreen'

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

function book(id: string, title: string): BookRecord {
  return {
    id,
    title,
    author: '',
    language: 'zh-CN',
    updatedAt: '2026-01-01T00:00:00.000Z',
    opfHref: 'OEBPS/content.opf',
    chapters: [],
  }
}

function shelf(overrides: Partial<Parameters<typeof BookshelfScreen>[0]> = {}) {
  return (
    <BookshelfScreen
      books={[book('a', '边城'), book('b', '围城')]}
      covers={{}}
      view="grid"
      sort="updated"
      query=""
      backupCount={0}
      onQuery={() => {}}
      onSort={() => {}}
      onView={() => {}}
      onOpen={() => {}}
      onContinue={() => {}}
      onCreate={() => {}}
      onImport={() => {}}
      onImportText={() => {}}
      onDelete={() => {}}
      onStar={() => {}}
      {...overrides}
    />
  )
}

describe('BookshelfScreen grid multi-select', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('enters select mode after a long press and shows 删除存档', () => {
    const container = render(shelf())
    const tile = [...container.querySelectorAll('.shelf-tile')].find((el) => el.textContent?.includes('边城'))
    expect(tile).toBeTruthy()
    act(() => {
      tile!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(container.textContent).toContain('删除存档')
    expect(container.textContent).toContain('收藏')
  })

  it('does not open a book that was long-pressed', () => {
    const onOpen = vi.fn()
    const container = render(shelf({ onOpen }))
    const tile = [...container.querySelectorAll('.shelf-tile')].find((el) => el.textContent?.includes('边城'))
    act(() => {
      tile!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(LONG_PRESS_MS)
      tile!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
      tile!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('deletes the selected books from the bottom bar', () => {
    const onDelete = vi.fn()
    const container = render(shelf({ onDelete }))
    const tile = [...container.querySelectorAll('.shelf-tile')].find((el) => el.textContent?.includes('边城'))
    act(() => {
      tile!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    const del = [...container.querySelectorAll('button')].find((btn) => btn.textContent === '删除存档')
    act(() => {
      del?.click()
    })
    expect(onDelete).toHaveBeenCalledWith(['a'])
  })
})

describe('BookshelfScreen chrome', () => {
  it('shows a search icon beside the query field', () => {
    const container = render(shelf())
    expect(container.querySelector('.search-wrap .search-icon')).toBeTruthy()
    expect(container.querySelector('.search-input')?.getAttribute('placeholder')).toBe('搜索书名或作者')
  })
})
