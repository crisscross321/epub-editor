import type { AppSettings } from '../../storage/settings'

export function SettingsScreen(props: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}) {
  return (
    <div className="screen">
      <section className="settings-block">
        <h2 className="section-title">阅读</h2>
        <div className="settings-item">
          <div className="settings-label">颜色模式</div>
          <div className="row">
            {(['paper', 'sepia', 'night', 'system'] as const).map((theme) => (
              <button
                key={theme}
                className={props.settings.theme === theme ? 'btn' : 'btn btn-ghost'}
                type="button"
                onClick={() => props.onChange({ theme })}
              >
                {{ paper: '纸', sepia: '护眼', night: '夜', system: '跟随系统' }[theme]}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-label">字号</div>
          <div className="row">
            {(['s', 'm', 'l'] as const).map((size) => (
              <button
                key={size}
                className={props.settings.fontSize === size ? 'btn' : 'btn btn-ghost'}
                type="button"
                onClick={() => props.onChange({ fontSize: size })}
              >
                {size === 's' ? '小字' : size === 'm' ? '中字' : '大字'}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-label">字体</div>
          <div className="row">
            <button
              className={props.settings.fontFamily === 'serif' ? 'btn' : 'btn btn-ghost'}
              type="button"
              onClick={() => props.onChange({ fontFamily: 'serif' })}
            >
              宋体
            </button>
            <button
              className={props.settings.fontFamily === 'sans' ? 'btn' : 'btn btn-ghost'}
              type="button"
              onClick={() => props.onChange({ fontFamily: 'sans' })}
            >
              黑体
            </button>
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-label">翻页方式</div>
          <div className="row">
            <button
              className={props.settings.readMode === 'scroll' ? 'btn' : 'btn btn-ghost'}
              type="button"
              onClick={() => props.onChange({ readMode: 'scroll' })}
            >
              滚动
            </button>
            <button
              className={props.settings.readMode === 'page' ? 'btn' : 'btn btn-ghost'}
              type="button"
              onClick={() => props.onChange({ readMode: 'page' })}
            >
              翻页
            </button>
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h2 className="section-title">备份</h2>
        <p className="muted">书只存在这台手机的应用里。卸载或清除数据会丢掉书架，导出到系统目录才是备份。</p>
        <label className="field">
          超过几天未导出就提醒
          <input
            type="number"
            min={1}
            max={30}
            value={props.settings.backupDays}
            onChange={(e) => props.onChange({ backupDays: Number(e.target.value) || 3 })}
          />
        </label>
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
