import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import * as books from '../../app/bookService'
import { readingPercent } from '../../app/progress'
import { countChars, readingMinutes, textFromHtml } from '../../content/text'
import { exportChapterHeading } from '../../epub/headings'
import { shouldRenderOuterTitle } from '../../epub/plain'
import { sanitizeHtml } from '../../epub/sanitize'
import { outlineFromXhtml } from '../../epub/toc'
import { captureAnchor, restoreAnchor, type ReadingAnchor } from '../../reader/position'
import { highlightQuery } from '../../reader/highlight'
import { readerBodyCss } from '../../reader/style'
import {
  canApplyChapterJump,
  chapterIdAtScroll,
  chapterWindow,
  jumpSettled,
  mergeChapterBodies,
  nextHydrationRange,
  offsetInChapter,
  readChapterBoxes,
  scrollTopForOffset,
  type ChapterRange,
} from '../../reader/stream'
import { fontSizePx, type AppSettings } from '../../storage/settings'
import type { Annotation, BookRecord } from '../../types/book'
import { tightenBlankHtml } from '../blankLines'
import { Icon, Segmented } from '../chrome'

function chapterPreviewBody(html: string, heading: string, highlight: string): string {
  const tightened = tightenBlankHtml(html)
  const body = tightened.replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head[\s\S]*?<\/head>/gi, '').replace(/<\/?body[^>]*>/gi, '')
  const safeHeading = heading.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const title = shouldRenderOuterTitle(tightened, heading) ? `<h1>${safeHeading}</h1>` : ''
  return highlightQuery(sanitizeHtml(`${title}${body}`), highlight)
}

function wrapChapterDocument(bodyHtml: string, css: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

function escapeAttr(id: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
}

const PreviewChapter = memo(function PreviewChapter(props: {
  id: string
  html: string | null
  spacerHeight: number
}) {
  if (props.html == null) {
    return (
      <article
        className="preview-chapter is-spacer"
        data-chapter-id={props.id}
        style={{ height: props.spacerHeight }}
        aria-hidden
      />
    )
  }
  return (
    <article
      className="preview-chapter"
      data-chapter-id={props.id}
      dangerouslySetInnerHTML={{ __html: props.html }}
    />
  )
}, (prev, next) => prev.id === next.id && prev.html === next.html && (next.html !== null || prev.spacerHeight === next.spacerHeight))

export function PreviewScreen(props: {
  book: BookRecord
  startChapterId?: string
  highlight?: string
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  onBack: () => void
  onEdit: (chapterId: string) => void
  onProgress: (chapterId: string, offset: number) => void
  onOpenSettings: () => void
}) {
  const bookChaptersRef = useRef(props.book.chapters)
  bookChaptersRef.current = props.book.chapters
  const chapterListKey = props.book.chapters
    .map((ch) => `${ch.spineIndex}:${ch.id}:${ch.title}:${ch.state}`)
    .join('|')
  const chapters = useMemo(
    () => [...bookChaptersRef.current].sort((a, b) => a.spineIndex - b.spineIndex),
    [chapterListKey],
  )
  const start = Math.max(
    0,
    chapters.findIndex((ch) => ch.id === (props.startChapterId || props.book.readChapterId)),
  )
  const [index, setIndex] = useState(start < 0 ? 0 : start)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<Record<string, string | undefined>>({})
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<'toc' | 'search' | 'notes' | 'type' | null>(null)
  const [query, setQuery] = useState(props.highlight ?? '')
  const [draftQuery, setDraftQuery] = useState(props.highlight ?? '')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const requestRef = useRef(0)
  const anchorRef = useRef<ReadingAnchor | null>(null)
  const frameCleanup = useRef<() => void>(() => {})
  const turnRef = useRef<(dir: -1 | 1) => void>(() => {})
  const progressRef = useRef(props.onProgress)
  progressRef.current = props.onProgress
  const [hits, setHits] = useState<{ chapterId: string; title: string; snippet: string }[]>([])
  const [notes, setNotes] = useState<Annotation[]>([])
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [offset, setOffset] = useState(
    chapters[start < 0 ? 0 : start]?.id === props.book.readChapterId ? (props.book.readOffset ?? 0) : 0,
  )
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const heightMap = useRef(new Map<string, number>())
  const hydResetRef = useRef(true)
  const initialHyd = chapterWindow(start < 0 ? 0 : start, chapters.length)
  const hydRef = useRef<ChapterRange>(initialHyd)
  const [hyd, setHyd] = useState<ChapterRange>(initialHyd)
  const pendingJump = useRef<{ chapterId: string; offset: number } | null>(null)
  const jumpTries = useRef(0)
  const ignoreScroll = useRef(false)
  const wasPaged = useRef(props.settings.readMode === 'page')
  const indexRef = useRef(index)
  const offsetRef = useRef(0)
  const bookIdRef = useRef(props.book.id)
  const queryRef = useRef(query)
  const chapter = chapters[index]
  const paged = props.settings.readMode === 'page'
  indexRef.current = index
  offsetRef.current = offset
  bookIdRef.current = props.book.id
  queryRef.current = query

  const win = paged ? { from: index, to: index } : hyd

  const css = readerBodyCss(props.settings, chapter?.state === 'simplified')
  const streamCss = readerBodyCss(props.settings, chapter?.state === 'simplified', '.preview-chapter')
  const bodyHtml = (chapter && bodies[chapter.id]) || ''
  const pageHtml = bodyHtml ? wrapChapterDocument(bodyHtml, css) : ''
  const warning = chapter ? warnings[chapter.id] : undefined

  useEffect(() => {
    const id = props.startChapterId || props.book.readChapterId
    const list = [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
    const found = list.findIndex((ch) => ch.id === id)
    const next = found < 0 ? 0 : found
    setIndex(next)
    const target = list[next]
    pendingJump.current = target
      ? {
          chapterId: target.id,
          offset: target.id === props.book.readChapterId ? (props.book.readOffset ?? 0) : 0,
        }
      : null
    jumpTries.current = 0
    hydResetRef.current = true
    const nextHyd = chapterWindow(next, list.length)
    hydRef.current = nextHyd
    setHyd(nextHyd)
    setOffset(pendingJump.current?.offset ?? 0)
  }, [props.book.id, props.startChapterId])

  useEffect(() => {
    if (props.book.id) {
      heightMap.current = new Map()
      anchorRef.current = null
      setBodies({})
      setWarnings({})
    }
  }, [props.book.id])

  useEffect(() => {
    const from = win.from
    const to = win.to
    if (to < from) return
    const bookId = props.book.id
    const q = query
    const slice = chapters.slice(from, to + 1)
    let cancelled = false
    setError('')
    void Promise.all(
      slice.map(async (ch, offsetInSlice) => {
        const i = from + offsetInSlice
        const result = await books.getChapterPreview(bookId, ch)
        return {
          id: ch.id,
          body: chapterPreviewBody(result.html, exportChapterHeading(i, ch.title), q),
          warning: result.warning,
        }
      }),
    ).then((rows) => {
      if (cancelled || bookId !== bookIdRef.current || q !== queryRef.current) return
      setBodies((prev) => mergeChapterBodies(prev, rows))
      setWarnings((prev) => {
        let changed = false
        const next = { ...prev }
        for (const row of rows) {
          if (next[row.id] !== row.warning) {
            next[row.id] = row.warning
            changed = true
          }
        }
        return changed ? next : prev
      })
    }).catch(() => {
      if (!cancelled) setError('章节加载失败，请重试。已保存的书稿不受影响。')
    })
    return () => { cancelled = true }
  }, [chapters, paged, props.book.id, query, win.from, win.to, retry])

  useEffect(() => {
    let cancelled = false
    void books.listNotes(props.book.id).then((next) => {
      if (!cancelled) setNotes(next)
    }).catch(() => { if (!cancelled) setError('笔记读取失败，请重试。') })
    return () => { cancelled = true }
  }, [props.book.id, panel])

  useEffect(() => () => frameCleanup.current(), [])

  const jumpTo = (nextIndex: number, nextOffset = 0) => {
    if (nextIndex < 0 || nextIndex >= chapters.length) return
    if (Math.abs(nextIndex - indexRef.current) > 2) hydResetRef.current = true
    const target = chapters[nextIndex]!
    pendingJump.current = { chapterId: target.id, offset: nextOffset }
    jumpTries.current = 0
    setIndex(nextIndex)
    setOffset(nextOffset)
    setSel(null)
    props.onProgress(target.id, nextOffset)
  }

  const applyJump = (stream: HTMLElement) => {
    const jump = pendingJump.current
    if (!jump) return
    const el = stream.querySelector(`[data-chapter-id="${escapeAttr(jump.chapterId)}"]`) as HTMLElement | null
    if (!el || !bodies[jump.chapterId] || el.classList.contains('is-spacer')) return
    if (!canApplyChapterJump({ targetHeight: el.offsetHeight })) return
    const desired = scrollTopForOffset(
      stream.clientHeight,
      {
        id: jump.chapterId,
        top: el.offsetTop,
        height: el.offsetHeight,
      },
      jump.offset,
    )
    ignoreScroll.current = true
    stream.scrollTop = desired
    jumpTries.current += 1
    const maxScroll = Math.max(0, stream.scrollHeight - stream.clientHeight)
    if (jumpSettled({ desired, actual: stream.scrollTop, maxScroll, tries: jumpTries.current })) {
      pendingJump.current = null
      anchorRef.current = captureAnchor(stream)
      jumpTries.current = 0
      for (const node of stream.querySelectorAll<HTMLElement>('[data-chapter-id]')) {
        const id = node.getAttribute('data-chapter-id')
        if (id) heightMap.current.set(id, node.offsetHeight)
      }
    } else {
      window.requestAnimationFrame(() => {
        const next = streamRef.current
        if (next) applyJump(next)
      })
    }
    window.requestAnimationFrame(() => {
      ignoreScroll.current = false
    })
  }

  useLayoutEffect(() => {
    if (paged) {
      wasPaged.current = true
      return
    }
    const stream = streamRef.current
    if (!stream) return
    const reset = hydResetRef.current || wasPaged.current
    hydResetRef.current = false
    if (wasPaged.current) {
      wasPaged.current = false
      if (!pendingJump.current && chapter) {
        pendingJump.current = { chapterId: chapter.id, offset: offsetRef.current }
      }
    }
    const nextHyd = nextHydrationRange(hydRef.current, index, chapters.length, reset)
    if (nextHyd.from !== hydRef.current.from || nextHyd.to !== hydRef.current.to) {
      hydRef.current = nextHyd
      setHyd(nextHyd)
    }
    if (pendingJump.current) applyJump(stream)
    else {
      restoreAnchor(stream, anchorRef.current)
      anchorRef.current = captureAnchor(stream)
    }
  }, [bodies, chapter, chapters, index, paged, props.settings, chrome])

  useEffect(() => {
    if (paged) return
    const stream = streamRef.current
    if (!stream) return
    const nodes = [...stream.querySelectorAll<HTMLElement>('[data-chapter-id]')]
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (pendingJump.current) applyJump(stream)
      else restoreAnchor(stream, anchorRef.current)
      for (const node of nodes) {
        const id = node.getAttribute('data-chapter-id')
        if (id && !node.classList.contains('is-spacer')) heightMap.current.set(id, node.offsetHeight)
      }
      anchorRef.current = captureAnchor(stream)
    })
    ro.observe(stream)
    for (const node of nodes) ro.observe(node)
    return () => ro.disconnect()
  }, [bodies, paged, hyd.from, hyd.to, chapters.length])

  const onStreamScroll = () => {
    const stream = streamRef.current
    if (!stream || ignoreScroll.current || pendingJump.current || paged) return
    anchorRef.current = captureAnchor(stream)
    const boxes = readChapterBoxes(stream)
    const id = chapterIdAtScroll(boxes, stream.scrollTop, stream.clientHeight, stream.scrollHeight)
    const box = id ? boxes.find((item) => item.id === id) : boxes.find((item) => item.id === chapters[indexRef.current]?.id)
    if (id) {
      const next = chapters.findIndex((ch) => ch.id === id)
      if (next >= 0 && next !== indexRef.current) setIndex(next)
    }
    if (box) {
      const nextOffset = offsetInChapter(stream.scrollTop, stream.clientHeight, box)
      setOffset(nextOffset)
      props.onProgress(box.id, nextOffset)
    }
  }

  const onStreamClick = (e: MouseEvent<HTMLDivElement>) => {
    if (textSelecting(document)) return
    if ((e.target as HTMLElement).closest('a')) return
    if (panel) return
    setChrome((v) => !v)
  }

  const emitStreamSel = () => {
    const selection = document.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!text) {
      setSel(null)
      return
    }
    const node = selection?.anchorNode
    if (node && streamRef.current && !streamRef.current.contains(node)) {
      setSel(null)
      return
    }
    const range = selection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setSel({ text, x: rect.left, y: rect.bottom })
  }

  const onFrameLoad = () => {
    frameCleanup.current()
    const winFrame = frame.current?.contentWindow
    const doc = frame.current?.contentDocument
    if (!winFrame || !doc || !chapter || !bodyHtml) return
    const chapterId = chapter.id
    const el = doc.documentElement
    // srcDoc is an isolated document and does not inherit theme variables.
    const theme = getComputedStyle(document.documentElement)
    el.style.setProperty('--ink', theme.getPropertyValue('--ink'))
    const measure = () => {
      const height = Math.max(el.clientHeight, 1)
      setPages(Math.max(1, Math.ceil(el.scrollHeight / height)))
      setPage(Math.floor((el.scrollTop + 1) / height))
    }
    const restore = () => {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight) * offsetRef.current
      measure()
    }
    restore()
    if (pendingJump.current?.chapterId === chapterId) pendingJump.current = null
    const emitSel = () => {
      const selection = doc.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!text || !selection?.rangeCount) { setSel(null); return }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      const host = frame.current!.getBoundingClientRect()
      setSel({ text, x: host.left + rect.left, y: host.top + rect.bottom })
    }
    const scroll = () => {
      const max = el.scrollHeight - el.clientHeight
      const nextOffset = max <= 0 ? 0 : el.scrollTop / max
      offsetRef.current = nextOffset
      setOffset(nextOffset)
      measure()
      progressRef.current(chapterId, nextOffset)
    }
    const click = (e: globalThis.MouseEvent) => {
      if (textSelecting(doc) || (e.target as HTMLElement).closest('a')) return
      if (e.clientX < winFrame.innerWidth * 0.28) turnRef.current(-1)
      else if (e.clientX > winFrame.innerWidth * 0.72) turnRef.current(1)
      else setChrome((v) => !v)
    }
    doc.addEventListener('mouseup', emitSel)
    doc.addEventListener('touchend', emitSel)
    winFrame.addEventListener('scroll', scroll)
    winFrame.addEventListener('click', click)
    winFrame.addEventListener('resize', restore)
    doc.addEventListener('load', restore, true)
    frameCleanup.current = () => {
      doc.removeEventListener('mouseup', emitSel)
      doc.removeEventListener('touchend', emitSel)
      winFrame.removeEventListener('scroll', scroll)
      winFrame.removeEventListener('click', click)
      winFrame.removeEventListener('resize', restore)
      doc.removeEventListener('load', restore, true)
    }
  }

  const turn = (dir: -1 | 1) => {
    const doc = frame.current?.contentDocument?.documentElement
    if (!paged || !doc) {
      jumpTo(index + dir)
      return
    }
    const next = Math.floor((doc.scrollTop + 1) / Math.max(doc.clientHeight, 1)) + dir
    if (next < 0) {
      jumpTo(index - 1, 1)
      return
    }
    if (next >= Math.ceil(doc.scrollHeight / Math.max(doc.clientHeight, 1))) {
      jumpTo(index + 1)
      return
    }
    setPage(next)
    doc.scrollTop = next * doc.clientHeight
  }

  turnRef.current = turn

  const remaining = chapter
    ? readingMinutes(Math.round(countChars(textFromHtml(bodyHtml)) * (1 - offset)))
    : 0
  const percent = readingPercent(index, chapters.length, offset)

  if (!chapter) return <div className="empty">没有章节</div>

  return (
    <div className="reader">
      {chrome ? (
        <div className="reader-chrome">
          <div className="reader-top">
            <button className="icon-btn" type="button" onClick={props.onBack} aria-label="返回">
              <Icon name="back" size={22} />
            </button>
            <strong className="reader-book">{props.book.title || '未命名'}</strong>
            <button className="btn btn-line btn-compact" type="button" onClick={() => void props.onEdit(chapter.id)}>
              编辑
            </button>
          </div>
          <div className="reader-tools">
            {(
              [
                ['toc', '目录'],
                ['search', '搜索'],
                ['notes', '笔记'],
                ['type', '版式'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={panel === id ? 'is-on' : ''}
                type="button"
                onClick={() => setPanel(panel === id ? null : id)}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={props.onOpenSettings}>
              设置
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div role="alert" className="banner reader-banner"><span>{error}</span><button type="button" onClick={() => setRetry(n => n + 1)}>重试</button></div> : null}
      {!bodyHtml && !error ? <p role="status" className="reader-loading">正在加载章节…</p> : null}
      {warning ? <p className="muted preview-warning">{warning}</p> : null}

      {paged ? (
        <div className="reader-page">
          <iframe
            ref={frame}
            className="preview-frame"
            sandbox="allow-same-origin"
            srcDoc={pageHtml}
            title="阅读"
            onLoad={onFrameLoad}
          />
        </div>
      ) : (
        <div
          className="preview-stream"
          ref={streamRef}
          onScroll={onStreamScroll}
          onClick={onStreamClick}
          onMouseUp={emitStreamSel}
          onTouchEnd={emitStreamSel}
        >
          <style>{streamCss}</style>
          {chapters.map((ch, i) => (
            <PreviewChapter
              key={ch.id}
              id={ch.id}
              html={i >= hyd.from && i <= hyd.to ? (bodies[ch.id] ?? null) : null}
              spacerHeight={heightMap.current.get(ch.id) ?? 0}
            />
          ))}
        </div>
      )}

      {chrome ? (
        <div className="reader-bottom">
          <button className="btn btn-ghost btn-compact" type="button" disabled={index === 0 && page === 0} onClick={() => turn(-1)}>
            {paged ? '上一页' : '上一章'}
          </button>
          <span className="muted">
            {paged ? `${page + 1} / ${pages} · ` : ''}
            {exportChapterHeading(index, chapter.title)} · {percent}% · 约 {remaining} 分钟
          </span>
          <button
            className="btn btn-ghost btn-compact"
            type="button"
            disabled={index >= chapters.length - 1 && (!paged || page >= pages - 1)}
            onClick={() => turn(1)}
          >
            {paged ? '下一页' : '下一章'}
          </button>
        </div>
      ) : null}

      {sel ? (
        <div className="sel-pop" style={{ left: Math.max(12, sel.x), top: sel.y + 8 }}>
          <button type="button" onClick={() => void addNote('highlight', sel.text)}>
            摘抄
          </button>
          <button type="button" onClick={() => void addNote('bookmark', sel.text || chapter.title)}>
            书签
          </button>
          <button
            type="button"
            onClick={() => {
              const note = window.prompt('写一句笔记', noteDraft) ?? ''
              if (note.trim()) void addNote('note', sel.text, note)
            }}
          >
            笔记
          </button>
        </div>
      ) : null}

      {panel === 'toc' ? (
        <aside className="drawer">
          <DrawerHead title="目录" onClose={() => setPanel(null)} />
          {chapters.map((ch, i) => {
            const items = outlineFromXhtml(i === index ? bodyHtml : '')
            return (
              <div key={ch.id}>
                <button
                  className={i === index ? 'drawer-item is-on' : 'drawer-item'}
                  type="button"
                  onClick={() => {
                    jumpTo(i)
                    setPanel(null)
                  }}
                >
                  {exportChapterHeading(i, ch.title)}
                </button>
                {i === index
                  ? items.map((h) => (
                      <div key={h.id} className="drawer-sub">
                        {h.title}
                      </div>
                    ))
                  : null}
              </div>
            )
          })}
        </aside>
      ) : null}

      {panel === 'search' ? (
        <aside className="drawer">
          <DrawerHead title="全书搜索" onClose={() => setPanel(null)} />
          <div className="drawer-search">
            <input value={draftQuery} placeholder="书中的一句话" aria-label="全书搜索" onChange={(e) => { setDraftQuery(e.target.value); requestRef.current += 1; setSearching(false) }} />
            <button
              className="btn"
              type="button"
              disabled={searching || !draftQuery.trim()}
              onClick={async () => {
                const request = ++requestRef.current
                setSearching(true)
                setQuery(draftQuery)
                try {
                  const next = await books.searchBook(props.book.id, draftQuery)
                  if (request === requestRef.current) setHits(next)
                } catch { setError('搜索失败，请重试。') }
                finally { if (request === requestRef.current) setSearching(false) }
              }}
            >
              {searching ? '搜索中…' : '找'}
            </button>
          </div>
          {hits.map((hit, i) => (
            <button
              key={`${hit.chapterId}-${i}`}
              className="drawer-item"
              type="button"
              onClick={() => {
                const next = chapters.findIndex((ch) => ch.id === hit.chapterId)
                if (next >= 0) jumpTo(next)
                setPanel(null)
              }}
            >
              <strong>{hit.title}</strong>
              <div className="muted">{hit.snippet}</div>
            </button>
          ))}
        </aside>
      ) : null}

      {panel === 'notes' ? (
        <aside className="drawer">
          <DrawerHead title="书签与笔记" onClose={() => setPanel(null)} />
          <button
            className="btn btn-line btn-block"
            type="button"
            onClick={() => void addNote('bookmark', exportChapterHeading(index, chapter.title))}
          >
            在本章加书签
          </button>
          {notes.length === 0 ? <p className="muted">还没有摘抄或笔记。</p> : null}
          {notes.map((note) => (
            <article key={note.id} className="note-card">
              <div className="muted">
                {note.kind === 'bookmark' ? '书签' : note.kind === 'highlight' ? '摘抄' : '笔记'}
              </div>
              <p>{note.text}</p>
              {note.note ? <p className="muted">{note.note}</p> : null}
              <div className="note-actions">
                <button
                  className="btn btn-ghost btn-compact"
                  type="button"
                  onClick={() => {
                    const next = chapters.findIndex((ch) => ch.id === note.chapterId)
                    if (next >= 0) jumpTo(next, note.offset ?? 0)
                    setPanel(null)
                  }}
                >
                  打开
                </button>
                <button className="btn btn-ghost btn-compact is-danger" type="button" onClick={() => void books.removeNote(note.id).then(() => books.listNotes(props.book.id).then(setNotes))}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </aside>
      ) : null}

      {panel === 'type' ? (
        <aside className="drawer">
          <DrawerHead title="阅读版式" onClose={() => setPanel(null)} />
          <div className="type-row">
            <span className="settings-label">字号</span>
            <Segmented
              label="字号"
              value={props.settings.fontSize}
              options={(['s', 'm', 'l'] as const).map((size) => [size, `${size === 's' ? '小' : size === 'm' ? '中' : '大'} ${fontSizePx(size)}`] as const)}
              onChange={(fontSize) => props.onSettings({ fontSize })}
            />
          </div>
          <div className="type-row">
            <span className="settings-label">字体</span>
            <Segmented
              label="字体"
              value={props.settings.fontFamily}
              options={[
                ['serif', '宋体'],
                ['sans', '黑体'],
              ]}
              onChange={(fontFamily) => props.onSettings({ fontFamily })}
            />
          </div>
          <div className="type-row">
            <span className="settings-label">颜色</span>
            <Segmented
              label="颜色"
              value={props.settings.theme}
              options={[
                ['paper', '纸'],
                ['sepia', '护眼'],
                ['night', '夜'],
                ['system', '系统'],
              ]}
              onChange={(theme) => props.onSettings({ theme })}
            />
          </div>
          <label className="type-row">
            <span className="settings-label">
              行距 <span className="type-value">{props.settings.lineHeight.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={props.settings.lineHeight}
              onChange={(e) => props.onSettings({ lineHeight: Number(e.target.value) })}
            />
          </label>
          <label className="type-row">
            <span className="settings-label">
              页边距 <span className="type-value">{props.settings.pageMargin}</span>
            </span>
            <input
              type="range"
              min={8}
              max={36}
              step={2}
              value={props.settings.pageMargin}
              onChange={(e) => props.onSettings({ pageMargin: Number(e.target.value) })}
            />
          </label>
          <div className="type-row">
            <span className="settings-label">翻页方式</span>
            <Segmented
              label="翻页方式"
              value={props.settings.readMode}
              options={[
                ['scroll', '滚动'],
                ['page', '翻页'],
              ]}
              onChange={(readMode) => props.onSettings({ readMode })}
            />
          </div>
        </aside>
      ) : null}
    </div>
  )

  async function addNote(kind: Annotation['kind'], text: string, note?: string) {
    try {
      await books.addAnnotation(props.book.id, chapter.id, kind, text, note, offsetRef.current)
      setNotes(await books.listNotes(props.book.id))
      setSel(null)
      setNoteDraft('')
    } catch { setError('笔记保存失败，请重试。') }
  }
}

function DrawerHead(props: { title: string; onClose: () => void }) {
  return (
    <div className="drawer-head">
      <h3>{props.title}</h3>
      <button className="icon-btn" type="button" onClick={props.onClose} aria-label="关闭面板">
        <Icon name="close" />
      </button>
    </div>
  )
}

function textSelecting(doc: Document): boolean {
  const text = doc.getSelection()?.toString().trim()
  return Boolean(text)
}
