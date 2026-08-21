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
        <input value={props.book.title} onChange={(e) => props.onChange({ title: e.target.value })} />
      </div>
      <div className="field">
        <label>作者</label>
        <input value={props.book.author} onChange={(e) => props.onChange({ author: e.target.value })} />
      </div>
      <div className="field">
        <label>语言</label>
        <input value={props.book.language} onChange={(e) => props.onChange({ language: e.target.value })} />
      </div>
      <div className="field">
        <label>简介</label>
        <textarea
          rows={4}
          value={props.book.description ?? ''}
          onChange={(e) => props.onChange({ description: e.target.value })}
        />
      </div>
      <div className="field">
        <label>出版社</label>
        <input value={props.book.publisher ?? ''} onChange={(e) => props.onChange({ publisher: e.target.value })} />
      </div>
      <div className="field">
        <label>系列</label>
        <input value={props.book.series ?? ''} onChange={(e) => props.onChange({ series: e.target.value })} />
      </div>
      <div className="field">
        <label>标签（用顿号或逗号分开）</label>
        <input
          value={(props.book.tags ?? []).join('、')}
          onChange={(e) =>
            props.onChange({
              tags: e.target.value
                .split(/[、,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      {props.book.sourceName ? (
        <p className="muted">
          来源 {props.book.sourceName}
          {props.book.addedAt ? ` · 导入于 ${new Date(props.book.addedAt).toLocaleString('zh-CN')}` : ''}
        </p>
      ) : null}
      <div className="field">
        <label>封面</label>
        {props.coverUrl ? <img className="cover cover-lg" src={props.coverUrl} alt="封面" /> : <div className="cover cover-lg cover-empty" />}
        <button className="btn btn-ghost" type="button" onClick={props.onCover}>
          从相册或文件选择封面
        </button>
      </div>
    </div>
  )
}
