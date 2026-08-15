import { useEffect, useState } from 'react'
import type { BookRecord } from '../../types/book'
import { getChapterPreview } from '../../app/bookService'

export function PreviewScreen(props: { book: BookRecord }) {
  const chapters = [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  const [index, setIndex] = useState(0)
  const [html, setHtml] = useState('')
  const [warning, setWarning] = useState<string | undefined>()

  const chapter = chapters[index]

  useEffect(() => {
    if (!chapter) return
    let cancelled = false
    getChapterPreview(props.book.id, chapter).then((result) => {
      if (cancelled) return
      setHtml(result.html)
      setWarning(result.warning)
    })
    return () => {
      cancelled = true
    }
  }, [chapter, props.book.id])

  if (!chapter) return <div className="empty">没有章节</div>

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost" type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          上一章
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={index >= chapters.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          下一章
        </button>
      </div>
      <h2 style={{ fontFamily: 'var(--serif)' }}>{chapter.title}</h2>
      {warning ? <p className="muted">{warning}</p> : null}
      <iframe className="preview-frame" sandbox="" srcDoc={html} title="预览" />
    </div>
  )
}
