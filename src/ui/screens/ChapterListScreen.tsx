import type { BookRecord } from '../../types/book'

export function ChapterListScreen(props: {
  book: BookRecord
  onOpenChapter: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onInfo: () => void
  onPreview: () => void
  onExport: () => void
}) {
  const chapters = [...props.book.chapters].sort((a, b) => a.spineIndex - b.spineIndex)
  return (
    <div className="screen">
      <p className="muted" style={{ marginTop: 0 }}>
        {props.book.author || '未署名'} · {chapters.length} 章
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn" type="button" onClick={props.onAdd}>
          新增章节
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onInfo}>
          书籍信息
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onPreview}>
          阅读预览
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onExport}>
          导出 EPUB
        </button>
      </div>
      {chapters.map((ch) => (
        <article key={ch.id} className="chapter-card">
          <button type="button" onClick={() => props.onOpenChapter(ch.id)} style={{ width: '100%', textAlign: 'left' }}>
            <h2>{ch.title}</h2>
            <div className="muted">{ch.state === 'pristine' ? '尚未编辑 · 打开后将简化排版' : '可继续编辑'}</div>
          </button>
          <div className="chapter-actions">
            <button className="btn btn-ghost" type="button" onClick={() => props.onMove(ch.id, -1)}>
              上移
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => props.onMove(ch.id, 1)}>
              下移
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => props.onDelete(ch.id)}>
              删除
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
