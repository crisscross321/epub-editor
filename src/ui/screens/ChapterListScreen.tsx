import { displayChapterName } from '../../epub/headings'
import type { BookRecord } from '../../types/book'

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChapterListScreen(props: {
  book: BookRecord
  coverUrl: string | null
  onMeta: (patch: { title?: string; author?: string }) => void
  onCover: () => void
  onOpenChapter: (id: string) => void
  onRenameChapter: (id: string, title: string) => void
  onInsert: (afterId: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onPreview: () => void
  onExport: () => void
}) {
  const chapters = [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  return (
    <div className="screen">
      <div className="book-head">
        <div className="book-head-main">
          <div className="field">
            <label>书名</label>
            <input
              value={props.book.title}
              onChange={(e) => props.onMeta({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>作者</label>
            <input
              value={props.book.author}
              onChange={(e) => props.onMeta({ author: e.target.value })}
            />
          </div>
          <div className="row">
            <button className="btn btn-ghost" type="button" onClick={props.onPreview}>
              阅读预览
            </button>
            <button className="btn" type="button" onClick={props.onExport}>
              导出 EPUB
            </button>
          </div>
        </div>
        <div className="book-head-cover">
          <button className="btn btn-ghost" type="button" onClick={props.onCover}>
            设置封面
          </button>
          {props.coverUrl ? (
            <img className="cover cover-lg" src={props.coverUrl} alt="封面" />
          ) : (
            <div className="cover cover-lg cover-empty">暂无封面</div>
          )}
        </div>
      </div>

      {chapters.map((ch, index) => (
        <article key={ch.id} className="chapter-card">
          <div className="chapter-title-row">
            <span className="chapter-index">第 {index + 1} 章</span>
            <input
              value={displayChapterName(ch.title)}
              aria-label="章节名"
              placeholder="章节名"
              onChange={(e) => props.onRenameChapter(ch.id, e.target.value)}
            />
          </div>
          <div className="chapter-actions">
            <button className="btn btn-ghost" type="button" onClick={() => props.onOpenChapter(ch.id)}>
              编辑
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="上移"
              onClick={() => props.onMove(ch.id, -1)}
            >
              ↑
            </button>
            <button
              className="icon-btn"
              type="button"
              aria-label="下移"
              onClick={() => props.onMove(ch.id, 1)}
            >
              ↓
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => props.onInsert(ch.id)}>
              新增
            </button>
            <button
              className="icon-btn icon-danger"
              type="button"
              aria-label="删除"
              onClick={() => props.onDelete(ch.id)}
            >
              <TrashIcon />
            </button>
          </div>
          {ch.state === 'pristine' ? (
            <div className="muted">尚未编辑 · 打开正文后将简化排版</div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
