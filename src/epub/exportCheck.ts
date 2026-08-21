export interface ExportIssue {
  id: string
  message: string
  chapterId?: string
}

export function checkExport(input: {
  title: string
  language: string
  hasCover: boolean
  chapters: { id: string; title: string; empty: boolean }[]
  imageBytes: number[]
}): ExportIssue[] {
  const issues: ExportIssue[] = []
  if (!input.title.trim() || input.title.trim() === '未命名') {
    issues.push({ id: 'title', message: '还没有写书名' })
  }
  if (!input.language.trim()) {
    issues.push({ id: 'language', message: '还没有填写语言' })
  }
  if (!input.hasCover) {
    issues.push({ id: 'cover', message: '还没有设置封面' })
  }
  if (input.chapters.length === 0) {
    issues.push({ id: 'empty-book', message: '一章都没有，导出后阅读器可能打不开' })
  }
  for (const chapter of input.chapters) {
    if (chapter.empty) {
      issues.push({
        id: `empty-${chapter.id}`,
        chapterId: chapter.id,
        message: `「${chapter.title || '未命名章节'}」是空的`,
      })
    }
  }
  const large = input.imageBytes.filter((n) => n > 2_000_000).length
  if (large) {
    issues.push({ id: 'images', message: `${large} 张插图超过 2MB，部分阅读器会打不开` })
  }
  return issues
}
