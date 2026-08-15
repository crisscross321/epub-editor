export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('xml-parse')
  return doc
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

export function elementsByLocalName(root: ParentNode, localName: string): Element[] {
  const target = localName.toLowerCase()
  return Array.from(root.querySelectorAll('*')).filter((el) => {
    const local = (el.localName || el.tagName).toLowerCase()
    const prefixed = el.tagName.toLowerCase().split(':').pop()
    return local === target || prefixed === target
  })
}

export function firstByLocalName(root: ParentNode, localName: string): Element | undefined {
  return elementsByLocalName(root, localName)[0]
}

export function textOf(el: Element | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
