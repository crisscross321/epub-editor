import { useState } from 'react'

const SLIDES = [
  {
    title: '书在这台手机里',
    body: '素笺没有账号，也没有云。你写的、打开的书，都只存在这台手机的应用里。',
  },
  {
    title: '导出才是备份',
    body: '卸载应用或清除数据，书架会空掉。想留下一本书，请导出到「下载」或发给自己。',
  },
  {
    title: '先读，再决定改',
    body: '打开别人的书时，没点过编辑的章节会原样保留。点了编辑的那一章，表格、链接和自定义样式会变成普通正文。',
  },
]

export function Onboarding(props: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const slide = SLIDES[i]!
  return (
    <div className="onboard">
      <div className="onboard-card">
        <p className="muted">
          {i + 1} / {SLIDES.length}
        </p>
        <h2>{slide.title}</h2>
        <p>{slide.body}</p>
        <button
          className="btn"
          type="button"
          onClick={() => {
            if (i >= SLIDES.length - 1) props.onDone()
            else setI(i + 1)
          }}
        >
          {i >= SLIDES.length - 1 ? '开始使用' : '下一屏'}
        </button>
      </div>
    </div>
  )
}
