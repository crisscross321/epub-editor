export type ImageAlign = 'left' | 'center' | 'right'

export function clampWidth(width: number): number {
  const n = Math.round(width)
  if (n < 20) return 20
  if (n > 100) return 100
  return n
}

export function bumpWidth(width: number, dir: 1 | -1): number {
  return clampWidth(width + dir * 10)
}

export function imageCss(width: number, align: ImageAlign): string {
  const w = clampWidth(width)
  const margins =
    align === 'left'
      ? 'margin:12px auto 12px 0;'
      : align === 'right'
        ? 'margin:12px 0 12px auto;'
        : 'margin:12px auto;'
  return `width:${w}%;max-width:100%;height:auto;display:block;${margins}`
}

export function applyImageLayout(img: HTMLImageElement, width: number, align: ImageAlign): void {
  img.setAttribute('data-width', String(clampWidth(width)))
  img.setAttribute('data-align', align)
  img.setAttribute('style', imageCss(width, align))
}

export function readImageLayout(img: HTMLImageElement): { width: number; align: ImageAlign } {
  const width = clampWidth(Number(img.getAttribute('data-width') || '100') || 100)
  const raw = img.getAttribute('data-align') || 'center'
  const align: ImageAlign = raw === 'left' || raw === 'right' ? raw : 'center'
  return { width, align }
}
