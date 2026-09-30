import { useRef, useState } from 'react'
import { displayChapterName } from '../../epub/headings'
import type { BookRecord } from '../../types/book'
import { Icon } from '../chrome'
import { LONG_PRESS_MS, toggleSelected } from '../selection'

function isChrome(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('button, input, textarea, a, label'))
}

export function ChapterListScreen(props: {
  book: BookRecord
  coverUrl: string | null
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onClearSelect: () => void
  onMeta: (patch: { title?: string; author?: string; description?: string }) => void
  onCover: () => void
  onOpenChapter: (id: string) => void
  onPreviewChapter: (id: string) => void
  onRenameChapter: (id: string, title: string) => void
  onInsert: (afterId: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onPreview: () => void
  onExport: () => void
  onExportMenu: () => void
  onInfo: () => void
  onMerge: () => void
  onMoveTo: () => void
  onReplaceAll: (search: string, replacement: string) => void | Promise<{ count: number; skipped: number } | void>
}) {
  const chapters = [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const [selecting, setSelecting] = useState(false)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [replaceHint, setReplaceHint] = useState('')
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  const clearPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const startPress = (id: string) => {
    longPressed.current = false
    clearPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setSelecting(true)
      if (!props.selected.has(id)) props.onToggleSelect(id)
    }, LONG_PRESS_MS)
  }

  const exitSelect = () => {
    setSelecting(false)
    props.onClearSelect()
  }

  const runReplace = () => {
    if (!find) return
    void Promise.resolve(props.onReplaceAll(find, replace)).then((result) => {
      if (!result) return
      const extra = result.skipped ? `，${result.skipped} 章尚未编辑未改动` : ''
      setReplaceHint(`共替换 ${result.count} 处${extra}`)
    })
  }

  return (
    <div className={selecting ? 'screen screen-selecting' : 'screen'}>
      <section className="book-panel">
        <div className="book-head">
          <div className="book-head-main">
            <div className="book-head-fields">
              <div className="field field-inline">
                <label>书名</label>
                <input value={props.book.title} onChange={(e) => props.onMeta({ title: e.target.value })} />
              </div>
              <div className="field field-inline">
                <label>作者</label>
                <input value={props.book.author} onChange={(e) => props.onMeta({ author: e.target.value })} />
              </div>
              <div className="field field-inline field-abstract">
                <label>摘要</label>
                <textarea
                  rows={2}
                  value={props.book.description ?? ''}
                  onChange={(e) => props.onMeta({ description: e.target.value })}
                />
              </div>
            </div>
            <button className="text-action" type="button" onClick={props.onInfo}>
              书籍信息
              <Icon name="chevron" size={14} />
            </button>
          </div>
          <div className="book-head-cover">
            {props.coverUrl ? (
              <img className="cover cover-lg" src={props.coverUrl} alt="封面" />
            ) : (
              <div className="cover cover-lg cover-empty">暂无封面</div>
            )}
            <button className="text-action" type="button" onClick={props.onCover}>
              设置封面
            </button>
          </div>
        </div>
        {props.book.sourceName ? <p className="muted">来源 {props.book.sourceName}</p> : null}
      </section>

      <section className="book-panel">
        <div className="action-grid">
          <button className="btn" type="button" onClick={props.onPreview}>
            继续阅读
          </button>
          <button className="btn btn-line" type="button" onClick={props.onExport}>
            导出 EPUB
          </button>
          <button className="btn btn-line" type="button" onClick={props.onExportMenu}>
            更多导出
          </button>
        </div>
        {selecting ? (
          <p className="select-hint">已选 {props.selected.size} 章 · 长按或点选章节</p>
        ) : (
          <form
            className="book-replace"
            onSubmit={(e) => {
              e.preventDefault()
              runReplace()
            }}
          >
            <span className="book-replace-label">全书替换</span>
            <input
              value={find}
              placeholder="查找……"
              aria-label="查找"
              onChange={(e) => {
                setFind(e.target.value)
                setReplaceHint('')
              }}
            />
            <span className="book-replace-arrow" aria-hidden="true">→</span>
            <input
              value={replace}
              placeholder="替换内容"
              aria-label="替换内容"
              onChange={(e) => {
                setReplace(e.target.value)
                setReplaceHint('')
              }}
            />
            <button className="btn btn-line btn-compact" type="submit">
              替换
            </button>
          </form>
        )}
        {!selecting && replaceHint ? <p className="book-replace-hint">{replaceHint}</p> : null}
      </section>

      <section className="book-panel book-panel-chapters">
        {chapters.map((ch, index) => (
          <article
            key={ch.id}
            className={props.selected.has(ch.id) && selecting ? 'chapter-card is-picked' : 'chapter-card'}
            onPointerDown={(e) => {
              if (e.button !== 0 || isChrome(e.target)) return
              startPress(ch.id)
            }}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              if (longPressed.current) {
                longPressed.current = false
                e.preventDefault()
                return
              }
              if (!selecting || isChrome(e.target)) return
              const next = toggleSelected(props.selected, ch.id)
              props.onToggleSelect(ch.id)
              if (next.size === 0) exitSelect()
            }}
          >
            <div className="chapter-title-row">
              {selecting ? (
                <input
                  type="checkbox"
                  className="chapter-check"
                  checked={props.selected.has(ch.id)}
                  onChange={() => {
                    const next = toggleSelected(props.selected, ch.id)
                    props.onToggleSelect(ch.id)
                    if (next.size === 0) exitSelect()
                  }}
                  aria-label="选择章节"
                />
              ) : null}
              <span className="chapter-index">第 {index + 1} 章</span>
              <input
                value={displayChapterName(ch.title)}
                aria-label="章节名"
                placeholder="章节名"
                onChange={(e) => props.onRenameChapter(ch.id, e.target.value)}
              />
            </div>
            {ch.state === 'pristine' ? <div className="chapter-note">原样保留 · 打开编辑后将简化排版</div> : null}
            {selecting ? null : (
              <div className="chapter-actions">
                <button className="btn btn-line" type="button" onClick={() => props.onPreviewChapter(ch.id)}>
                  预览
                </button>
                <button className="btn btn-line" type="button" onClick={() => props.onOpenChapter(ch.id)}>
                  编辑
                </button>
                <span className="chapter-actions-gap" />
                <button className="icon-btn" type="button" aria-label="上移" disabled={index === 0} onClick={() => props.onMove(ch.id, -1)}>
                  <Icon name="up" size={18} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="下移"
                  disabled={index === chapters.length - 1}
                  onClick={() => props.onMove(ch.id, 1)}
                >
                  <Icon name="down" size={18} />
                </button>
                <button className="icon-btn" type="button" aria-label="在后面新增一章" onClick={() => props.onInsert(ch.id)}>
                  <Icon name="plus" size={18} />
                </button>
                <button className="icon-btn icon-danger" type="button" aria-label="删除" onClick={() => props.onDelete(ch.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      {selecting ? (
        <div className="shelf-actionbar">
          <button className="btn btn-ghost" type="button" onClick={exitSelect}>
            取消
          </button>
          <button className="btn btn-line" type="button" onClick={props.onMerge}>
            合并所选
          </button>
          <button className="btn" type="button" onClick={props.onMoveTo}>
            移到第 N 章
          </button>
        </div>
      ) : null}
    </div>
  )
}
