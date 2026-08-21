import { parseHtml } from './xml'

export function sanitizeHtml(html: string): string {
  const doc = parseHtml(html)
  doc.querySelectorAll('script,iframe,object,embed,link[rel="stylesheet"],meta').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc') el.removeAttribute(attr.name)
    }
  })
  return doc.body?.innerHTML ?? html
}
