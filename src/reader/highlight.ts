import { parseHtml } from '../epub/xml'

export function highlightQuery(html: string, query: string, className = 'hit'): string {
  if (!query) return html
  const doc = parseHtml(`<div id="root">${html}</div>`)
  const root = doc.getElementById('root')
  if (!root) return html
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text.includes(query) || !node.parentNode) return
      const frag = doc.createDocumentFragment()
      let rest = text
      while (rest.includes(query)) {
        const i = rest.indexOf(query)
        if (i > 0) frag.appendChild(doc.createTextNode(rest.slice(0, i)))
        const mark = doc.createElement('mark')
        mark.className = className
        mark.textContent = query
        frag.appendChild(mark)
        rest = rest.slice(i + query.length)
      }
      if (rest) frag.appendChild(doc.createTextNode(rest))
      node.parentNode.replaceChild(frag, node)
      return
    }
    Array.from(node.childNodes).forEach(walk)
  }
  walk(root)
  return root.innerHTML
}
