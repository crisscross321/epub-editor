import { formatBytes } from '../../storage/persist'
import type { AppSettings } from '../../storage/settings'
import { Segmented } from '../chrome'

export function SettingsScreen(props: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  persistStatus?: 'granted' | 'denied' | 'unsupported' | 'unknown'
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
        <h2 className="section-title">阅读</h2>
        <div className="settings-item">
          <div className="settings-label">颜色模式</div>
          <Segmented
            label="颜色模式"
            value={props.settings.theme}
            options={[
              ['paper', '纸'],
              ['sepia', '护眼'],
              ['night', '夜'],
              ['system', '跟随系统'],
            ]}
            onChange={(theme) => props.onChange({ theme })}
          />
        </div>
        <div className="settings-item">
          <div className="settings-label">字号</div>
          <Segmented
            label="字号"
            value={props.settings.fontSize}
            options={[
              ['s', '小字'],
              ['m', '中字'],
              ['l', '大字'],
            ]}
            onChange={(fontSize) => props.onChange({ fontSize })}
          />
        </div>
        <div className="settings-item">
          <div className="settings-label">字体</div>
          <Segmented
            label="字体"
            value={props.settings.fontFamily}
            options={[
              ['serif', '宋体'],
              ['sans', '黑体'],
            ]}
            onChange={(fontFamily) => props.onChange({ fontFamily })}
          />
        </div>
        <div className="settings-item">
          <div className="settings-label">翻页方式</div>
          <Segmented
            label="翻页方式"
            value={props.settings.readMode}
            options={[
              ['scroll', '滚动'],
              ['page', '翻页'],
            ]}
            onChange={(readMode) => props.onChange({ readMode })}
          />
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">备份</h2>
        <p className="muted">书只存在这台手机的应用里。卸载或清除数据会丢掉书架，导出到系统目录才是备份。</p>
        <label className="field-row">
          <span>超过几天未导出就提醒</span>
          <span className="field-row-input">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={props.settings.backupDays}
              onChange={(e) => props.onChange({ backupDays: Number(e.target.value) || 3 })}
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
        <p className="muted">
          {props.persistStatus === 'granted'
            ? '系统已允许持久保存本机数据。'
            : props.persistStatus === 'denied'
              ? '系统未允许持久保存。请尽快导出，以免被清理。'
              : '正在向系统申请持久保存。'}
        </p>
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
