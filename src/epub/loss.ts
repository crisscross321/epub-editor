import { parseHtml } from './xml'

export interface SimplifyLoss {
  tables: number
  links: number
  svg: number
  media: number
  styles: number
}

export function emptyLoss(): SimplifyLoss {
  return { tables: 0, links: 0, svg: 0, media: 0, styles: 0 }
}

export function analyzeSimplifyLoss(xhtml: string): SimplifyLoss {
  const doc = parseHtml(xhtml)
  const root = doc.body ?? doc.documentElement
  return {
    tables: root.querySelectorAll('table').length,
    links: root.querySelectorAll('a[href]').length,
    svg: root.querySelectorAll('svg').length,
    media: root.querySelectorAll('audio,video,object,embed').length,
    styles: root.querySelectorAll('style,[style]').length,
  }
}

export function lossSummary(loss: SimplifyLoss): string[] {
  const lines: string[] = []
  if (loss.tables) lines.push(`${loss.tables} 个表格会变成普通段落`)
  if (loss.links) lines.push(`${loss.links} 个链接会只留下文字`)
  if (loss.svg) lines.push(`${loss.svg} 个矢量图会被去掉`)
  if (loss.media) lines.push(`${loss.media} 段音视频会被去掉`)
  if (loss.styles) lines.push(`${loss.styles} 处自定义样式无法保留`)
  return lines
}

export function hasLoss(loss: SimplifyLoss): boolean {
  return lossSummary(loss).length > 0
}
