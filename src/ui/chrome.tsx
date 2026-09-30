import type { ReactNode } from 'react'

const ICONS = {
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  chevron: 'M9 6l6 6-6 6',
} as const

export function Icon(props: { name: keyof typeof ICONS; size?: number }) {
  const size = props.size ?? 20
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={ICONS[props.name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={props.value === id}
          className={props.value === id ? 'is-on' : ''}
          onClick={() => props.onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function Dialog(props: {
  title: string
  body: ReactNode
  cancel: string
  confirm: string
  extra?: string
  onExtra?: () => void
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="dialog-backdrop" onClick={props.onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>{props.title}</h3>
        {typeof props.body === 'string' ? <p className="muted">{props.body}</p> : <div className="muted">{props.body}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" type="button" onClick={props.onCancel}>
            {props.cancel}
          </button>
          {props.extra && props.onExtra ? (
            <button className="btn btn-line" type="button" onClick={props.onExtra}>
              {props.extra}
            </button>
          ) : null}
          <button
            className={props.danger ? 'btn btn-warn' : 'btn'}
            type="button"
            onClick={props.onConfirm}
          >
            {props.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TopBar(props: { onBack?: () => void; title?: string; slogan?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {props.onBack ? (
        <button className="icon-btn" type="button" onClick={props.onBack} aria-label="返回">
          <Icon name="back" size={22} />
        </button>
      ) : (
        <span className="brand-lockup">
          <span className="brand">素笺</span>
          {props.slogan ? <span className="brand-slogan">{props.slogan}</span> : null}
        </span>
      )}
      {props.title ? <strong className="topbar-title">{props.title}</strong> : null}
      {props.right}
    </header>
  )
}
