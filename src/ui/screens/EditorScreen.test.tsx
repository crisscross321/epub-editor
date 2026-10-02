import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { TiptapDoc } from '../../types/book'
import { EditorScreen } from './EditorScreen'

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

const doc: TiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '茶峒' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '近水人家。' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '白塔' }] },
  ],
}

function screen() {
  return (
    <EditorScreen
      docKey="ch1"
      doc={doc}
      pendingImage={null}
      onImageConsumed={() => {}}
      onChange={() => {}}
      onInsertImage={() => {}}
    />
  )
}

function button(container: HTMLElement, label: string) {
  return [...container.querySelectorAll('button')].find((el) => el.textContent === label)
}

describe('EditorScreen', () => {
  it('uses the contentEditable editor on web, not TipTap', () => {
    const container = render(screen())
    expect(container.textContent).not.toContain('正在打开编辑器')
    expect(container.querySelector('.tiptap')).toBeNull()
    const surface = container.querySelector('.ProseMirror[contenteditable="true"]')
    expect(surface).toBeTruthy()
    expect(surface?.textContent).toContain('茶峒')
    expect(surface?.textContent).toContain('近水人家')
  })

  it('drops the chapter title when select-all starts on its first character', () => {
    const container = render(screen())
    const surface = container.querySelector('.ProseMirror') as HTMLElement
    const first = surface.querySelector('h1')!.firstChild!
    const last = surface.querySelector('h2')!.firstChild!
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(last, last.textContent!.length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    const text = selection.toString()
    expect(text).toContain('近水人家')
    expect(text).toContain('白塔')
    expect(text).not.toContain('茶峒')
  })

  it('selects the body and later headings, not the chapter title', () => {
    const container = render(screen())
    const surface = container.querySelector('.ProseMirror') as HTMLElement
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
    act(() => {
      surface.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    const text = window.getSelection()?.toString() ?? ''
    expect(text).toContain('近水人家')
    expect(text).toContain('白塔')
    expect(text).not.toContain('茶峒')
  })

  it('opens the outline in place of the toolbar', () => {
    const container = render(screen())
    act(() => {
      button(container, '大纲')?.click()
    })
    const panel = container.querySelector('.outline-pop')
    expect(panel?.getAttribute('aria-label')).toBe('大纲')
    expect(panel?.textContent).toContain('白塔')
    expect(container.querySelector('.toolbar')).toBeNull()
    expect(container.querySelector('[aria-label="收起大纲"]')).toBeTruthy()
    act(() => {
      ;(container.querySelector('[aria-label="收起大纲"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('.outline-pop')).toBeNull()
    expect(container.querySelector('.toolbar')).toBeTruthy()
  })

  it('jumps to a heading from the outline', () => {
    const container = render(screen())
    const surface = container.querySelector('.ProseMirror') as HTMLElement
    const title = surface.querySelector('h1')!
    const start = document.createRange()
    start.selectNodeContents(title)
    start.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(start)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    act(() => {
      button(container, '大纲')?.click()
    })
    act(() => {
      button(container, '白塔')?.click()
    })
    const heading = surface.querySelector('h2')!
    expect(heading.contains(selection.anchorNode)).toBe(true)
    expect(container.querySelector('.outline-pop')).toBeNull()
  })

  it('shows chapter navigation and split when those actions are provided', () => {
    const container = render(
      <EditorScreen
        docKey="ch1"
        doc={doc}
        pendingImage={null}
        onImageConsumed={() => {}}
        onChange={() => {}}
        onInsertImage={() => {}}
        onSplit={() => {}}
        onPrevChapter={() => {}}
        onNextChapter={() => {}}
        hasPrevChapter
        hasNextChapter
      />,
    )
    expect(button(container, '拆章')).toBeTruthy()
    expect(button(container, '上一章')).toBeTruthy()
    expect(button(container, '下一章')).toBeTruthy()
  })

  it('does not depend on @tiptap packages', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    expect(names.filter((name) => name.startsWith('@tiptap/'))).toEqual([])
  })
})
