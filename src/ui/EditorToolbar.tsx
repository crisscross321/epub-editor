import { useEffect, useRef, useState, type ReactNode } from 'react'

export type HeadingLevel = 0 | 1 | 2 | 3
export type FormatKind = 'bold' | 'italic' | 'bulletList' | 'orderedList'

export function EditorToolbar(props: {
  headingOn: (level: HeadingLevel) => boolean
  formatOn: (kind: FormatKind) => boolean
  onHeading: (level: HeadingLevel) => void
  onFormat: (kind: FormatKind) => void
  onInsertImage: () => void
  onUndo: () => void
  onRedo: () => void
  showFind: boolean
  onToggleFind: () => void
  showOutline?: boolean
  onToggleOutline?: () => void
  onPreview?: () => void
  onSplit?: () => void
  wordCount?: number
  children?: ReactNode
}) {
  const [formatOpen, setFormatOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const formatActive =
    props.formatOn('bold') ||
    props.formatOn('italic') ||
    props.formatOn('bulletList') ||
    props.formatOn('orderedList')

  useEffect(() => {
    if (!formatOpen) return
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setFormatOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [formatOpen])

  useEffect(() => {
    if (props.showFind || props.showOutline) setFormatOpen(false)
  }, [props.showFind, props.showOutline])

  return (
    <div className="editor-chrome" ref={wrap}>
      {props.showOutline ? null : (
      <div className="toolbar" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault() }}>
        <button type="button" className={props.headingOn(1) ? 'is-on' : ''} onClick={() => props.onHeading(1)}>
          H1
        </button>
        <button type="button" className={props.headingOn(2) ? 'is-on' : ''} onClick={() => props.onHeading(2)}>
          H2
        </button>
        <button type="button" className={props.headingOn(3) ? 'is-on' : ''} onClick={() => props.onHeading(3)}>
          H3
        </button>
        <button type="button" className={props.headingOn(0) ? 'is-on' : ''} onClick={() => props.onHeading(0)}>
          正文
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={formatOpen || formatActive ? 'is-on' : ''}
          onClick={() => {
            if (!formatOpen && props.showFind) props.onToggleFind()
            setFormatOpen((v) => !v)
          }}
        >
          格式
        </button>
        <button
          type="button"
          className={props.showFind ? 'is-on' : ''}
          onClick={() => {
            setFormatOpen(false)
            props.onToggleFind()
          }}
        >
          查找
        </button>
        <button type="button" onClick={props.onInsertImage}>
          插图
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button type="button" onClick={props.onUndo}>
          撤销
        </button>
        <button type="button" onClick={props.onRedo}>
          重做
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        {props.onToggleOutline ? (
          <button type="button" className={props.showOutline ? 'is-on' : ''} onClick={props.onToggleOutline}>
            大纲
          </button>
        ) : null}
        {props.onSplit ? (
          <button type="button" onClick={props.onSplit}>
            拆章
          </button>
        ) : null}
        {props.onPreview ? (
          <button type="button" onClick={props.onPreview}>
            预览
          </button>
        ) : null}
        {typeof props.wordCount === 'number' ? <span className="wordcount">{props.wordCount} 字</span> : null}
      </div>
      )}
      {formatOpen && !props.showOutline ? (
        <div className="format-pop" role="menu" aria-label="特殊格式" onMouseDown={(e) => e.preventDefault()}>
          <button
            type="button"
            className={props.formatOn('bold') ? 'is-on' : ''}
            onClick={() => props.onFormat('bold')}
          >
            粗
          </button>
          <button
            type="button"
            className={props.formatOn('italic') ? 'is-on' : ''}
            onClick={() => props.onFormat('italic')}
          >
            斜
          </button>
          <button
            type="button"
            className={props.formatOn('bulletList') ? 'is-on' : ''}
            onClick={() => props.onFormat('bulletList')}
          >
            列表
          </button>
          <button
            type="button"
            className={props.formatOn('orderedList') ? 'is-on' : ''}
            onClick={() => props.onFormat('orderedList')}
          >
            编号
          </button>
        </div>
      ) : null}
      {props.children}
    </div>
  )
}
