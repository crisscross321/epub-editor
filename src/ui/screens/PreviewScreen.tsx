import { useEffect, useState } from 'react'
import { getChapterPreview } from '../../app/bookService'
import { exportChapterHeading } from '../../epub/headings'
import type { BookRecord } from '../../types/book'
import { tightenBlankHtml } from '../blankLines'

const PREVIEW_STYLE = `<style>
  html, body {
    margin: 0;
    padding: 0 4px 24px;
    background: transparent;
    color: #1c1410;
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    font-size: 18px;
    line-height: 1.5;
  }
  h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.4; margin: 1.2em 0 0.5em; }
  h1 { font-size: 1.7em; }
  h2 { font-size: 1.4em; }
  h3 { font-size: 1.22em; }
  p { margin: 0 0 0.8em; }
  body > div { margin: 0 0 0.8em; }
  p.is-blank, div.is-blank {
    line-height: 0.8em;
    min-height: 0;
    height: 0.8em;
    margin: 0;
    overflow: hidden;
  }
  p.is-blank br, div.is-blank br { display: none; }
  br.is-extra-break {
    display: block;
    height: 0.8em;
    line-height: 0;
    font-size: 0;
    margin: 0;
  }
  img { max-width: 100%; height: auto; display: block; margin: 12px auto; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap" rel="stylesheet"/>`

const BLANK_STYLE = `<style>
  p.is-blank, div.is-blank {
    line-height: 0.8em;
    min-height: 0;
    height: 0.8em;
    margin: 0;
    overflow: hidden;
  }
  p.is-blank br, div.is-blank br { display: none; }
  br.is-extra-break {
    display: block;
    height: 0.8em;
    line-height: 0;
    font-size: 0;
    margin: 0;
  }
</style>`

function withPreviewChrome(html: string, matchEditor: boolean): string {
  const tightened = tightenBlankHtml(html)
  const extra = matchEditor ? PREVIEW_STYLE : BLANK_STYLE
  if (/<\/head>/i.test(tightened)) return tightened.replace(/<\/head>/i, `${extra}</head>`)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${extra}</head><body>${tightened}</body></html>`
}

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
      setHtml(withPreviewChrome(result.html, chapter.state === 'simplified'))
      setWarning(result.warning)
    })
    return () => {
      cancelled = true
    }
  }, [chapter, props.book.id])

  if (!chapter) return <div className="empty">没有章节</div>

  return (
    <div className="preview-screen">
      <div className="preview-nav">
        <button
          className="btn btn-ghost btn-compact"
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          上一章
        </button>
        <button
          className="btn btn-ghost btn-compact"
          type="button"
          disabled={index >= chapters.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          下一章
        </button>
      </div>
      <h2 className="preview-title">{exportChapterHeading(index, chapter.title)}</h2>
      {warning ? <p className="muted preview-warning">{warning}</p> : null}
      <div className="preview-frame-wrap">
        <iframe className="preview-frame" sandbox="" srcDoc={html} title="预览" />
      </div>
    </div>
  )
}
