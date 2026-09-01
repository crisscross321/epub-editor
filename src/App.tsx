import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { BookRecord, ChapterDump, TiptapDoc } from './types/book'
import * as books from './app/bookService'
import { editorBackRoute, neighborChapterIds, previewBackTarget, type Route } from './app/nav'
import { needsBackupReminder } from './app/progress'
import { filterBooks, sortBooks } from './app/sortBooks'
import { toArrayBuffer } from './epub/bytes'
import { exportChapterHeading, wouldSplitByH1 } from './epub/headings'
import { lossSummary } from './epub/loss'
import { chaptersToMarkdown, chaptersToPlain } from './epub/plain'
import {
  pickBackupFile,
  pickEpubFile,
  pickImageFile,
  pickTextFile,
  readBytesFromAppUrl,
  saveBytesToUser,
  saveEpubToUser,
  writeBytesToLibrary,
} from './storage/files'
import { requestPersistentStorage } from './storage/persist'
import {
  applyTheme,
  loadSettings,
  resolveTheme,
  saveSettings,
  type AppSettings,
} from './storage/settings'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Dialog, TopBar } from './ui/chrome'
import { BookInfoScreen } from './ui/screens/BookInfoScreen'
import { BookshelfScreen } from './ui/screens/BookshelfScreen'
import { ChapterListScreen } from './ui/screens/ChapterListScreen'
import { EditorScreen } from './ui/screens/EditorScreen'
import { Onboarding } from './ui/screens/Onboarding'
import { PreviewScreen } from './ui/screens/PreviewScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { bindKeyboardReveal } from './ui/keepFocusVisible'
import { nextStarred } from './ui/selection'

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'shelf' })
  const [list, setList] = useState<BookRecord[]>([])
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [book, setBook] = useState<BookRecord | null>(null)
  const [doc, setDoc] = useState<TiptapDoc | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [undo, setUndo] = useState<
    | { kind: 'books'; ids: string[]; title: string }
    | { kind: 'chapter'; dump: ChapterDump; title: string }
    | null
  >(null)
  const [persistStatus, setPersistStatus] = useState<'granted' | 'denied' | 'unsupported' | 'unknown'>('unknown')
  const [trashMeta, setTrashMeta] = useState({ count: 0, bytes: 0 })
  const [confirm, setConfirm] = useState<null | {
    title: string
    body: ReactNode
    confirm: string
    extra?: string
    onExtra?: () => void
    danger?: boolean
    action: () => void
  }>(null)
  const [pendingImage, setPendingImage] = useState<{ src: string; imageId: string } | null>(null)
  const saveTimer = useRef<number | null>(null)
  const progressTimer = useRef<number | null>(null)
  const undoTimer = useRef<number | null>(null)

  const patchSettings = (patch: Partial<AppSettings>) => setSettings(saveSettings(patch))

  const refreshShelf = useCallback(async () => {
    const next = await books.listBooks()
    setList(next)
    const urls: Record<string, string> = {}
    await Promise.all(
      next.map(async (item) => {
        const url = await books.coverUrl(item.id)
        if (url) urls[item.id] = url
      }),
    )
    setCovers(urls)
  }, [])

  const loadBook = useCallback(async (id: string) => {
    const next = await books.getBook(id)
    setBook(next)
    return next
  }, [])

  const loadTrashMeta = useCallback(async () => {
    setTrashMeta(await books.trashSummary())
  }, [])

  useEffect(() => {
    void refreshShelf()
    void loadTrashMeta()
  }, [refreshShelf, loadTrashMeta])

  useEffect(() => bindKeyboardReveal(), [])

  useEffect(() => {
    const resolved = resolveTheme(settings.theme, window.matchMedia('(prefers-color-scheme: dark)').matches)
    applyTheme(resolved)
    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        Promise.all([
          StatusBar.setStyle({ style: resolved === 'night' ? Style.Dark : Style.Light }),
          StatusBar.setBackgroundColor({
            color: resolved === 'night' ? '#12110f' : resolved === 'sepia' ? '#e6d3a8' : '#efe6d4',
          }).catch(() => undefined),
        ]),
      )
      .catch(() => undefined)
  }, [settings.theme])

  const fail = (err: unknown) => setNotice({ kind: 'err', text: books.messageForUnknown(err) })

  const routeRef = useRef(route)
  const bookRef = useRef(book)
  const docRef = useRef(doc)
  const confirmRef = useRef(confirm)
  const goBackRef = useRef<() => void>(() => {})
  routeRef.current = route
  bookRef.current = book
  docRef.current = doc
  confirmRef.current = confirm

  const goShelf = async () => {
    const current = bookRef.current
    if (current) books.releaseBookImages(current.id)
    setRoute({ name: 'shelf' })
    setBook(null)
    setDoc(null)
    setSelected(new Set())
    await refreshShelf()
  }

  const leaveEditor = (to: Route, splitOnH1 = false) => {
    const current = routeRef.current
    if (current.name !== 'editor') return
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const currentDoc = docRef.current
    setDoc(null)
    setRoute(to)
    if (currentDoc) {
      void books
        .saveDoc(current.bookId, current.chapterId, currentDoc, { splitOnH1 })
        .then((result) => setBook(result.book))
        .catch(fail)
      return
    }
    void loadBook(current.bookId)
  }

  const flushEditor = (splitOnH1 = false) => {
    const current = routeRef.current
    const currentDoc = docRef.current
    if (current.name !== 'editor' || !currentDoc) return Promise.resolve()
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    return books
      .saveDoc(current.bookId, current.chapterId, currentDoc, { splitOnH1 })
      .then((result) => {
        setBook(result.book)
        if (result.focusChapterId !== current.chapterId) {
          setDoc(result.focusDoc)
          setRoute({ name: 'editor', bookId: current.bookId, chapterId: result.focusChapterId, from: current.from })
        }
        return result
      })
      .catch((err) => {
        fail(err)
        return undefined
      })
  }

  const goBack = () => {
    if (confirmRef.current) {
      setConfirm(null)
      return
    }
    const current = routeRef.current
    if (current.name === 'editor') {
      const next = editorBackRoute(current)
      const currentDoc = docRef.current
      if (currentDoc && wouldSplitByH1(currentDoc)) {
        setConfirm({
          title: '要把一级标题拆成新章节吗？',
          body: '正文里出现了多个一级标题。拆章后可以继续写新的一章；也可以保持在这一章里。',
          confirm: '拆成新章',
          extra: '保持一章',
          onExtra: () => {
            setConfirm(null)
            leaveEditor(next, false)
          },
          action: () => {
            setConfirm(null)
            leaveEditor(next, true)
          },
        })
        return
      }
      setConfirm({
        title: '离开编辑？',
        body: '确定返回？修改会自动保存。',
        confirm: '离开',
        action: () => {
          setConfirm(null)
          leaveEditor(next, false)
        },
      })
      return
    }
    if (current.name === 'preview') {
      if (previewBackTarget(current) === 'editor') {
        void openChapter(current.chapterId || bookRef.current?.readChapterId || '', 'preview')
        return
      }
      setRoute({ name: 'chapters', bookId: current.bookId })
      if (bookRef.current) void loadBook(bookRef.current.id)
      return
    }
    if (current.name === 'info') {
      setRoute({ name: 'chapters', bookId: current.bookId })
      return
    }
    if (current.name === 'settings') {
      if (current.bookId) {
        setRoute({ name: 'preview', bookId: current.bookId })
        return
      }
      void goShelf()
      return
    }
    if (current.name === 'chapters') {
      void goShelf()
      return
    }
    void import('@capacitor/app')
      .then(({ App }) => App.exitApp())
      .catch(() => undefined)
  }
  goBackRef.current = goBack
  const flushEditorRef = useRef(flushEditor)
  flushEditorRef.current = flushEditor

  useEffect(() => {
    let cancelled = false
    void requestPersistentStorage().then((status) => {
      if (cancelled) return
      setPersistStatus(status)
      if (status === 'denied') {
        setNotice({ kind: 'err', text: '系统未允许持久保存。请尽快把书导出到手机目录，以免被清理。' })
      }
    })
    void books.purgeExpiredTrash().then((count) => {
      if (count) void loadTrashMeta()
    })
    return () => {
      cancelled = true
    }
  }, [loadTrashMeta])

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flushEditorRef.current()
    }
    const onPageHide = () => {
      void flushEditorRef.current()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    let handle: { remove: () => Promise<void> } | undefined
    void import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', (state) => {
        if (!state.isActive) void flushEditorRef.current()
      }))
      .then((next) => {
        handle = next
      })
      .catch(() => undefined)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      void handle?.remove()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const openIncoming = async (url: string) => {
      if (!/epub/i.test(url)) return
      try {
        setBusy(true)
        const { bytes, name } = await readBytesFromAppUrl(url)
        const imported = await books.importEpub(toArrayBuffer(bytes), name)
        if (cancelled) return
        setBook(imported)
        setCover(await books.coverUrl(imported.id))
        setRoute({ name: 'chapters', bookId: imported.id })
        await refreshShelf()
      } catch (err) {
        fail(err)
      } finally {
        setBusy(false)
      }
    }
    let handle: { remove: () => Promise<void> } | undefined
    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return
        const launch = await App.getLaunchUrl()
        if (launch?.url) void openIncoming(launch.url)
        handle = await App.addListener('appUrlOpen', (event) => {
          void openIncoming(event.url)
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [refreshShelf])

  useEffect(() => {
    let cancelled = false
    let handle: { remove: () => Promise<void> } | undefined
    void import('@capacitor/app')
      .then(({ App }) => {
        if (cancelled) return undefined
        return App.addListener('backButton', () => goBackRef.current())
      })
      .then((next) => {
        if (!next) return
        if (cancelled) {
          void next.remove()
          return
        }
        handle = next
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [])

  const onCreate = async () => {
    try {
      const created = await books.createBook()
      setBook(created)
      setCover(null)
      setRoute({ name: 'chapters', bookId: created.id })
      await refreshShelf()
    } catch (err) {
      fail(err)
    }
  }

  const onImport = async () => {
    try {
      const file = await pickEpubFile()
      if (!file) return
      setBusy(true)
      const imported = await books.importEpub(await file.arrayBuffer(), file.name)
      setBook(imported)
      setCover(await books.coverUrl(imported.id))
      setRoute({ name: 'chapters', bookId: imported.id })
      await refreshShelf()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const onImportText = async () => {
    try {
      const file = await pickTextFile()
      if (!file) return
      setBusy(true)
      const imported = await books.importTextBook(await file.text(), file.name)
      setBook(imported)
      setCover(null)
      setRoute({ name: 'chapters', bookId: imported.id })
      await refreshShelf()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const enterChapter = async (chapterId: string, from: 'preview' | 'chapters') => {
    if (!book) return
    try {
      setBusy(true)
      const opened = await books.openChapterForEdit(book.id, chapterId)
      const hydrated = await books.hydrateDocImages(book.id, opened)
      setDoc(hydrated)
      await loadBook(book.id)
      setRoute({ name: 'editor', bookId: book.id, chapterId, from })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const openChapter = async (chapterId: string, from: 'preview' | 'chapters' = 'chapters') => {
    if (!book) return
    const chapter = book.chapters.find((ch) => ch.id === chapterId)
    if (!chapter) return
    if (chapter.state === 'pristine') {
      const loss = await books.getChapterLoss(book.id, chapterId)
      const lines = lossSummary(loss)
      setConfirm({
        title: '简化这一章？',
        body: (
          <div>
            <p>进入编辑后，这一章的原始排版无法完整保留。没打开过的章节仍会原样打回包。</p>
            {lines.length ? (
              <ul>
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>这一章看起来没有表格或链接，但仍会去掉自定义样式。</p>
            )}
          </div>
        ),
        confirm: '确认编辑',
        extra: '只读不简化',
        onExtra: () => {
          setConfirm(null)
          setRoute({ name: 'preview', bookId: book.id, chapterId, from: 'chapters' })
        },
        action: () => {
          setConfirm(null)
          void enterChapter(chapterId, from)
        },
      })
      return
    }
    await enterChapter(chapterId, from)
  }

  const onDocChange = (next: TiptapDoc) => {
    if (route.name !== 'editor' || !book) return
    const chapterId = route.chapterId
    const bookId = book.id
    setDoc(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void books
        .saveDoc(bookId, chapterId, next, { splitOnH1: false })
        .then((result) => {
          setBook(result.book)
        })
        .catch(fail)
    }, 400)
  }

  const onInsertImage = async () => {
    if (!book) return
    const file = await pickImageFile()
    if (!file) return
    try {
      const inserted = await books.insertImage(book.id, file)
      setPendingImage({ src: inserted.src, imageId: inserted.imageId })
    } catch (err) {
      fail(err)
    }
  }

  const doExportEpub = async () => {
    if (!book) return
    try {
      setBusy(true)
      setNotice(null)
      const bytes = await books.exportEpub(book.id)
      const name = `${book.title || '未命名'}.epub`
      const message = await saveEpubToUser(name, bytes)
      await books.markExported(book.id)
      await loadBook(book.id)
      setNotice({ kind: 'ok', text: message })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const onExport = async () => {
    if (!book) return
    try {
      const issues = await books.inspectExport(book.id)
      if (issues.length) {
        setConfirm({
          title: '导出前看一眼',
          body: (
            <ul>
              {issues.map((issue) => (
                <li key={issue.id}>{issue.message}</li>
              ))}
            </ul>
          ),
          confirm: '仍然导出',
          action: () => {
            setConfirm(null)
            void doExportEpub()
          },
        })
        return
      }
      await doExportEpub()
    } catch (err) {
      fail(err)
    }
  }

  const exportText = async (kind: 'txt' | 'md') => {
    if (!book) return
    try {
      setBusy(true)
      const selectedId = [...selected][0]
      const chapters =
        selected.size === 1 && selectedId
          ? [
              {
                title: exportChapterHeading(
                  [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).findIndex((ch) => ch.id === selectedId),
                  book.chapters.find((ch) => ch.id === selectedId)?.title || '',
                ),
                body: await books.chapterPlain(book.id, book.chapters.find((ch) => ch.id === selectedId)!),
              },
            ]
          : await books.bookPlainChapters(book.id)
      const text = kind === 'md' ? chaptersToMarkdown(chapters) : chaptersToPlain(chapters)
      const bytes = new TextEncoder().encode(text)
      const message = await saveBytesToUser(
        book.title || '未命名',
        bytes,
        kind === 'md' ? 'text/markdown' : 'text/plain',
        kind,
      )
      setNotice({ kind: 'ok', text: message })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const visibleBooks = sortBooks(filterBooks(list, query), settings.shelfSort).sort((a, b) => {
    if (a.starred === b.starred) return 0
    return a.starred ? -1 : 1
  })
  const continueBook = [...list].sort((a, b) => (b.lastReadAt || '').localeCompare(a.lastReadAt || ''))[0]
  const backupCount = list.filter((item) =>
    needsBackupReminder({ updatedAt: item.updatedAt, lastExportedAt: item.lastExportedAt, days: settings.backupDays }),
  ).length

  const editorChapter =
    route.name === 'editor' && book
      ? [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).find((c) => c.id === route.chapterId)
      : undefined
  const editorIndex =
    route.name === 'editor' && book
      ? [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).findIndex((c) => c.id === route.chapterId)
      : -1
  const neighbors =
    route.name === 'editor' && book ? neighborChapterIds(book.chapters, route.chapterId) : {}
  const title =
    route.name === 'chapters'
      ? book?.title || '未命名'
      : route.name === 'editor' && editorChapter && editorIndex >= 0
        ? exportChapterHeading(editorIndex, editorChapter.title)
        : route.name === 'settings'
          ? '设置'
          : route.name === 'info'
            ? '书籍信息'
            : undefined

  const hideTop = route.name === 'preview' || !settings.onboardingDone

  return (
    <div className={route.name === 'preview' ? 'app app-preview' : 'app'}>
      {hideTop ? null : (
        <TopBar
          onBack={route.name === 'shelf' ? undefined : goBack}
          title={title}
          slogan={route.name === 'shelf' ? '写在脑海里的书，装进EPUB里存下。' : undefined}
          right={
            route.name === 'shelf' ? (
              <button className="btn btn-bubble btn-compact" type="button" onClick={() => setRoute({ name: 'settings' })}>
                设置
              </button>
            ) : undefined
          }
        />
      )}
      {notice ? (
        <div className={notice.kind === 'ok' ? 'banner banner-ok' : 'banner'} role="status">
          {notice.text}
          <button type="button" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}
      {busy ? <div className="muted" style={{ padding: '8px 18px' }}>处理中…</div> : null}
      {undo?.kind === 'chapter' && route.name === 'chapters' ? (
        <div className="banner banner-ok" role="status">
          已删除「{undo.title}」
          <button
            type="button"
            onClick={() => {
              if (undoTimer.current) window.clearTimeout(undoTimer.current)
              void books
                .restoreChapter(undo.dump)
                .then(setBook)
                .then(() => setUndo(null))
                .catch(fail)
            }}
          >
            撤销
          </button>
        </div>
      ) : null}

      {!settings.onboardingDone ? <Onboarding onDone={() => patchSettings({ onboardingDone: true })} /> : null}

      {settings.onboardingDone && route.name === 'shelf' ? (
        <BookshelfScreen
          books={visibleBooks}
          covers={covers}
          view={settings.shelfView}
          sort={settings.shelfSort}
          query={query}
          continueBook={continueBook?.lastReadAt ? continueBook : undefined}
          backupCount={backupCount}
          undoLabel={undo?.kind === 'books' ? undo.title : undefined}
          onQuery={setQuery}
          onSort={(shelfSort) => patchSettings({ shelfSort })}
          onView={(shelfView) => patchSettings({ shelfView })}
          onOpen={async (id) => {
            await loadBook(id)
            setCover(await books.coverUrl(id))
            setRoute({ name: 'chapters', bookId: id })
          }}
          onContinue={async () => {
            if (!continueBook) return
            await loadBook(continueBook.id)
            setCover(await books.coverUrl(continueBook.id))
            setRoute({ name: 'preview', bookId: continueBook.id, chapterId: continueBook.readChapterId })
          }}
          onCreate={() => void onCreate()}
          onImport={() => void onImport()}
          onImportText={() => void onImportText()}
          onStar={(ids) => {
            const targets = list.filter((item) => ids.includes(item.id))
            if (targets.length === 0) return
            const starred = nextStarred(targets, ids)
            void Promise.all(targets.map((item) => books.saveBook({ ...item, starred })))
              .then(refreshShelf)
              .catch(fail)
          }}
          onDelete={(ids) =>
            setConfirm({
              title: ids.length > 1 ? `删除这 ${ids.length} 本书？` : '删除这本书？',
              body: '只删除应用里的副本。你另存到系统目录的 EPUB 还在。删除后 10 秒内可以撤销。',
              confirm: '删除',
              danger: true,
              action: () => {
                setConfirm(null)
                const targets = list.filter((item) => ids.includes(item.id))
                void Promise.all(ids.map((id) => books.trashBook(id)))
                  .then(() => {
                    setUndo({
                      kind: 'books',
                      ids,
                      title:
                        ids.length > 1
                          ? `${ids.length} 本书`
                          : targets[0]?.title || '未命名',
                    })
                    if (undoTimer.current) window.clearTimeout(undoTimer.current)
                    undoTimer.current = window.setTimeout(() => {
                      void Promise.all(ids.map((id) => books.purgeTrash(id))).then(() => void loadTrashMeta())
                      setUndo(null)
                    }, 10_000)
                    return Promise.all([refreshShelf(), loadTrashMeta()])
                  })
                  .catch(fail)
              },
            })
          }
          onUndo={() => {
            if (!undo || undo.kind !== 'books') return
            if (undoTimer.current) window.clearTimeout(undoTimer.current)
            void Promise.all(undo.ids.map((id) => books.restoreBook(id)))
              .then(refreshShelf)
              .then(() => setUndo(null))
              .catch(fail)
          }}
        />
      ) : null}

      {route.name === 'chapters' && book ? (
        <ChapterListScreen
          book={book}
          coverUrl={cover}
          selected={selected}
          onToggleSelect={(id) => {
            const next = new Set(selected)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            setSelected(next)
          }}
          onClearSelect={() => setSelected(new Set())}
          onMeta={(patch) => void books.saveBook({ ...book, ...patch }).then(setBook).catch(fail)}
          onCover={async () => {
            const file = await pickImageFile()
            if (!file) return
            const next = await books.saveCover(book.id, file)
            setBook(next)
            setCover(await books.coverUrl(next.id))
          }}
          onOpenChapter={(id) => void openChapter(id)}
          onPreviewChapter={(id) => setRoute({ name: 'preview', bookId: book.id, chapterId: id })}
          onRenameChapter={(id, title) => void books.renameChapter(book.id, id, title).then(setBook).catch(fail)}
          onInsert={(id) => void books.insertChapter(book.id, id).then(setBook).catch(fail)}
          onDelete={(id) =>
            setConfirm({
              title: '删除这一章？',
              body: '删除后导出时不会再包含这一章。10 秒内可以撤销。',
              confirm: '删除',
              danger: true,
              action: () => {
                setConfirm(null)
                void books
                  .snapshotChapter(book.id, id)
                  .then(async (dump) => {
                    const next = await books.deleteChapter(book.id, id)
                    setBook(next)
                    if (!dump) return
                    setUndo({ kind: 'chapter', dump, title: dump.chapter.title || '未命名' })
                    if (undoTimer.current) window.clearTimeout(undoTimer.current)
                    undoTimer.current = window.setTimeout(() => setUndo(null), 10_000)
                  })
                  .catch(fail)
              },
            })
          }
          onMove={(id, dir) => void books.moveChapter(book.id, id, dir).then(setBook).catch(fail)}
          onPreview={() => setRoute({ name: 'preview', bookId: book.id, chapterId: book.readChapterId })}
          onExport={() => void onExport()}
          onExportMenu={() =>
            setConfirm({
              title: '导出为其他格式',
              body: '纯文本最抗时间，适合当备份。若勾选了一章，只导出那一章。',
              confirm: '导出 TXT',
              extra: '导出 Markdown',
              onExtra: () => {
                setConfirm(null)
                void exportText('md')
              },
              action: () => {
                setConfirm(null)
                void exportText('txt')
              },
            })
          }
          onInfo={() => setRoute({ name: 'info', bookId: book.id })}
          onMerge={() => {
            const ids = [...selected]
            if (ids.length !== 2) {
              setNotice({ kind: 'err', text: '请先勾选相邻的两章再合并。' })
              return
            }
            void books.mergeChapters(book.id, ids[0]!, ids[1]!).then((next) => {
              setBook(next)
              setSelected(new Set())
            }).catch(fail)
          }}
          onMoveTo={() => {
            const id = [...selected][0]
            if (!id) {
              setNotice({ kind: 'err', text: '请先勾选要移动的一章。' })
              return
            }
            const n = Number(window.prompt('移到第几章？', '1'))
            if (!Number.isFinite(n)) return
            void books.moveChapterTo(book.id, id, n - 1).then(setBook).catch(fail)
          }}
          onReplaceAll={(search, replacement) =>
            books
              .replaceAllInBook(book.id, search, replacement)
              .then(async (result) => {
                await loadBook(book.id)
                return result
              })
              .catch((err) => {
                fail(err)
              })
          }
        />
      ) : null}

      {route.name === 'info' && book ? (
        <BookInfoScreen
          book={book}
          coverUrl={cover}
          onChange={(patch) => void books.saveBook({ ...book, ...patch }).then(setBook).catch(fail)}
          onCover={async () => {
            const file = await pickImageFile()
            if (!file) return
            const next = await books.saveCover(book.id, file)
            setBook(next)
            setCover(await books.coverUrl(next.id))
          }}
        />
      ) : null}

      {route.name === 'settings' ? (
        <SettingsScreen
          settings={settings}
          onChange={patchSettings}
          persistStatus={persistStatus}
          trashCount={trashMeta.count}
          trashBytes={trashMeta.bytes}
          onEmptyTrash={() =>
            setConfirm({
              title: '清空回收站？',
              body: '回收站里的书会永久删掉，无法再撤销。',
              confirm: '清空',
              danger: true,
              action: () => {
                setConfirm(null)
                void books.emptyTrash().then(loadTrashMeta).catch(fail)
              },
            })
          }
          onBackup={() => {
            void (async () => {
              try {
                setBusy(true)
                const bytes = await books.exportShelfBackup()
                const stamp = new Date().toISOString().slice(0, 10)
                const message = await saveBytesToUser(`素笺书架-${stamp}`, bytes, 'application/zip', 'zip')
                setNotice({ kind: 'ok', text: message })
              } catch (err) {
                fail(err)
              } finally {
                setBusy(false)
              }
            })()
          }}
          onRestore={() => {
            void (async () => {
              const file = await pickBackupFile()
              if (!file) return
              try {
                setBusy(true)
                const result = await books.importShelfBackup(new Uint8Array(await file.arrayBuffer()))
                await refreshShelf()
                const extra = result.renamed ? `（${result.renamed} 本因编号重复换了新编号）` : ''
                setNotice({ kind: 'ok', text: `已恢复 ${result.imported} 本${extra}` })
              } catch (err) {
                fail(err)
              } finally {
                setBusy(false)
              }
            })()
          }}
          onExportAll={() => {
            void (async () => {
              try {
                setBusy(true)
                const all = await books.listBooks()
                for (const item of all) {
                  const bytes = await books.exportEpub(item.id)
                  await writeBytesToLibrary(item.title || '未命名', bytes, 'epub')
                  await books.markExported(item.id)
                }
                await refreshShelf()
                setNotice({ kind: 'ok', text: `已把 ${all.length} 本 EPUB 写到「文档/素笺」。` })
              } catch (err) {
                fail(err)
              } finally {
                setBusy(false)
              }
            })()
          }}
        />
      ) : null}

      {route.name === 'editor' && doc ? (
        <ErrorBoundary>
          <EditorScreen
            docKey={`${route.bookId}:${route.chapterId}`}
            doc={doc}
            pendingImage={pendingImage}
            onImageConsumed={() => setPendingImage(null)}
            onChange={onDocChange}
            onInsertImage={() => void onInsertImage()}
            onPreview={() =>
              leaveEditor({ name: 'preview', bookId: route.bookId, chapterId: route.chapterId, from: 'editor' }, false)
            }
            onSplit={() => {
              const currentDoc = docRef.current
              if (!currentDoc || !wouldSplitByH1(currentDoc)) {
                setNotice({ kind: 'err', text: '这一章里没有第二个一级标题。把要拆出去的段落设成 H1 再点拆章。' })
                return
              }
              setConfirm({
                title: '按一级标题拆章？',
                body: '每个一级标题会变成新的一章，并跳到新拆出的那一章。',
                confirm: '拆章',
                action: () => {
                  setConfirm(null)
                  void flushEditor(true)
                },
              })
            }}
            onPrevChapter={() => {
              const id = neighbors.prevId
              if (!id) return
              void flushEditor(false).then((result) => {
                if (!result) return
                books.releaseBookImages(route.bookId)
                void openChapter(id, route.from ?? 'chapters')
              })
            }}
            onNextChapter={() => {
              const id = neighbors.nextId
              if (!id) return
              void flushEditor(false).then((result) => {
                if (!result) return
                books.releaseBookImages(route.bookId)
                void openChapter(id, route.from ?? 'chapters')
              })
            }}
            hasPrevChapter={Boolean(neighbors.prevId)}
            hasNextChapter={Boolean(neighbors.nextId)}
            onReplaceBook={(search, replacement) => {
              void books.replaceAllInBook(route.bookId, search, replacement).then((result) => {
                setNotice({
                  kind: 'ok',
                  text: `已替换 ${result.count} 处${result.skipped ? `，${result.skipped} 章尚未编辑未改动` : ''}`,
                })
                return books.getDoc(route.bookId, route.chapterId).then((next) => {
                  if (next) setDoc(next)
                })
              }).catch(fail)
            }}
          />
        </ErrorBoundary>
      ) : null}

      {route.name === 'preview' && book ? (
        <PreviewScreen
          book={book}
          startChapterId={route.chapterId}
          settings={settings}
          onSettings={patchSettings}
          onBack={goBack}
          onEdit={(id) => void openChapter(id, 'preview')}
          onProgress={(chapterId, offset) => {
            if (progressTimer.current) window.clearTimeout(progressTimer.current)
            progressTimer.current = window.setTimeout(() => {
              void books.saveProgress(book.id, chapterId, offset).then(setBook)
            }, 400)
          }}
          onOpenSettings={() => setRoute({ name: 'settings', bookId: book.id })}
        />
      ) : null}

      {confirm ? (
        <Dialog
          title={confirm.title}
          body={confirm.body}
          cancel="取消"
          confirm={confirm.confirm}
          extra={confirm.extra}
          onExtra={confirm.onExtra}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.action}
        />
      ) : null}
    </div>
  )
}
