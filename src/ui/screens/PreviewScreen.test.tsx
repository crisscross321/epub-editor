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
  return {
    container,
    rerender(next: ReactElement) {
      act(() => {
        root.render(next)
      })
    },
  }
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

describe('PreviewScreen reading controls', () => {
  it('keeps layout in the reader and does not open app settings', async () => {
    const { container } = render(screen())
    await flush()
    const tools = container.querySelector('.reader-tools')
    expect(tools?.textContent).toContain('版式')
    expect(tools?.textContent).not.toContain('设置')
    act(() => {
      button(container, '版式')!.click()
    })
    const drawer = container.querySelector('.drawer')
    expect(drawer?.textContent).toContain('字号')
    expect(drawer?.textContent).toContain('字体')
    expect(drawer?.textContent).toContain('颜色')
    expect(drawer?.textContent).toContain('行距')
    expect(drawer?.textContent).toContain('页边距')
    expect(drawer?.textContent).toContain('翻页方式')
  })
})

describe('PreviewScreen chapter navigation', () => {
  it('does not switch chapters when the reader is swiped horizontally', async () => {
    const { container } = render(screen())
    await flush()
    const stream = container.querySelector('.preview-stream')
    expect(stream).toBeTruthy()

    expect(heading(container)).toContain('第 1 章 茶峒')
    swipe(stream!, 200, 40)
    await flush()
    expect(heading(container)).toContain('第 1 章 茶峒')
    expect(heading(container)).not.toContain('第 2 章')
  })

  it('opens chapter 2 from the chapter list as 第 2 章', async () => {
    const { container } = render(screen({ startChapterId: 'ch2' }))
    await flush()
    expect(heading(container)).toContain('第 2 章 白塔')
    expect(heading(container)).not.toContain('第 1 章')
  })

  it('keeps the next chapter in the scroll stream', async () => {
    const { container } = render(screen())
    await flush()
    const stream = container.querySelector('.preview-stream')
    expect(stream?.querySelector('[data-chapter-id="ch1"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch2"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch3"]')).toBeTruthy()
  })

  it('switches chapters with 上一章 and 下一章 buttons', async () => {
    const { container } = render(screen())
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

  it('keeps a slot for every chapter, including those outside the hydration window', async () => {
    const longBook: BookRecord = {
      ...book,
      chapters: [
        ...book.chapters,
        { id: 'ch4', href: 'd.xhtml', title: '傩送', spineIndex: 3, state: 'simplified' },
        { id: 'ch5', href: 'e.xhtml', title: '渡船', spineIndex: 4, state: 'simplified' },
      ],
    }
    const { container } = render(screen({ book: longBook }))
    await flush()
    const stream = container.querySelector('.preview-stream')
    expect([...stream!.querySelectorAll('[data-chapter-id]')].map((el) => el.getAttribute('data-chapter-id'))).toEqual([
      'ch1',
      'ch2',
      'ch3',
      'ch4',
      'ch5',
    ])
  })

  it('does not unmount earlier chapters when advancing onto the last chapter', async () => {
    const { container } = render(screen({ startChapterId: 'ch2' }))
    await flush()
    act(() => {
      button(container, '下一章')!.click()
    })
    await flush()
    expect(heading(container)).toContain('第 3 章 翠翠')
    const stream = container.querySelector('.preview-stream')
    expect(stream?.querySelector('[data-chapter-id="ch1"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch2"]')).toBeTruthy()
    expect(stream?.querySelector('[data-chapter-id="ch3"]')).toBeTruthy()
  })

  it('keeps already rendered chapter HTML when only reading progress is cloned', async () => {
    const { container, rerender } = render(screen())
    await flush()
    const paragraph = container.querySelector('[data-chapter-id="ch1"] p')
    expect(paragraph).toBeTruthy()
    rerender(
      screen({
        book: {
          ...book,
          chapters: book.chapters.map((ch) => ({ ...ch })),
          readOffset: 0.8,
        },
      }),
    )
    await flush()
    expect(container.querySelector('[data-chapter-id="ch1"] p')).toBe(paragraph)
  })
})

describe('PreviewScreen with parts', () => {
  const partBook: BookRecord = {
    ...book,
    parts: [
      { id: 'p1', title: '风起' },
      { id: 'p2', title: '' },
    ],
    chapters: [
      { id: 'pro', href: 'p.xhtml', title: '楔子', spineIndex: 0, state: 'simplified', kind: 'unnumbered' },
      { id: 'ch1', href: 'a.xhtml', title: '茶峒', spineIndex: 1, state: 'simplified', partId: 'p1' },
      { id: 'ch2', href: 'b.xhtml', title: '白塔', spineIndex: 2, state: 'simplified', partId: 'p2' },
    ],
  }

  it('labels chapters without counting unnumbered ones', async () => {
    const { container } = render(screen({ book: partBook, startChapterId: 'pro' }))
    await flush()
    expect(heading(container)).toContain('楔子')
    expect(heading(container)).not.toContain('第 1 章')
    const other = render(screen({ book: partBook, startChapterId: 'ch2' }))
    await flush()
    expect(heading(other.container)).toContain('第 2 章 白塔')
  })

  it('groups the table of contents and opens only the current part', async () => {
    const { container } = render(screen({ book: partBook, startChapterId: 'ch2' }))
    await flush()
    act(() => button(container, '目录')!.click())
    const heads = [...container.querySelectorAll('.drawer-part-head')]
    expect(heads.map((el) => el.textContent)).toEqual(['第一册 风起', '第二册'])
    const items = () => [...container.querySelectorAll('.drawer .drawer-item')].map((el) => el.textContent)
    expect(items()).toEqual(['楔子', '第 2 章 白塔'])
    act(() => (heads[0] as HTMLElement).click())
    expect(items()).toEqual(['楔子', '第 1 章 茶峒', '第 2 章 白塔'])
  })
})
