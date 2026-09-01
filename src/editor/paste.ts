import { docToXhtml } from '../epub/serialize'
import { simplifyXhtml } from '../epub/simplify'
import { escapeXml, parseHtml } from '../epub/xml'

export function htmlFromPaste(html: string | undefined, plain: string | undefined): string {
  if (html && /<[a-z]/i.test(html)) {
    const doc = simplifyXhtml(`<div>${html}</div>`, () => '')
    const parsed = parseHtml(docToXhtml(doc, '粘贴'))
    return parsed.body?.innerHTML?.trim() || '<p></p>'
  }
  const text = (plain ?? '').replace(/\r\n/g, '\n')
  if (!text) return ''
  return text
    .split('\n')
    .map((line) => `<p>${line.trim() ? escapeXml(line) : '<br>'}</p>`)
    .join('')
}
