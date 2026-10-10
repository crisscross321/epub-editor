import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canShareSavedEpub,
  displayPathFromUri,
  isUserCancel,
  pickSaveDirectory,
  saveBackupToDocuments,
  saveEpubToUser,
  savedEpubMessage,
  shareSavedEpub,
} from './files'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('displayPathFromUri', () => {
  it('turns a storage-access address into a readable folder path', () => {
    expect(
      displayPathFromUri(
        'content://com.android.externalstorage.documents/document/primary%3ADownload%2F%E7%B4%A0%E7%AC%BA%2F%E6%B5%B7%E8%BE%B9.epub',
      ),
    ).toBe('下载/素笺/海边.epub')
    expect(
      displayPathFromUri('content://com.android.externalstorage.documents/document/primary:Documents/素笺/海边.epub'),
    ).toBe('文档/素笺/海边.epub')
    expect(
      displayPathFromUri('content://com.android.externalstorage.documents/tree/primary%3ADownload'),
    ).toBe('下载')
  })
})

describe('savedEpubMessage', () => {
  it('states the save and the path', () => {
    expect(
      savedEpubMessage({
        name: '海边.epub',
        mime: 'application/epub+zip',
        displayPath: '下载/素笺/海边.epub',
        location: 'picked',
      }),
    ).toBe('已保存 · 下载/素笺/海边.epub')
  })
})

describe('isUserCancel', () => {
  it('treats a dismissed save picker as a cancel', () => {
    expect(isUserCancel(new DOMException('The user aborted a request.', 'AbortError'))).toBe(true)
    expect(isUserCancel(Object.assign(new Error('已取消'), { code: 'cancelled' }))).toBe(true)
    expect(isUserCancel(new Error('无法写入这个位置'))).toBe(false)
  })
})

describe('pickSaveDirectory', () => {
  it('returns null when the folder picker is dismissed', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError')))
    await expect(pickSaveDirectory()).resolves.toBeNull()
  })
})

describe('saveBackupToDocuments', () => {
  it('downloads the shelf backup on the web without a second copy', async () => {
    await expect(saveBackupToDocuments('素笺书架-2026-10-11', new Uint8Array([1]))).resolves.toBe(
      '下载/素笺书架-2026-10-11.zip',
    )
  })
})

describe('saveEpubToUser', () => {
  it('returns null when the save picker is dismissed', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError')),
    )
    await expect(saveEpubToUser('海边', new Uint8Array([1, 2, 3]))).resolves.toBeNull()
  })

  it('writes through the save picker and does not share yet', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const write = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn()
    vi.stubGlobal('navigator', { share, canShare: () => true })
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close }) }),
    )
    const saved = await saveEpubToUser('海边', new Uint8Array([1, 2, 3]))
    expect(saved).toMatchObject({ name: '海边.epub', location: 'picked' })
    expect(write).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(share).not.toHaveBeenCalled()
    expect(canShareSavedEpub(saved!)).toBe(true)
  })
})

describe('android save plugin', () => {
  it('calls save instead of treating the plugin object as a promise', async () => {
    vi.resetModules()
    const save = vi.fn().mockResolvedValue({ uri: 'content://book', displayPath: '下载/海边.epub' })
    const plugin = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'save') return save
          return () => Promise.reject(new Error(`SaveDocument.${String(prop)}() is not implemented on android`))
        },
      },
    )
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { getPlatform: () => 'android' },
      registerPlugin: () => plugin,
    }))
    try {
      const { saveEpubToUser: saveOnAndroid } = await import('./files')
      await expect(saveOnAndroid('海边', new Uint8Array([1, 2, 3]))).resolves.toMatchObject({
        uri: 'content://book',
        displayPath: '下载/海边.epub',
        location: 'picked',
      })
      expect(save).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('@capacitor/core')
      vi.resetModules()
    }
  })
})

describe('shareSavedEpub', () => {
  it('shares only when asked, and ignores a dismissed share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError'))
    vi.stubGlobal('navigator', { share, canShare: () => true })
    const saved = {
      name: '海边.epub',
      mime: 'application/epub+zip',
      bytes: new Uint8Array([1]),
      location: 'picked' as const,
    }
    await expect(shareSavedEpub(saved)).resolves.toBeUndefined()
    expect(share).toHaveBeenCalledOnce()
  })
})
