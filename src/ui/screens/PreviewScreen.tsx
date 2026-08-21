import { useEffect, useMemo, useRef, useState } from 'react'
import * as books from '../../app/bookService'
import { readingPercent } from '../../app/progress'
import { countChars, readingMinutes, textFromHtml } from '../../content/text'
import { exportChapterHeading } from '../../epub/headings'
import { shouldRenderOuterTitle } from '../../epub/plain'
import { sanitizeHtml } from '../../epub/sanitize'
import { outlineFromXhtml } from '../../epub/toc'
import { highlightQuery } from '../../reader/highlight'
import { readerBodyCss } from '../../reader/style'
import { fontSizePx, type AppSettings } from '../../storage/settings'
import type { Annotation, BookRecord } from '../../types/book'
import { tightenBlankHtml } from '../blankLines'

function wrapChapter(html: string, heading: string, css: string, highlight: string): string {
  const tightened = tightenBlankHtml(html)
  const body = tightened.replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head[\s\S]*?<\/head>/gi, '').replace(/<\/?body[^>]*>/gi, '')
  const title = shouldRenderOuterTitle(tightened, heading) ? `<h1>${heading}</h1>` : ''
  const marked = highlightQuery(sanitizeHtml(`${title}${body}`), highlight)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${marked}</body></html>`
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
  const [html, setHtml] = useState('')
  const [warning, setWarning] = useState<string | undefined>()
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<'toc' | 'search' | 'notes' | 'type' | null>(null)
  const [query, setQuery] = useState(props.highlight ?? '')
  const [hits, setHits] = useState<{ chapterId: string; title: string; snippet: string }[]>([])
  const [notes, setNotes] = useState<Annotation[]>([])
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const chapter = chapters[index]
  const paged = props.settings.readMode === 'page'

  const css = readerBodyCss(props.settings, chapter?.state === 'simplified')

  useEffect(() => {
    setIndex(start < 0 ? 0 : start)
  }, [props.book.id, start])

  useEffect(() => {
    if (!chapter) return
    let cancelled = false
    books.getChapterPreview(props.book.id, chapter).then((result) => {
      if (cancelled) return
      const heading = exportChapterHeading(index, chapter.title)
      setHtml(wrapChapter(result.html, heading, css, query))
      setWarning(result.warning)
      setPage(0)
    })
    return () => {
      cancelled = true
    }
  }, [chapter, css, index, props.book.id, query])

  useEffect(() => {
    void books.listNotes(props.book.id).then(setNotes)
  }, [props.book.id, panel])

  useEffect(() => {
    const doc = frame.current?.contentDocument
    const body = doc?.documentElement
    if (!body || !chapter) return
    const restore = () => {
      if (!paged && chapter.id === props.book.readChapterId) {
        const top = (props.book.readOffset ?? 0) * (body.scrollHeight - body.clientHeight)
        body.scrollTop = top
      }
    }
    restore()
    const id = window.setTimeout(restore, 50)
    return () => window.clearTimeout(id)
  }, [html, chapter, paged, props.book.readChapterId, props.book.readOffset])

  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc?.documentElement || !paged) return
    const el = doc.documentElement
    const next = Math.max(1, Math.ceil(el.scrollHeight / Math.max(el.clientHeight, 1)))
    setPages(next)
  }, [html, paged, props.settings])

  const reportProgress = (offset: number) => {
    if (!chapter) return
    props.onProgress(chapter.id, offset)
  }

  const go = (next: number) => {
    if (next < 0 || next >= chapters.length) return
    setIndex(next)
    setSel(null)
    reportProgress(0)
  }

  const onFrameLoad = () => {
    const win = frame.current?.contentWindow
    const doc = frame.current?.contentDocument
    if (!win || !doc) return
    const loaded = Date.now()
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
    win.addEventListener('scroll', () => {
      const el = doc.documentElement
      const max = el.scrollHeight - el.clientHeight
      reportProgress(max <= 0 ? 1 : el.scrollTop / max)
      if (!paged && max > 80 && el.scrollTop >= max - 4 && Date.now() - loaded > 600) {
        if (index < chapters.length - 1) go(index + 1)
      }
    })
    win.addEventListener('click', (e) => {
      const x = e.clientX
      const w = win.innerWidth
      if (textSelecting(doc)) return
      if (paged) {
        if (x < w * 0.28) turn(-1)
        else if (x > w * 0.72) turn(1)
        else setChrome((v) => !v)
        return
      }
      if (x < w * 0.22) go(index - 1)
      else if (x > w * 0.78) go(index + 1)
      else setChrome((v) => !v)
    })
    let startX = 0
    win.addEventListener('touchstart', (e) => {
      startX = e.changedTouches[0]?.clientX ?? 0
    })
    win.addEventListener('touchend', (e) => {
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX
      if (Math.abs(dx) < 60) return
      if (paged) turn(dx < 0 ? 1 : -1)
      else go(dx < 0 ? index + 1 : index - 1)
    })
  }

  const turn = (dir: -1 | 1) => {
    const doc = frame.current?.contentDocument?.documentElement
    if (!paged || !doc) {
      go(index + dir)
      return
    }
    const next = page + dir
    if (next < 0) {
      go(index - 1)
      return
    }
    if (next >= pages) {
      go(index + 1)
      return
    }
    setPage(next)
    doc.scrollTop = next * doc.clientHeight
  }

  const remaining = chapter ? readingMinutes(Math.round(countChars(textFromHtml(html)) * (1 - (props.book.readOffset ?? 0)))) : 0
  const percent = readingPercent(index, chapters.length, props.book.readChapterId === chapter?.id ? props.book.readOffset ?? 0 : 0)

  if (!chapter) return <div className="empty">没有章节</div>

  return (
    <div className="reader" ref={scroller}>
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

      <div className={paged ? 'reader-page' : 'preview-frame-wrap'}>
        <iframe
          ref={frame}
          className="preview-frame"
          sandbox="allow-same-origin"
          srcDoc={html}
          title="阅读"
          onLoad={onFrameLoad}
        />
      </div>

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
        <div className="sel-pop" style={{ left: Math.max(12, sel.x), top: sel.y + 48 }}>
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
            const items = outlineFromXhtml(i === index ? html : '')
            return (
              <div key={ch.id}>
                <button
                  className={i === index ? 'drawer-item is-on' : 'drawer-item'}
                  type="button"
                  onClick={() => {
                    setIndex(i)
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
                if (next >= 0) setIndex(next)
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
                    if (next >= 0) setIndex(next)
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
