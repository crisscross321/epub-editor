import { useEffect, useMemo, useRef, useState } from 'react'
import { displayChapterName } from '../../epub/headings'
import { bookOutline, canMoveChapter, chineseNumber, kindOf, partWordOf, type PartGroup } from '../../epub/parts'
import { initialCollapsed, loadPartFold, savePartFold } from '../../storage/partFold'
import type { BookRecord, ChapterIndex, ChapterKind } from '../../types/book'
import { Icon, Segmented } from '../chrome'
import { LONG_PRESS_MS, toggleSelected } from '../selection'

function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function isChrome(target: EventTarget | null): boolean {
  const el = eventElement(target)
  if (!el || el.closest('.chapter-name')) return false
  return Boolean(el.closest('button, input, textarea, a, label'))
}

function blockTextSelection(event: Event) {
  const el = eventElement(event.target)
  const field = el?.closest('input:not([type="checkbox"]), textarea')
  if (field && document.activeElement === field) return
  event.preventDefault()
}

function rangeText(group: PartGroup): string {
  if (!group.range) return group.chapters.length ? `${group.chapters.length} 项` : '暂无章节'
  const [from, to] = group.range
  return from === to ? `第 ${from} 章` : `第 ${from}–${to} 章`
}

export function ChapterListScreen(props: {
  book: BookRecord
  coverUrl: string | null
  selected: Set<string>
  focusChapterId?: string
  onToggleSelect: (id: string) => void
  onClearSelect: () => void
  onMeta: (patch: { title?: string; author?: string; description?: string }) => void
  onCover: () => void
  onOpenChapter: (id: string) => void
  onPreviewChapter: (id: string) => void
  onRenameChapter: (id: string, title: string) => void
  onSetKind: (id: string, kind: ChapterKind) => void
  onStartPart: (id: string) => void
  onRenamePart: (partId: string, title: string) => void
  onDissolvePart: (partId: string) => void
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
  const outline = useMemo(() => bookOutline(props.book), [props.book])
  const partIds = (props.book.parts ?? []).map((part) => part.id)
  const hasParts = partIds.length > 0
  const word = partWordOf(props.book)
  const [selecting, setSelecting] = useState(false)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [replaceHint, setReplaceHint] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editingPart, setEditingPart] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() =>
    initialCollapsed(
      partIds,
      loadPartFold(props.book.id),
      props.focusChapterId ? outline.groupOf.get(props.focusChapterId)?.part?.id : undefined,
    ),
  )
  const pressTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const longPressed = useRef(false)
  const placement = useRef<Map<string, string | undefined> | null>(null)
  const chaptersRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = chaptersRef.current
    if (!root) return
    root.addEventListener('selectstart', blockTextSelection)
    return () => root.removeEventListener('selectstart', blockTextSelection)
  }, [])

  useEffect(() => {
    const next = new Map(props.book.chapters.map((ch) => [ch.id, ch.partId]))
    const prev = placement.current
    placement.current = next
    if (!prev) return
    const reveal = new Set<string>()
    for (const [id, partId] of next) {
      if (prev.has(id) && prev.get(id) === partId) continue
      const target = outline.groupOf.get(id)?.part?.id
      if (target) reveal.add(target)
    }
    if (reveal.size === 0) return
    setCollapsed((current) => {
      if (![...reveal].some((id) => current.has(id))) return current
      const updated = new Set(current)
      reveal.forEach((id) => updated.delete(id))
      return updated
    })
  }, [props.book.chapters, outline])

  useEffect(() => {
    if (!hasParts || !props.focusChapterId) return
    const id = props.focusChapterId
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`chapter-${id}`)?.scrollIntoView?.({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
    // Only on arrival: later edits must not yank the list back.
  }, [])

  const commitFold = (next: Set<string>) => {
    setCollapsed(next)
    savePartFold(props.book.id, next)
  }

  const togglePart = (partId: string) => {
    const next = new Set(collapsed)
    if (next.has(partId)) next.delete(partId)
    else next.add(partId)
    commitFold(next)
  }

  const showOnlyPart = (partId: string) => {
    commitFold(new Set(partIds.filter((id) => id !== partId)))
    window.requestAnimationFrame(() => {
      document.getElementById(`part-${partId}`)?.scrollIntoView?.({ block: 'start' })
    })
  }

  const clearPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressOrigin.current = null
  }

  const startPress = (id: string, point: { x: number; y: number }) => {
    longPressed.current = false
    clearPress()
    pressOrigin.current = point
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setEditingTitle(null)
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest('.chapter-card')) active.blur()
      window.getSelection()?.removeAllRanges()
      setSelecting(true)
      setMenuFor(null)
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

  const renderCard = (ch: ChapterIndex) => {
    const kind = kindOf(ch)
    const number = outline.numbers.get(ch.id)
    const badge = number ? `第 ${number} 章` : '不编号'
    const name = displayChapterName(ch.title)
    const namePlaceholder = kind === 'unnumbered' ? '标题，如 楔子' : '章节名'
    const editingThisTitle = editingTitle === ch.id && !selecting
    const group = outline.groupOf.get(ch.id)
    const leadsPart = Boolean(group?.part && group.chapters[0]?.id === ch.id)
    return (
      <article
        key={ch.id}
        id={`chapter-${ch.id}`}
        className={props.selected.has(ch.id) && selecting ? 'chapter-card is-picked' : 'chapter-card'}
        onPointerDown={(e) => {
          if (e.button !== 0 || isChrome(e.target)) return
          startPress(ch.id, { x: e.clientX, y: e.clientY })
        }}
        onPointerMove={(e) => {
          const origin = pressOrigin.current
          if (!origin) return
          if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 12) clearPress()
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
          {selecting ? (
            <span className={kind === 'unnumbered' ? 'chapter-index is-unnumbered' : 'chapter-index'}>{badge}</span>
          ) : (
            <button
              type="button"
              className={kind === 'unnumbered' ? 'chapter-index chapter-index-btn is-unnumbered' : 'chapter-index chapter-index-btn'}
              aria-label={`${badge}，更改章节类型`}
              aria-expanded={menuFor === ch.id}
              onClick={() => setMenuFor(menuFor === ch.id ? null : ch.id)}
            >
              {badge}
            </button>
          )}
          {editingThisTitle ? (
            <input
              value={name}
              aria-label="章节名"
              placeholder={namePlaceholder}
              autoFocus
              onBlur={() => setEditingTitle((current) => (current === ch.id ? null : current))}
              onChange={(e) => props.onRenameChapter(ch.id, e.target.value)}
            />
          ) : (
            <button
              type="button"
              className={name ? 'chapter-name' : 'chapter-name is-empty'}
              onClick={(e) => {
                if (longPressed.current || selecting) return
                e.stopPropagation()
                setEditingTitle(ch.id)
              }}
            >
              {name || namePlaceholder}
            </button>
          )}
        </div>
        {menuFor === ch.id && !selecting ? (
          <div className="chapter-menu">
            <Segmented
              label="章节类型"
              value={kind}
              options={[
                ['chapter', '正文章'],
                ['unnumbered', '不编号'],
              ]}
              onChange={(next) => props.onSetKind(ch.id, next)}
            />
            <p className="chapter-menu-hint">序章、楔子、后记、番外可设为不编号，不占章号。</p>
            {leadsPart ? null : (
              <button
                className="btn btn-line btn-compact"
                type="button"
                onClick={() => {
                  setMenuFor(null)
                  props.onStartPart(ch.id)
                }}
              >
                从这里开始新的一{word}
              </button>
            )}
          </div>
        ) : null}
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
            <button
              className="icon-btn"
              type="button"
              aria-label="上移"
              disabled={!canMoveChapter(props.book, ch.id, -1)}
              onClick={() => props.onMove(ch.id, -1)}
            >
              <Icon name="up" size={18} />
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="下移"
              disabled={!canMoveChapter(props.book, ch.id, 1)}
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
    )
  }

  const renderPart = (group: PartGroup) => {
    const part = group.part!
    const isCollapsed = collapsed.has(part.id)
    const picked = selecting ? group.chapters.filter((ch) => props.selected.has(ch.id)).length : 0
    const meta = [rangeText(group), picked ? `已选 ${picked} 章` : ''].filter(Boolean).join(' · ')
    const editing = editingPart === part.id
    return (
      <div className="part-block" key={part.id}>
        <div className="part-head" id={`part-${part.id}`}>
          <button className="part-toggle" type="button" aria-expanded={!isCollapsed} onClick={() => togglePart(part.id)}>
            <span className={isCollapsed ? 'part-chevron' : 'part-chevron is-open'}>
              <Icon name="chevron" size={16} />
            </span>
            <span className="part-title">{group.heading}</span>
            <span className="part-meta">{meta}</span>
          </button>
          {selecting ? null : (
            <button className="text-action part-edit" type="button" onClick={() => setEditingPart(editing ? null : part.id)}>
              {editing ? '完成' : '编辑'}
            </button>
          )}
        </div>
        {editing && !selecting ? (
          <div className="part-editor">
            <input
              value={part.title}
              aria-label={`${word}名`}
              placeholder={`${word}名（可不填）`}
              onChange={(e) => props.onRenamePart(part.id, e.target.value)}
            />
            <button
              className="btn btn-line btn-compact"
              type="button"
              onClick={() => {
                setEditingPart(null)
                props.onDissolvePart(part.id)
              }}
            >
              取消分{word}
            </button>
          </div>
        ) : null}
        {isCollapsed ? null : group.chapters.length ? (
          group.chapters.map(renderCard)
        ) : (
          <p className="part-empty">这一{word}还没有章节。把上一{word}最后一章下移，或下一{word}第一章上移，就能移进来。</p>
        )}
      </div>
    )
  }

  const partGroups = outline.groups.filter((group) => group.part)

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

      <section
        ref={chaptersRef}
        className={hasParts ? 'book-panel book-panel-chapters has-parts' : 'book-panel book-panel-chapters'}
      >
        {hasParts ? (
          <div className="part-switch" role="toolbar" aria-label={`分${word}切换`}>
            <div className="part-switch-list">
              {partGroups.map((group, i) => (
                <button
                  key={group.part!.id}
                  type="button"
                  className={collapsed.has(group.part!.id) ? '' : 'is-on'}
                  onClick={() => showOnlyPart(group.part!.id)}
                >
                  第{chineseNumber(i + 1)}{word}
                </button>
              ))}
            </div>
            <button className="text-action" type="button" onClick={() => commitFold(new Set())}>
              全部展开
            </button>
            <button className="text-action" type="button" onClick={() => commitFold(new Set(partIds))}>
              全部收起
            </button>
          </div>
        ) : null}
        {outline.groups.map((group) => (group.part ? renderPart(group) : group.chapters.map(renderCard)))}
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
            移到第 N 个位置
          </button>
        </div>
      ) : null}
    </div>
  )
}
