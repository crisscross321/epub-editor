import type { ReactNode } from 'react'

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
        <div className="row">
          <button className="btn btn-ghost" type="button" onClick={props.onCancel}>
            {props.cancel}
          </button>
          {props.extra && props.onExtra ? (
            <button className="btn btn-ghost" type="button" onClick={props.onExtra}>
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
          ←
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
