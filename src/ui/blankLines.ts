import { parseHtml } from '../epub/xml'

export function isBlankBlock(el: Element): boolean {
  if (el.classList.contains('ProseMirror')) return false
  if (el.querySelector('img, ul, ol, table, h1, h2, h3, h4, h5, h6')) return false
  const text = (el.textContent ?? '').replace(/[\u00a0\s]/g, '')
  if (text) return false
  return Array.from(el.children).every((child) => child.tagName === 'BR')
}

export function markBlankBlocks(root: ParentNode): void {
  root.querySelectorAll('p, div').forEach((el) => {
    el.classList.toggle('is-blank', isBlankBlock(el))
  })
  root.querySelectorAll('br').forEach((br) => {
    const prev = br.previousSibling
    const extra =
      (prev instanceof HTMLElement && prev.tagName === 'BR') ||
      (prev instanceof Text && /^\s*$/.test(prev.textContent ?? '') && prev.previousSibling instanceof HTMLElement && prev.previousSibling.tagName === 'BR')
    br.classList.toggle('is-extra-break', extra)
  })
}

export function tightenBlankHtml(html: string): string {
  const doc = parseHtml(html)
  const root = doc.body ?? doc.documentElement
  markBlankBlocks(root)
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`
}
