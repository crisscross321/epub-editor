import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookRecord, TiptapDoc } from './types/book'
import * as books from './app/bookService'
import { pickEpubFile, pickImageFile, saveEpubToUser } from './storage/files'
import { Dialog, TopBar } from './ui/chrome'
import { BookInfoScreen } from './ui/screens/BookInfoScreen'
import { BookshelfScreen } from './ui/screens/BookshelfScreen'
import { ChapterListScreen } from './ui/screens/ChapterListScreen'
import { EditorScreen } from './ui/screens/EditorScreen'
import { PreviewScreen } from './ui/screens/PreviewScreen'

type Route =
  | { name: 'shelf' }
  | { name: 'chapters'; bookId: string }
  | { name: 'editor'; bookId: string; chapterId: string }
  | { name: 'info'; bookId: string }
  | { name: 'preview'; bookId: string }

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'shelf' })
  const [list, setList] = useState<BookRecord[]>([])
  const [book, setBook] = useState<BookRecord | null>(null)
  const [doc, setDoc] = useState<TiptapDoc | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [error, setError] = useState('')
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

  const fail = (err: unknown) => setError(books.messageForUnknown(err))

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
    if (route.name !== 'editor' || !book) return
    setDoc(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void books.saveDoc(book.id, route.chapterId, next)
    }, 800)
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
      const bytes = await books.exportEpub(book.id)
      const name = `${book.title || '未命名'}.epub`
      await saveEpubToUser(name, bytes)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const title =
    route.name === 'chapters'
      ? book?.title || '未命名'
      : route.name === 'editor'
        ? book?.chapters.find((c) => route.name === 'editor' && c.id === route.chapterId)?.title || '编辑'
        : route.name === 'info'
          ? '书籍信息'
          : route.name === 'preview'
            ? '阅读预览'
            : undefined

  return (
    <div className="app">
      <TopBar
        onBack={route.name === 'shelf' ? undefined : () => {
          if (route.name === 'editor' || route.name === 'info' || route.name === 'preview') {
            setRoute({ name: 'chapters', bookId: route.bookId })
            if (book) void loadBook(book.id)
            return
          }
          void goShelf()
        }}
        title={title}
      />
      {error ? (
        <div className="banner" role="alert">
          {error}
          <button type="button" onClick={() => setError('')}>
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
          onOpenChapter={(id) => void openChapter(id)}
          onAdd={() => void books.addChapter(book.id).then(setBook).catch(fail)}
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
          onInfo={async () => {
            setCover(await books.coverUrl(book.id))
            setRoute({ name: 'info', bookId: book.id })
          }}
          onPreview={() => setRoute({ name: 'preview', bookId: book.id })}
          onExport={() => void onExport()}
        />
      ) : null}

      {route.name === 'editor' && doc ? (
        <EditorScreen
          docKey={`${route.bookId}:${route.chapterId}`}
          doc={doc}
          pendingImage={pendingImage}
          onImageConsumed={() => setPendingImage(null)}
          onChange={onDocChange}
          onInsertImage={() => void onInsertImage()}
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
