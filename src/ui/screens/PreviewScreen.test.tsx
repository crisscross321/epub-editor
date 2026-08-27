import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../storage/settings'
import type { BookRecord } from '../../types/book'

vi.mock('../../app/bookService', () => ({
  getChapterPreview: vi.fn(async (_bookId: string, chapter: { title: string }) => ({
    html: `<p>${chapter.title}</p>`,
  })),
  listNotes: vi.fn(async () => []),
  searchBook: vi.fn(async () => []),
  addAnnotation: vi.fn(async () => {}),
  removeNote: vi.fn(async () => {}),
}))

import { PreviewScreen } from './PreviewScreen'

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
    { id: 'ch3', href: 'c.xhtml', title: '翠翠', spineIndex: 2, state: 'simplified' },
  ],
}

function screen(overrides: Partial<Parameters<typeof PreviewScreen>[0]> = {}) {
  return (
    <PreviewScreen
      book={book}
      settings={defaultSettings}
      onSettings={() => {}}
      onBack={() => {}}
      onEdit={() => {}}
      onProgress={() => {}}
      onOpenSettings={() => {}}
      {...overrides}
    />
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function heading(container: HTMLElement) {
  return container.querySelector('.reader-bottom')?.textContent ?? ''
}

function button(container: HTMLElement, label: string) {
  return [...container.querySelectorAll('button')].find((el) => el.textContent === label)
}

function swipe(target: EventTarget, fromX: number, toX: number) {
  const touch = (x: number) =>
    ({
      clientX: x,
      clientY: 80,
      identifier: 0,
      target,
    }) as unknown as Touch
  const fire = (type: string, x: number) => {
    const event = new Event(type, { bubbles: true })
    Object.defineProperty(event, 'changedTouches', { value: [touch(x)] })
    target.dispatchEvent(event)
  }
  act(() => {
    fire('touchstart', fromX)
    fire('touchend', toX)
  })
}

describe('PreviewScreen chapter navigation', () => {
  it('does not switch chapters when the reader is swiped horizontally', async () => {
    const container = render(screen())
    await flush()
    const stream = container.querySelector('.preview-stream')
    expect(stream).toBeTruthy()

    expect(heading(container)).toContain('第 1 章 茶峒')
    swipe(stream!, 200, 40)
    await flush()
    expect(heading(container)).toContain('第 1 章 茶峒')
    expect(heading(container)).not.toContain('第 2 章')
  })

  it('keeps the next chapter in the scroll stream', async () => {
    const container = render(screen())
    await flush()
    const stream = container.querySelector('.preview-stream')
    expect(stream?.querySelector('[data-chapter-id="ch1"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch2"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch3"]')).toBeNull()
  })

  it('switches chapters with 上一章 and 下一章 buttons', async () => {
    const container = render(screen())
    await flush()

    expect(heading(container)).toContain('第 1 章 茶峒')
    act(() => {
      button(container, '下一章')!.click()
    })
    await flush()
    expect(heading(container)).toContain('第 2 章 白塔')
    const stream = container.querySelector('.preview-stream')
    expect(stream?.querySelector('[data-chapter-id="ch1"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch3"]')).toBeTruthy()

    act(() => {
      button(container, '上一章')!.click()
    })
    await flush()
    expect(heading(container)).toContain('第 1 章 茶峒')
  })
})
