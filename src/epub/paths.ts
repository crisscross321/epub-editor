export function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

export function dirname(path: string): string {
  const normalized = normalizeZipPath(path)
  const i = normalized.lastIndexOf('/')
  return i === -1 ? '' : normalized.slice(0, i)
}

export function joinPath(baseDir: string, rel: string): string {
  const raw = rel.trim()
  if (!raw || raw.startsWith('data:') || /^https?:/i.test(raw)) return raw
  const stripped = raw.split('#')[0]?.split('?')[0] ?? raw
  if (!stripped) return ''
  const start = stripped.startsWith('/')
    ? stripped.replace(/^\/+/, '')
    : `${baseDir ? `${baseDir}/` : ''}${stripped}`
  const parts = start.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export function extname(path: string): string {
  const base = path.split('/').pop() ?? ''
  const i = base.lastIndexOf('.')
  return i === -1 ? '' : base.slice(i + 1).toLowerCase()
}
