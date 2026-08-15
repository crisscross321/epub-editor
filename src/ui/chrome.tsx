import type { ReactNode } from 'react'

export function Dialog(props: {
  title: string
  body: string
  cancel: string
  confirm: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="dialog-backdrop" onClick={props.onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>{props.title}</h3>
        <p className="muted">{props.body}</p>
        <div className="row">
          <button className="btn btn-ghost" type="button" onClick={props.onCancel}>
            {props.cancel}
          </button>
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

export function TopBar(props: { onBack?: () => void; title?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {props.onBack ? (
        <button className="icon-btn" type="button" onClick={props.onBack} aria-label="返回">
          ←
        </button>
      ) : (
        <span className="brand">素笺</span>
      )}
      {props.title ? (
        <strong style={{ flex: 1, fontFamily: 'var(--serif)' }}>{props.title}</strong>
      ) : (
        <span style={{ flex: 1 }} />
      )}
      {props.right}
    </header>
  )
}
