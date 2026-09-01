export type EpubErrorCode =
  | 'not-zip'
  | 'no-opf'
  | 'empty-spine'
  | 'encrypted'
  | 'corrupt'

const MESSAGES: Record<EpubErrorCode, string> = {
  'not-zip': '不是有效的 EPUB 文件',
  'no-opf': '找不到书籍目录（OPF）',
  'empty-spine': '这本书没有可编辑的章节',
  encrypted: '不支持加密的 EPUB',
  corrupt: '文件已损坏',
}

export class EpubError extends Error {
  readonly code: EpubErrorCode

  constructor(code: EpubErrorCode, message?: string) {
    super(message ?? MESSAGES[code])
    this.code = code
    this.name = 'EpubError'
  }
}

import { isQuotaExceeded } from '../storage/persist'

export function messageForUnknown(error: unknown): string {
  if (error instanceof EpubError) return error.message
  if (isQuotaExceeded(error)) return '存储空间不足。请先导出或删除不用的书，再试一次。'
  if (error instanceof Error && error.message) return error.message
  return '出了点问题，请重试'
}
