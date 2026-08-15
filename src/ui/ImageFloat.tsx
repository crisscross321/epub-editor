import type { CSSProperties } from 'react'
import { bumpWidth, type ImageAlign } from '../images/layout'

export function imageFloatStyle(rect: DOMRect): CSSProperties {
  const top = rect.top > 130 ? rect.top - 56 : rect.bottom + 8
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300))
  return { position: 'fixed', top, left }
}

export function ImageFloat(props: {
  width: number
  align: ImageAlign
  onWidth: (width: number) => void
  onAlign: (align: ImageAlign) => void
  style?: CSSProperties
}) {
  return (
    <div
      className="image-float"
      role="toolbar"
      aria-label="图片排版"
      style={props.style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" onClick={() => props.onWidth(bumpWidth(props.width, 1))}>
        放大
      </button>
      <button type="button" onClick={() => props.onWidth(bumpWidth(props.width, -1))}>
        缩小
      </button>
      <button
        type="button"
        className={props.align === 'left' ? 'is-on' : ''}
        onClick={() => props.onAlign('left')}
      >
        居左
      </button>
      <button
        type="button"
        className={props.align === 'center' ? 'is-on' : ''}
        onClick={() => props.onAlign('center')}
      >
        居中
      </button>
      <button
        type="button"
        className={props.align === 'right' ? 'is-on' : ''}
        onClick={() => props.onAlign('right')}
      >
        居右
      </button>
    </div>
  )
}
