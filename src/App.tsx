import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookRecord, TiptapDoc } from './types/book'
import * as books from './app/bookService'
import { exportChapterHeading, splitDocByH1 } from './epub/headings'
import { pickEpubFile, pickImageFile, saveEpubToUser } from './storage/files'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Dialog, TopBar } from './ui/chrome'
import { BookshelfScreen } from './ui/screens/BookshelfScreen'
import { ChapterListScreen } from './ui/screens/ChapterListScreen'
import { EditorScreen } from './ui/screens/EditorScreen'
import { PreviewScreen } from './ui/screens/PreviewScreen'

type Route =
  | { name: 'shelf' }
  | { name: 'chapters'; bookId: string }
  | { name: 'editor'; bookId: string; chapterId: string }
  | { name: 'preview'; bookId: string }

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'shelf' })
  const [list, setList] = useState<BookRecord[]>([])
  const [book, setBook] = useState<BookRecord | null>(null)
  const [doc, setDoc] = useState<TiptapDoc | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<null | {
    title: string
    body: string
    confirm: string
    danger?: boolean
    action: () => void
  }>(null)
  const [pendingImage, setPendingImage] = useState<{ src: string; imageId: string } | null>(null)
  const saveTimer = useRef<number | null>(null)
  const splitting = useRef(false)

  const refreshShelf = useCallback(async () => {
    setList(await books.listBooks())
  }, [])

  const loadBook = useCallback(async (id: string) => {
    const next = await books.getBook(id)
    setBook(next)
    return next
  }, [])

  useEffect(() => {
    void refreshShelf()
  }, [refreshShelf])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  const fail = (err: unknown) => setNotice({ kind: 'err', text: books.messageForUnknown(err) })

  const goShelf = async () => {
    setRoute({ name: 'shelf' })
    setBook(null)
    setDoc(null)
    await refreshShelf()
  }

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

  const openChapter = async (chapterId: string) => {
    if (!book) return
    const chapter = book.chapters.find((ch) => ch.id === chapterId)
    if (!chapter) return
    const enter = async () => {
      try {
        setBusy(true)
        const opened = await books.openChapterForEdit(book.id, chapterId)
        const hydrated = await books.hydrateDocImages(book.id, opened)
        setDoc(hydrated)
        await loadBook(book.id)
        setRoute({ name: 'editor', bookId: book.id, chapterId })
      } catch (err) {
        fail(err)
      } finally {
        setBusy(false)
      }
    }
    if (chapter.state === 'pristine') {
      setConfirm({
        title: '简化这一章？',
        body: '进入编辑后，这一章的原始排版无法完整保留。没打开过的章节仍会原样打回包。',
        confirm: '确认编辑',
        action: () => {
          setConfirm(null)
          void enter()
        },
      })
      return
    }
    await enter()
  }

  const onDocChange = (next: TiptapDoc) => {
    if (route.name !== 'editor' || !book || splitting.current) return
    const chapterId = route.chapterId
    const bookId = book.id
    const currentTitle = book.chapters.find((ch) => ch.id === chapterId)?.title || ''
    setDoc(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    const willSplit = splitDocByH1(next, currentTitle).length > 1
    if (willSplit) splitting.current = true
    saveTimer.current = window.setTimeout(() => {
      void books
        .saveDoc(bookId, chapterId, next)
        .then((result) => {
          setBook(result.book)
          if (result.focusChapterId !== chapterId) {
            setDoc(result.focusDoc)
            setRoute({ name: 'editor', bookId, chapterId: result.focusChapterId })
          }
        })
        .catch(fail)
        .finally(() => {
          splitting.current = false
        })
    }, willSplit ? 0 : 800)
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

  const onExport = async () => {
    if (!book) return
    try {
      setBusy(true)
      setNotice(null)
      const bytes = await books.exportEpub(book.id)
      const name = `${book.title || '未命名'}.epub`
      const message = await saveEpubToUser(name, bytes)
      setNotice({ kind: 'ok', text: message })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const editorChapter =
    route.name === 'editor' && book
      ? [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).find((c) => c.id === route.chapterId)
      : undefined
  const editorIndex =
    route.name === 'editor' && book
      ? [...book.chapters].sort((a, b) => a.spineIndex - b.spineIndex).findIndex((c) => c.id === route.chapterId)
      : -1
  const title =
    route.name === 'chapters'
      ? book?.title || '未命名'
      : route.name === 'editor' && editorChapter && editorIndex >= 0
        ? exportChapterHeading(editorIndex, editorChapter.title)
        : route.name === 'preview'
          ? '阅读预览'
          : undefined

  return (
      <div className={route.name === 'preview' ? 'app app-preview' : 'app'}>
      <TopBar
        onBack={route.name === 'shelf' ? undefined : () => {
          if (route.name === 'editor' || route.name === 'preview') {
            setRoute({ name: 'chapters', bookId: route.bookId })
            if (book) void loadBook(book.id)
            return
          }
          void goShelf()
        }}
        title={title}
      />
      {notice ? (
        <div className={notice.kind === 'ok' ? 'banner banner-ok' : 'banner'} role="status">
          {notice.text}
          <button type="button" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}
      {busy ? <div className="muted" style={{ padding: '8px 18px' }}>处理中…</div> : null}

      {route.name === 'shelf' ? (
        <BookshelfScreen
          books={list}
          onOpen={async (id) => {
            await loadBook(id)
            setCover(await books.coverUrl(id))
            setRoute({ name: 'chapters', bookId: id })
          }}
          onCreate={() => void onCreate()}
          onImport={() => void onImport()}
          onDelete={(id) =>
            setConfirm({
              title: '删除这本书？',
              body: '只删除应用里的副本。你另存到系统目录的 EPUB 还在。',
              confirm: '删除',
              danger: true,
              action: () => {
                setConfirm(null)
                void books.deleteBook(id).then(refreshShelf).catch(fail)
              },
            })
          }
        />
      ) : null}

      {route.name === 'chapters' && book ? (
        <ChapterListScreen
          book={book}
          coverUrl={cover}
          onMeta={(patch) => void books.saveBook({ ...book, ...patch }).then(setBook).catch(fail)}
          onCover={async () => {
            const file = await pickImageFile()
            if (!file) return
            const next = await books.saveCover(book.id, file)
            setBook(next)
            setCover(await books.coverUrl(next.id))
          }}
          onOpenChapter={(id) => void openChapter(id)}
          onRenameChapter={(id, title) => void books.renameChapter(book.id, id, title).then(setBook).catch(fail)}
          onInsert={(id) => void books.insertChapter(book.id, id).then(setBook).catch(fail)}
          onDelete={(id) =>
            setConfirm({
              title: '删除这一章？',
              body: '删除后导出时不会再包含这一章。',
              confirm: '删除',
              danger: true,
              action: () => {
                setConfirm(null)
                void books.deleteChapter(book.id, id).then(setBook).catch(fail)
              },
            })
          }
          onMove={(id, dir) => void books.moveChapter(book.id, id, dir).then(setBook).catch(fail)}
          onPreview={() => setRoute({ name: 'preview', bookId: book.id })}
          onExport={() => void onExport()}
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
          />
        </ErrorBoundary>
      ) : null}

      {route.name === 'preview' && book ? <PreviewScreen book={book} /> : null}

      {confirm ? (
        <Dialog
          title={confirm.title}
          body={confirm.body}
          cancel="取消"
          confirm={confirm.confirm}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.action}
        />
      ) : null}
    </div>
  )
}
