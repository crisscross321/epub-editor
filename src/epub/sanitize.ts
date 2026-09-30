import { applyImageLayout, readImageLayout } from '../images/layout'
import { parseHtml } from './xml'

export function sanitizeHtml(html: string): string {
  const doc = parseHtml(html)
  // Book content is rendered inside the application DOM in scroll mode.
  // Remove active content, forms and styles that can escape the reading surface.
  doc.querySelectorAll('script,iframe,object,embed,link,meta,style,base,form,input,button,textarea,select,svg,math').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase()
      if (name.startsWith('on') || ['srcdoc', 'contenteditable', 'autofocus', 'tabindex', 'style'].includes(name)) {
        el.removeAttribute(attr.name)
      } else if (['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset'].includes(name)) {
        const safeImage = el.tagName === 'IMG' && name === 'src' && /^(blob:|data:image\/(png|jpe?g|gif|webp|avif);)/i.test(value)
        const safeLink = el.tagName === 'A' && name === 'href' && /^(https?:|mailto:|#)/i.test(value)
        if (!safeImage && !safeLink) el.removeAttribute(attr.name)
      }
    }
    if (el.tagName === 'IMG' && el.hasAttribute('data-width')) {
      const image = el as HTMLImageElement
      const layout = readImageLayout(image)
      applyImageLayout(image, layout.width, layout.align)
    }
    if (el.tagName === 'A' && /^(https?:|mailto:)/i.test(el.getAttribute('href') ?? '')) {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return doc.body?.innerHTML ?? ''
}
