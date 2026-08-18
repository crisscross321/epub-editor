import type { BookRecord } from '../../types/book'

export function BookshelfScreen(props: {
  books: BookRecord[]
  onOpen: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <div className="screen">
        <p className="muted" style={{ marginTop: 0 }}>
          写在纸上的书，装进 EPUB 里带走。
        </p>
        <div className="row" style={{ marginBottom: 20 }}>
          <button className="btn" type="button" onClick={props.onCreate}>
            新建书籍
          </button>
          <button className="btn btn-ghost" type="button" onClick={props.onImport}>
            打开 EPUB
          </button>
        </div>
        {props.books.length === 0 ? (
          <div className="empty">书架还是空的。先写一本，或打开已有的书。</div>
        ) : (
          props.books.map((book) => (
            <article key={book.id} className="book-card">
              <button type="button" onClick={() => props.onOpen(book.id)} style={{ width: '100%', textAlign: 'left' }}>
                <h2>{book.title || '未命名'}</h2>
                <div className="muted">
                  {book.author || '未署名'} · {new Date(book.updatedAt).toLocaleString('zh-CN')}
                </div>
              </button>
              <div className="book-card-actions">
                <button className="btn btn-ghost btn-compact" type="button" onClick={() => props.onDelete(book.id)}>
                  删除存档
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </>
  )
}
