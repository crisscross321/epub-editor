import { useState } from 'react'
import { formatBytes } from '../../storage/persist'
import { themeChoices, type AppSettings } from '../../storage/settings'
import { Segmented } from '../chrome'

function BackupDaysInput(props: { days: number; onChange: (days: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="numeric"
      enterKeyHint="done"
      autoComplete="off"
      aria-label="超过几天未导出就提醒"
      maxLength={2}
      value={draft ?? String(props.days)}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').slice(0, 2)
        setDraft(next)
        const n = Number(next)
        if (next !== '' && n >= 1 && n <= 30) props.onChange(n)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

export function SettingsScreen(props: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  trashCount?: number
  trashBytes?: number
  onEmptyTrash?: () => void
  onBackup?: () => void
  onRestore?: () => void
  onExportAll?: () => void
}) {
  return (
    <div className="screen">
      <section className="settings-block">
        <h2 className="section-title">外观</h2>
        <div className="settings-item">
          <div className="settings-label">颜色模式</div>
          <Segmented
            label="颜色模式"
            value={props.settings.theme}
            options={themeChoices}
            onChange={(theme) => props.onChange({ theme })}
          />
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">查找和替换</h2>
        <div className="field-row settings-switch">
          <span>
            启用通配符
            <span className="muted settings-sub">
              启用后，^p 表示换行，^^ 表示字符 ^，^^p 表示正文里的 ^p。
            </span>
          </span>
          <button
            className={props.settings.findWildcards ? 'btn btn-compact' : 'btn btn-line btn-compact'}
            type="button"
            role="switch"
            aria-checked={props.settings.findWildcards}
            aria-label="启用通配符"
            onClick={() => props.onChange({ findWildcards: !props.settings.findWildcards })}
          >
            {props.settings.findWildcards ? '已开启' : '已关闭'}
          </button>
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">备份</h2>
        <p className="muted">书只存在这台手机的应用里。卸载或清除数据会丢掉书架，导出到系统目录才是备份。</p>
        <label className="field-row">
          <span>超过几天未导出就提醒</span>
          <span className="field-row-input">
            <BackupDaysInput
              days={props.settings.backupDays}
              onChange={(backupDays) => props.onChange({ backupDays })}
            />
            天
          </span>
        </label>
        <div className="action-grid action-grid-2">
          {props.onBackup ? (
            <button className="btn" type="button" onClick={props.onBackup}>
              导出书架备份
            </button>
          ) : null}
          {props.onRestore ? (
            <button className="btn btn-line" type="button" onClick={props.onRestore}>
              恢复备份
            </button>
          ) : null}
          {props.onExportAll ? (
            <button className="btn btn-line action-grid-wide" type="button" onClick={props.onExportAll}>
              导出全部 EPUB
            </button>
          ) : null}
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">存储</h2>
        <div className="field-row">
          <span>
            回收站 {props.trashCount ?? 0} 本 · 约 {formatBytes(props.trashBytes ?? 0)}
            <span className="muted settings-sub">超过 7 天会自动清掉</span>
          </span>
          {props.onEmptyTrash ? (
            <button className="btn btn-line btn-compact" type="button" onClick={props.onEmptyTrash} disabled={!props.trashCount}>
              清空回收站
            </button>
          ) : null}
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">关于素笺</h2>
        <p>
          打开别人的书时，没点过「编辑」的章节会按原文件打回包。点了编辑的那一章会简化排版：表格、链接、自定义样式会变成普通正文。
        </p>
        <p className="muted">没有云同步，也没有账号。本地编辑，导出带走。</p>
      </section>
    </div>
  )
}
