import type { BookRecord } from '../../types/book'

export function BookInfoScreen(props: {
  book: BookRecord
  coverUrl: string | null
  onChange: (patch: Partial<BookRecord>) => void
  onCover: () => void
}) {
  return (
    <div className="screen">
      <div className="field">
        <label>书名</label>
        <input
          value={props.book.title}
          onChange={(e) => props.onChange({ title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>作者</label>
        <input
          value={props.book.author}
          onChange={(e) => props.onChange({ author: e.target.value })}
        />
      </div>
      <div className="field">
        <label>语言</label>
        <input
          value={props.book.language}
          onChange={(e) => props.onChange({ language: e.target.value })}
        />
      </div>
      <div className="field">
        <label>封面</label>
        {props.coverUrl ? <img className="cover" src={props.coverUrl} alt="封面" /> : <div className="cover" />}
        <button className="btn btn-ghost" type="button" onClick={props.onCover}>
          从相册或文件选择封面
        </button>
      </div>
    </div>
  )
}
