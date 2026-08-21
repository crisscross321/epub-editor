import { coverHue } from '../../app/progress'
import { bookProgress } from '../../app/sortBooks'
import type { ShelfSort, ShelfView } from '../../storage/settings'
import type { BookRecord } from '../../types/book'

function Cover(props: { book: BookRecord; url?: string | null }) {
  if (props.url) return <img className="cover" src={props.url} alt="" />
  const hue = coverHue(props.book.title)
  return (
    <div className="cover cover-gen" style={{ background: `hsl(${hue} 22% 38%)` }}>
      {(props.book.title || '素').slice(0, 1)}
    </div>
  )
}

export function BookshelfScreen(props: {
  books: BookRecord[]
  covers: Record<string, string>
  view: ShelfView
  sort: ShelfSort
  query: string
  continueBook?: BookRecord
  backupCount: number
  undoLabel?: string
  onQuery: (q: string) => void
  onSort: (sort: ShelfSort) => void
  onView: (view: ShelfView) => void
  onOpen: (id: string) => void
  onContinue: () => void
  onCreate: () => void
  onImport: () => void
  onImportText: () => void
  onDelete: (id: string) => void
  onStar: (id: string) => void
  onUndo?: () => void
  onSettings: () => void
}) {
  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="muted" style={{ margin: 0 }}>
          写在纸上的书，装进 EPUB 里带走。
        </p>
        <button className="btn btn-ghost btn-compact" type="button" onClick={props.onSettings}>
          设置
        </button>
      </div>

      {props.backupCount > 0 ? (
        <div className="banner">
          {props.backupCount} 本书改过还没导出。卸载应用会丢掉书架，导出才是备份。
        </div>
      ) : null}

      {props.undoLabel && props.onUndo ? (
        <div className="banner banner-ok">
          已删除「{props.undoLabel}」
          <button type="button" onClick={props.onUndo}>
            撤销
          </button>
        </div>
      ) : null}

      {props.continueBook ? (
        <button className="continue-card" type="button" onClick={props.onContinue}>
          <Cover book={props.continueBook} url={props.covers[props.continueBook.id]} />
          <div>
            <div className="muted">继续阅读</div>
            <h2>{props.continueBook.title || '未命名'}</h2>
            <div className="progress-track">
              <span style={{ width: `${bookProgress(props.continueBook)}%` }} />
            </div>
            <div className="muted">{bookProgress(props.continueBook)}%</div>
          </div>
        </button>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" type="button" onClick={props.onCreate}>
          新建书籍
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onImport}>
          打开 EPUB
        </button>
        <button className="btn btn-ghost" type="button" onClick={props.onImportText}>
          导入文稿
        </button>
      </div>

      <input
        className="search-input"
        value={props.query}
        placeholder="搜索书名或作者"
        onChange={(e) => props.onQuery(e.target.value)}
      />

      <div className="row" style={{ margin: '10px 0 16px' }}>
        {(
          [
            ['updated', '最近'],
            ['title', '书名'],
            ['author', '作者'],
            ['progress', '进度'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={props.sort === id ? 'btn btn-compact' : 'btn btn-ghost btn-compact'}
            type="button"
            onClick={() => props.onSort(id)}
          >
            {label}
          </button>
        ))}
        <button className="btn btn-ghost btn-compact" type="button" onClick={() => props.onView(props.view === 'grid' ? 'list' : 'grid')}>
          {props.view === 'grid' ? '列表' : '封面'}
        </button>
      </div>

      {props.books.length === 0 ? (
        <div className="empty">书架还是空的。先写一本，打开 EPUB，或把 txt / markdown 文稿导入进来。</div>
      ) : props.view === 'grid' ? (
        <div className="shelf-grid">
          {props.books.map((book) => (
            <button key={book.id} className="shelf-tile" type="button" onClick={() => props.onOpen(book.id)}>
              <Cover book={book} url={props.covers[book.id]} />
              <strong>{book.title || '未命名'}</strong>
              <span className="muted">{book.author || '未署名'}</span>
              {book.starred ? <span className="star">收藏</span> : null}
            </button>
          ))}
        </div>
      ) : (
        props.books.map((book) => (
          <article key={book.id} className="book-card">
            <button type="button" onClick={() => props.onOpen(book.id)} className="book-card-main">
              <Cover book={book} url={props.covers[book.id]} />
              <div>
                <h2>{book.title || '未命名'}</h2>
                <div className="muted">
                  {book.author || '未署名'} · {new Date(book.updatedAt).toLocaleString('zh-CN')}
                  {book.lastExportedAt ? ' · 已导出' : ' · 尚未导出'}
                </div>
                <div className="progress-track">
                  <span style={{ width: `${bookProgress(book)}%` }} />
                </div>
              </div>
            </button>
            <div className="book-card-actions">
              <button className="btn btn-ghost btn-compact" type="button" onClick={() => props.onStar(book.id)}>
                {book.starred ? '取消收藏' : '收藏'}
              </button>
              <button className="btn btn-ghost btn-compact" type="button" onClick={() => props.onDelete(book.id)}>
                删除存档
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
