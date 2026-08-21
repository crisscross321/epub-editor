import { fontSizePx, type AppSettings } from '../storage/settings'

export function readerBodyCss(settings: AppSettings, matchEditor: boolean): string {
  const font =
    settings.fontFamily === 'sans'
      ? "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Microsoft YaHei', sans-serif"
      : "'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif"
  const size = matchEditor ? fontSizePx(settings.fontSize) : fontSizePx(settings.fontSize)
  const pad = settings.pageMargin
  return `
    html, body {
      margin: 0;
      padding: 0 ${pad}px 48px;
      background: transparent;
      color: var(--ink, #1c1410);
      font-family: ${font};
      font-size: ${size}px;
      line-height: ${settings.lineHeight};
      word-break: break-word;
    }
    h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.4; margin: 1.2em 0 0.5em; }
    h1 { font-size: 1.55em; }
    h2 { font-size: 1.28em; }
    h3 { font-size: 1.12em; }
    p { margin: 0 0 0.8em; }
    img { max-width: 100%; height: auto; display: block; margin: 12px auto; }
    a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
    mark.hit { background: rgba(156, 43, 31, 0.22); color: inherit; }
    .hl { background: rgba(198, 146, 58, 0.35); }
  `
}
