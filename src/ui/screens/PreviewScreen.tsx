import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import * as books from '../../app/bookService'
import { readingPercent } from '../../app/progress'
import { countChars, readingMinutes, textFromHtml } from '../../content/text'
import { exportChapterHeading } from '../../epub/headings'
import { shouldRenderOuterTitle } from '../../epub/plain'
import { sanitizeHtml } from '../../epub/sanitize'
import { outlineFromXhtml } from '../../epub/toc'
import { highlightQuery } from '../../reader/highlight'
import { readerBodyCss } from '../../reader/style'
import {
  canApplyChapterJump,
  chapterIdAtScroll,
  chapterWindow,
  offsetInChapter,
  readChapterBoxes,
  scrollDeltaForWindowShift,
  scrollTopForOffset,
  shouldShiftScrollForResize,
} from '../../reader/stream'
import { fontSizePx, type AppSettings } from '../../storage/settings'
import type { Annotation, BookRecord } from '../../types/book'
import { tightenBlankHtml } from '../blankLines'

function chapterPreviewBody(html: string, heading: string, highlight: string): string {
  const tightened = tightenBlankHtml(html)
  const body = tightened.replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head[\s\S]*?<\/head>/gi, '').replace(/<\/?body[^>]*>/gi, '')
  const title = shouldRenderOuterTitle(tightened, heading) ? `<h1>${heading}</h1>` : ''
  return highlightQuery(sanitizeHtml(`${title}${body}`), highlight)
}

function wrapChapterDocument(bodyHtml: string, css: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

function escapeAttr(id: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
}

function previousChapterElement(el: HTMLElement): HTMLElement | null {
  let prev = el.previousElementSibling as HTMLElement | null
  while (prev && !prev.hasAttribute('data-chapter-id')) {
    prev = prev.previousElementSibling as HTMLElement | null
  }
  return prev
}

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
  const chapters = useMemo(
    () => [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex),
    [props.book.chapters],
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
  const windowFromRef = useRef(0)
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

  const win = paged ? { from: index, to: index } : chapterWindow(index, chapters.length)
  const windowChapters = chapters.slice(Math.max(0, win.from), Math.max(0, win.to + 1))

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
    windowFromRef.current = chapterWindow(next, list.length).from
    setOffset(pendingJump.current?.offset ?? 0)
  }, [props.book.id, props.startChapterId])

  useEffect(() => {
    if (props.book.id) {
      heightMap.current = new Map()
      setBodies({})
      setWarnings({})
    }
  }, [props.book.id, query])

  useEffect(() => {
    const from = win.from
    const to = win.to
    if (to < from) return
    const bookId = props.book.id
    const q = query
    const slice = chapters.slice(from, to + 1)
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
      if (bookId !== bookIdRef.current || q !== queryRef.current) return
      setBodies((prev) => {
        const next = { ...prev }
        for (const row of rows) next[row.id] = row.body
        return next
      })
      setWarnings((prev) => {
        const next = { ...prev }
        for (const row of rows) next[row.id] = row.warning
        return next
      })
      if (paged) setPage(0)
    })
  }, [chapters, paged, props.book.id, query, win.from, win.to])

  useEffect(() => {
    void books.listNotes(props.book.id).then(setNotes)
  }, [props.book.id, panel])

  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc?.documentElement || !paged) return
    const el = doc.documentElement
    const next = Math.max(1, Math.ceil(el.scrollHeight / Math.max(el.clientHeight, 1)))
    setPages(next)
  }, [pageHtml, paged, props.settings])

  const jumpTo = (nextIndex: number, nextOffset = 0) => {
    if (nextIndex < 0 || nextIndex >= chapters.length) return
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
    if (!el) return
    const prev = previousChapterElement(el)
    if (
      !canApplyChapterJump({
        targetHeight: el.offsetHeight,
        previousHeight: prev ? prev.offsetHeight : null,
      })
    ) {
      return
    }
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
    const aligned = jump.offset === 0 ? Math.abs(el.offsetTop - stream.scrollTop) <= 8 : true
    if (aligned) {
      pendingJump.current = null
      jumpTries.current = 0
      for (const node of stream.querySelectorAll<HTMLElement>('[data-chapter-id]')) {
        const id = node.getAttribute('data-chapter-id')
        if (id) heightMap.current.set(id, node.offsetHeight)
      }
    } else {
      jumpTries.current += 1
      if (jumpTries.current > 30) {
        pendingJump.current = null
        jumpTries.current = 0
      } else {
        window.requestAnimationFrame(() => {
          const next = streamRef.current
          if (next) applyJump(next)
        })
      }
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
    const { from } = chapterWindow(index, chapters.length)
    if (wasPaged.current) {
      wasPaged.current = false
      windowFromRef.current = from
      if (!pendingJump.current && chapter) {
        pendingJump.current = { chapterId: chapter.id, offset: offsetRef.current }
      }
    } else if (from !== windowFromRef.current) {
      ignoreScroll.current = true
      stream.scrollTop += scrollDeltaForWindowShift(
        windowFromRef.current,
        from,
        (i) => heightMap.current.get(chapters[i]?.id ?? '') ?? 0,
      )
      windowFromRef.current = from
      window.requestAnimationFrame(() => {
        ignoreScroll.current = false
      })
    }
    applyJump(stream)
  }, [bodies, chapter, chapters, index, paged, win.from])

  useEffect(() => {
    if (paged) return
    const stream = streamRef.current
    if (!stream) return
    const nodes = [...stream.querySelectorAll<HTMLElement>('[data-chapter-id]')]
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const id = el.getAttribute('data-chapter-id')
        if (!id) continue
        const nextH = el.offsetHeight
        const prevH = heightMap.current.get(id)
        heightMap.current.set(id, nextH)
        if (pendingJump.current || prevH == null || prevH === 0) {
          if (pendingJump.current) applyJump(stream)
          continue
        }
        const currentId = chapters[indexRef.current]?.id
        const currentEl = currentId
          ? (stream.querySelector(`[data-chapter-id="${escapeAttr(currentId)}"]`) as HTMLElement | null)
          : null
        const resizedIsBeforeCurrent = Boolean(
          currentEl && (el.compareDocumentPosition(currentEl) & Node.DOCUMENT_POSITION_FOLLOWING),
        )
        if (shouldShiftScrollForResize(resizedIsBeforeCurrent, nextH - prevH)) {
          ignoreScroll.current = true
          stream.scrollTop += nextH - prevH
          window.requestAnimationFrame(() => {
            ignoreScroll.current = false
          })
        }
      }
      if (pendingJump.current) applyJump(stream)
    })
    for (const node of nodes) ro.observe(node)
    return () => ro.disconnect()
  }, [bodies, paged, win.from, win.to])

  const onStreamScroll = () => {
    const stream = streamRef.current
    if (!stream || ignoreScroll.current || paged) return
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
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    if (x < w * 0.22) jumpTo(index - 1)
    else if (x > w * 0.78) jumpTo(index + 1)
    else setChrome((v) => !v)
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
    const winFrame = frame.current?.contentWindow
    const doc = frame.current?.contentDocument
    if (!winFrame || !doc) return
    const emitSel = () => {
      const selection = doc.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!text) {
        setSel(null)
        return
      }
      const range = selection!.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSel({ text, x: rect.left, y: rect.bottom })
    }
    doc.addEventListener('mouseup', emitSel)
    doc.addEventListener('touchend', emitSel)
    winFrame.addEventListener('scroll', () => {
      const el = doc.documentElement
      const max = el.scrollHeight - el.clientHeight
      const nextOffset = max <= 0 ? 1 : el.scrollTop / max
      setOffset(nextOffset)
      if (chapter) props.onProgress(chapter.id, nextOffset)
    })
    winFrame.addEventListener('click', (e) => {
      const x = e.clientX
      const w = winFrame.innerWidth
      if (textSelecting(doc)) return
      if (x < w * 0.28) turn(-1)
      else if (x > w * 0.72) turn(1)
      else setChrome((v) => !v)
    })
  }

  const turn = (dir: -1 | 1) => {
    const doc = frame.current?.contentDocument?.documentElement
    if (!paged || !doc) {
      jumpTo(index + dir)
      return
    }
    const next = page + dir
    if (next < 0) {
      jumpTo(index - 1)
      return
    }
    if (next >= pages) {
      jumpTo(index + 1)
      return
    }
    setPage(next)
    doc.scrollTop = next * doc.clientHeight
  }

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
              ←
            </button>
            <strong className="reader-book">{props.book.title || '未命名'}</strong>
            <button className="btn btn-ghost btn-compact" type="button" onClick={() => void props.onEdit(chapter.id)}>
              编辑
            </button>
          </div>
          <div className="reader-tools">
            <button className="btn btn-ghost btn-compact" type="button" onClick={() => setPanel(panel === 'toc' ? null : 'toc')}>
              目录
            </button>
            <button className="btn btn-ghost btn-compact" type="button" onClick={() => setPanel(panel === 'search' ? null : 'search')}>
              搜索
            </button>
            <button className="btn btn-ghost btn-compact" type="button" onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>
              笔记
            </button>
            <button className="btn btn-ghost btn-compact" type="button" onClick={() => setPanel(panel === 'type' ? null : 'type')}>
              版式
            </button>
            <button className="btn btn-ghost btn-compact" type="button" onClick={props.onOpenSettings}>
              设置
            </button>
          </div>
        </div>
      ) : null}

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
          {windowChapters.map((ch) => (
            <article
              key={ch.id}
              className="preview-chapter"
              data-chapter-id={ch.id}
              dangerouslySetInnerHTML={{ __html: bodies[ch.id] ?? '' }}
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
            disabled={index >= chapters.length - 1 && page >= pages - 1}
            onClick={() => turn(1)}
          >
            {paged ? '下一页' : '下一章'}
          </button>
        </div>
      ) : null}

      {sel ? (
        <div className="sel-pop" style={{ left: Math.max(12, sel.x), top: sel.y + (paged ? 48 : 8) }}>
          <button type="button" onClick={() => void addNote('highlight', sel.text)}>
            划线
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
          <h3>目录</h3>
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
          <h3>全书搜索</h3>
          <div className="row">
            <input value={query} placeholder="书中的一句话" onChange={(e) => setQuery(e.target.value)} />
            <button
              className="btn"
              type="button"
              onClick={() => void books.searchBook(props.book.id, query).then(setHits)}
            >
              找
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
          <h3>书签与笔记</h3>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void addNote('bookmark', exportChapterHeading(index, chapter.title))}
          >
            在本章加书签
          </button>
          {notes.length === 0 ? <p className="muted">还没有划线或笔记。</p> : null}
          {notes.map((note) => (
            <article key={note.id} className="note-card">
              <div className="muted">
                {note.kind === 'bookmark' ? '书签' : note.kind === 'highlight' ? '划线' : '笔记'}
              </div>
              <p>{note.text}</p>
              {note.note ? <p className="muted">{note.note}</p> : null}
              <div className="row">
                <button
                  className="btn btn-ghost btn-compact"
                  type="button"
                  onClick={() => {
                    const next = chapters.findIndex((ch) => ch.id === note.chapterId)
                    if (next >= 0) jumpTo(next)
                    setPanel(null)
                  }}
                >
                  打开
                </button>
                <button className="btn btn-ghost btn-compact" type="button" onClick={() => void books.removeNote(note.id).then(() => books.listNotes(props.book.id).then(setNotes))}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </aside>
      ) : null}

      {panel === 'type' ? (
        <aside className="drawer">
          <h3>阅读版式</h3>
          <div className="row">
            {(['s', 'm', 'l'] as const).map((size) => (
              <button
                key={size}
                className={props.settings.fontSize === size ? 'btn' : 'btn btn-ghost'}
                type="button"
                onClick={() => props.onSettings({ fontSize: size })}
              >
                {size === 's' ? '小' : size === 'm' ? '中' : '大'} {fontSizePx(size)}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className={props.settings.fontFamily === 'serif' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ fontFamily: 'serif' })}>
              宋体
            </button>
            <button className={props.settings.fontFamily === 'sans' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ fontFamily: 'sans' })}>
              黑体
            </button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className={props.settings.theme === 'paper' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ theme: 'paper' })}>
              纸
            </button>
            <button className={props.settings.theme === 'sepia' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ theme: 'sepia' })}>
              护眼
            </button>
            <button className={props.settings.theme === 'night' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ theme: 'night' })}>
              夜
            </button>
            <button className={props.settings.theme === 'system' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ theme: 'system' })}>
              系统
            </button>
          </div>
          <label className="field">
            行距 {props.settings.lineHeight.toFixed(1)}
            <input
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={props.settings.lineHeight}
              onChange={(e) => props.onSettings({ lineHeight: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            页边距 {props.settings.pageMargin}
            <input
              type="range"
              min={8}
              max={36}
              step={2}
              value={props.settings.pageMargin}
              onChange={(e) => props.onSettings({ pageMargin: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            <button className={props.settings.readMode === 'scroll' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ readMode: 'scroll' })}>
              滚动
            </button>
            <button className={props.settings.readMode === 'page' ? 'btn' : 'btn btn-ghost'} type="button" onClick={() => props.onSettings({ readMode: 'page' })}>
              翻页
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  )

  async function addNote(kind: Annotation['kind'], text: string, note?: string) {
    await books.addAnnotation(props.book.id, chapter.id, kind, text, note)
    setNotes(await books.listNotes(props.book.id))
    setSel(null)
    setNoteDraft('')
  }
}

function textSelecting(doc: Document): boolean {
  const text = doc.getSelection()?.toString().trim()
  return Boolean(text)
}
