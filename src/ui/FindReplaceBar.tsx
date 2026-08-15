import { useState } from 'react'

export function FindReplaceBar(props: {
  onFind: (search: string) => boolean
  onFindNext: (search: string) => boolean
  onReplace: (search: string, replacement: string) => void
  onReplaceAll: (search: string, replacement: string) => number
}) {
  const [search, setSearch] = useState('')
  const [replacement, setReplacement] = useState('')
  const [hint, setHint] = useState('')

  return (
    <div className="findbar">
      <input
        value={search}
        placeholder="查找"
        onChange={(e) => setSearch(e.target.value)}
      />
      <input
        value={replacement}
        placeholder="替换为"
        onChange={(e) => setReplacement(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setHint(props.onFind(search) ? '已定位' : '没有找到')}
      >
        查找
      </button>
      <button
        type="button"
        onClick={() => setHint(props.onFindNext(search) ? '已定位' : '没有找到')}
      >
        下一个
      </button>
      <button type="button" onClick={() => props.onReplace(search, replacement)}>
        替换
      </button>
      <button
        type="button"
        onClick={() => {
          if (!search) {
            setHint('请输入要查找的内容')
            return
          }
          const n = props.onReplaceAll(search, replacement)
          setHint(n ? `已替换 ${n} 处` : '没有找到')
        }}
      >
        全部替换
      </button>
      {hint ? <span className="muted">{hint}</span> : null}
    </div>
  )
}
