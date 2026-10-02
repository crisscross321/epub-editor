import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { findInRoot, revealElement } from '../../editor/find'
import { simplifyXhtml } from '../../epub/simplify'
import { parseHtml } from '../../epub/xml'
import { docToXhtml } from '../../epub/serialize'
import { replaceAllInDoc } from '../../epub/replace'
import { applyImageLayout, readImageLayout, type ImageAlign } from '../../images/layout'
import type { TiptapDoc } from '../../types/book'
import { htmlFromPaste } from '../../editor/paste'
import { countChars, textFromDoc } from '../../content/text'
import { outlineFromDoc } from '../../editor/outline'
import { replaceEditorHtml } from '../../editor/replaceHtml'
import { excludeChapterTitleFromSelectAll, selectEditorExceptChapterTitle } from '../../editor/selectAll'
import { markBlankBlocks } from '../blankLines'
import { Icon } from '../chrome'
import { EditorToolbar, type FormatKind, type HeadingLevel } from '../EditorToolbar'
import { FindReplaceBar } from '../FindReplaceBar'
import { ImageFloat, imageFloatStyle } from '../ImageFloat'

function toInnerHtml(doc: TiptapDoc): string {
  const parsed = parseHtml(docToXhtml(doc, '编辑'))
  const html = parsed.body?.innerHTML?.trim()
  return html || '<p><br></p>'
}

function run(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function commandState(command: string): boolean {
  return typeof document.queryCommandState === 'function' && document.queryCommandState(command)
}

function commandValue(command: string): string {
  return typeof document.queryCommandValue === 'function' ? document.queryCommandValue(command) : ''
}

export function SimpleEditor(props: {
  docKey: string
  doc: TiptapDoc
  pendingImage: { src: string; imageId: string } | null
  onImageConsumed: () => void
  onChange: (doc: TiptapDoc) => void
  onInsertImage: () => void
  onPreview?: () => void
  onReplaceBook?: (search: string, replacement: string) => void
  onSplit?: () => void
  onPrevChapter?: () => void
  onNextChapter?: () => void
  hasPrevChapter?: boolean
  hasNextChapter?: boolean
}) {
  const surface = useRef<HTMLDivElement>(null)
  const parsedDoc = useRef<TiptapDoc>(props.doc)
  const selectionRef = useRef<Range | null>(null)
  const composing = useRef(false)
  const preserveFullSelection = useRef(false)
  const wordTimer = useRef<number | null>(null)
  const [showFind, setShowFind] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [picked, setPicked] = useState<HTMLImageElement | null>(null)
  const [, setTick] = useState(0)
  const [wordCount, setWordCount] = useState(() => countChars(textFromDoc(props.doc)))

  useLayoutEffect(() => {
    const el = surface.current
    if (!el) return
    el.innerHTML = toInnerHtml(props.doc)
    markBlankBlocks(el)
    parsedDoc.current = props.doc
    selectionRef.current = null
    setPicked(null)
    setWordCount(countChars(textFromDoc(props.doc)))
    // A chapter switch is a new editing session; ordinary parent renders are not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.docKey])

  useLayoutEffect(() => {
    const chrome = surface.current?.parentElement?.querySelector('.editor-chrome')
    if (!(chrome instanceof HTMLElement)) return
    const rootStyle = document.documentElement.style
    const sync = () => {
      const bottom = chrome.getBoundingClientRect().bottom
      if (bottom > 0) rootStyle.setProperty('--editor-cover', `${Math.ceil(bottom)}px`)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(chrome)
    return () => {
      observer.disconnect()
      rootStyle.removeProperty('--editor-cover')
    }
  }, [])

  useLayoutEffect(() => {
    if (props.doc === parsedDoc.current || composing.current) return
    const el = surface.current
    if (!el) return
    const scroll = document.scrollingElement?.scrollTop ?? 0
    el.innerHTML = toInnerHtml(props.doc)
    markBlankBlocks(el)
    parsedDoc.current = props.doc
    selectionRef.current = null
    setPicked(null)
    setWordCount(countChars(textFromDoc(props.doc)))
    if (document.scrollingElement) document.scrollingElement.scrollTop = scroll
  }, [props.doc])

  useEffect(() => {
    let frame = 0
    let later = 0
    const rememberRange = () => {
      const sel = window.getSelection()
      if (sel?.rangeCount && surface.current?.contains(sel.anchorNode) && surface.current.contains(sel.focusNode)) {
        selectionRef.current = sel.getRangeAt(0).cloneRange()
      }
    }
    const excludeTitle = () => {
      const el = surface.current
      if (!el || preserveFullSelection.current) return
      if (excludeChapterTitleFromSelectAll(el)) rememberRange()
    }
    const remember = () => {
      excludeTitle()
      const sel = window.getSelection()
      // Android applies select-all again after the first selectionchange.
      if (sel && !sel.isCollapsed) {
        cancelAnimationFrame(frame)
        window.clearTimeout(later)
        frame = requestAnimationFrame(excludeTitle)
        later = window.setTimeout(excludeTitle, 40)
      }
      rememberRange()
    }
    document.addEventListener('selectionchange', remember)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(later)
      document.removeEventListener('selectionchange', remember)
      if (wordTimer.current) window.clearTimeout(wordTimer.current)
    }
  }, [])

  const focusSurface = () => {
    const el = surface.current
    if (!el) return
    el.focus({ preventScroll: true })
    const range = selectionRef.current
    if (range && el.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  useEffect(() => {
    const el = surface.current
    if (!el || !props.pendingImage) return
    focusSurface()
    const img = document.createElement('img')
    img.src = props.pendingImage.src
    img.setAttribute('data-image-id', props.pendingImage.imageId)
    img.alt = ''
    applyImageLayout(img, 100, 'center')
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(img)
    } else {
      el.appendChild(img)
    }
    markPicked(img)
    emitChange()
    props.onImageConsumed()
  }, [props.pendingImage])

  useEffect(() => {
    if (!showOutline) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('.editor-chrome')) return
      setShowOutline(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowOutline(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [showOutline])

  useEffect(() => {
    if (!picked) return
    const sync = () => setTick((n) => n + 1)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [picked])

  const emitChange = () => {
    const el = surface.current
    if (el && !composing.current) markBlankBlocks(el)
    const html = el?.innerHTML || '<p></p>'
    const next = simplifyXhtml(`<div>${html}</div>`, (src) => src)
    parsedDoc.current = next
    props.onChange(next)
    if (wordTimer.current) window.clearTimeout(wordTimer.current)
    wordTimer.current = window.setTimeout(() => {
      setWordCount(countChars(textFromDoc(parsedDoc.current)))
    }, 400)
  }

  const markPicked = (img: HTMLImageElement | null) => {
    surface.current?.querySelectorAll('img.is-picked').forEach((el) => el.classList.remove('is-picked'))
    if (img) img.classList.add('is-picked')
    setPicked(img)
  }

  const headingOn = (level: HeadingLevel) => {
    const block = commandValue('formatBlock').toLowerCase()
    if (level === 0) return block === 'p' || block === 'div' || block === ''
    return block === `h${level}`
  }

  const formatOn = (kind: FormatKind) => {
    if (kind === 'bold') return commandState('bold')
    if (kind === 'italic') return commandState('italic')
    if (kind === 'bulletList') return commandState('insertUnorderedList')
    return commandState('insertOrderedList')
  }

  const heading = (level: HeadingLevel) => {
    focusSurface()
    run('formatBlock', level === 0 ? '<p>' : `<h${level}>`)
    emitChange()
    setTick((n) => n + 1)
  }

  const layoutPicked = (width: number, align: ImageAlign) => {
    if (!picked) return
    applyImageLayout(picked, width, align)
    emitChange()
    setTick((n) => n + 1)
  }

  const deletePicked = () => {
    if (!picked) return
    picked.remove()
    markPicked(null)
    emitChange()
  }

  const cmd = (command: string) => {
    focusSurface()
    run(command)
    emitChange()
    setTick((n) => n + 1)
  }

  const currentDoc = (): TiptapDoc => {
    const html = surface.current?.innerHTML || '<p></p>'
    return simplifyXhtml(`<div>${html}</div>`, (src) => src)
  }
  const outlineItems = showOutline ? outlineFromDoc(currentDoc()) : []

  return (
    <>
      <EditorToolbar
        headingOn={headingOn}
        formatOn={formatOn}
        onHeading={heading}
        onFormat={(kind) => {
          if (kind === 'bold') cmd('bold')
          if (kind === 'italic') cmd('italic')
          if (kind === 'bulletList') cmd('insertUnorderedList')
          if (kind === 'orderedList') cmd('insertOrderedList')
        }}
        onInsertImage={props.onInsertImage}
        onUndo={() => cmd('undo')}
        onRedo={() => cmd('redo')}
        showFind={showFind}
        onToggleFind={() => setShowFind((v) => !v)}
        showOutline={showOutline}
        onToggleOutline={() => setShowOutline((open) => {
          if (!open) setShowFind(false)
          return !open
        })}
        onPreview={props.onPreview}
        onSplit={props.onSplit}
        wordCount={wordCount}
      >
        {showOutline ? (
          <div
            className="outline-pop"
            role="navigation"
            aria-label="大纲"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button type="button" className="outline-close" aria-label="收起大纲" onClick={() => setShowOutline(false)}>
              <Icon name="chevronUp" size={16} />
            </button>
            <div className="outline-list">
            {outlineItems.length === 0 ? <p className="outline-empty">这一章还没有标题</p> : null}
            {outlineItems.map((item) => (
              <button
                key={`${item.index}-${item.title}`}
                type="button"
                style={{ '--outline-level': String(item.level) } as CSSProperties}
                onClick={() => {
                  const root = surface.current
                  const block = root?.children[item.index]
                  if (!root || !(block instanceof HTMLElement)) return
                  const range = document.createRange()
                  range.selectNodeContents(block)
                  range.collapse(true)
                  selectionRef.current = range.cloneRange()
                  root.focus({ preventScroll: true })
                  const selection = window.getSelection()
                  selection?.removeAllRanges()
                  selection?.addRange(range)
                  revealElement(block)
                  setShowOutline(false)
                }}
              >
                {item.title}
              </button>
            ))}
            </div>
          </div>
        ) : null}
        {showFind ? (
          <FindReplaceBar
            onFind={(search) => findInRoot(surface.current, search, true)}
            onFindNext={(search) => findInRoot(surface.current, search, false)}
            onReplace={(search, replacement) => {
              if (!search) return
              focusSurface()
              const sel = window.getSelection()
              if (sel && surface.current?.contains(sel.anchorNode) && sel.toString() === search) {
                run('insertText', replacement)
                emitChange()
                return
              }
              if (findInRoot(surface.current, search, false) && window.getSelection()?.toString() === search) {
                run('insertText', replacement)
                emitChange()
              }
            }}
            onReplaceAll={(search, replacement) => {
              const { doc, count } = replaceAllInDoc(currentDoc(), search, replacement)
              const el = surface.current
              if (!el || !count) return count
              const scroll = document.scrollingElement?.scrollTop ?? 0
              preserveFullSelection.current = true
              try {
                focusSurface()
                // One native undo step, without letting Chrome fold paragraphs into the chapter title.
                replaceEditorHtml(el, toInnerHtml(doc))
                emitChange()
                if (document.scrollingElement) document.scrollingElement.scrollTop = scroll
                return count
              } finally {
                window.setTimeout(() => {
                  preserveFullSelection.current = false
                }, 0)
              }
            }}
            onReplaceBook={props.onReplaceBook}
          />
        ) : null}
      </EditorToolbar>
      <div
        ref={surface}
        className="ProseMirror"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label="章节正文"
        aria-multiline="true"
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={() => { composing.current = false; emitChange() }}
        onInput={emitChange}
        onKeyDown={(e) => {
          if (e.altKey || e.shiftKey || e.key.toLowerCase() !== 'a' || !(e.metaKey || e.ctrlKey)) return
          e.preventDefault()
          if (surface.current) selectEditorExceptChapterTitle(surface.current)
        }}
        onPaste={(e) => {
          e.preventDefault()
          const html = htmlFromPaste(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain'))
          if (html) run('insertHTML', html)
          emitChange()
        }}
        onKeyUp={() => setTick((n) => n + 1)}
        onMouseUp={() => setTick((n) => n + 1)}
        onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'IMG') markPicked(target as HTMLImageElement)
          else markPicked(null)
        }}
      />
      {picked && document.body.contains(picked) ? (
        <ImageFloat
          width={readImageLayout(picked).width}
          align={readImageLayout(picked).align}
          onWidth={(width) => layoutPicked(width, readImageLayout(picked).align)}
          onAlign={(align) => layoutPicked(readImageLayout(picked).width, align)}
          onDelete={deletePicked}
          style={imageFloatStyle(picked.getBoundingClientRect())}
        />
      ) : null}
      {props.onPrevChapter || props.onNextChapter ? (
        <div className="chapter-nav">
          <button
            className="btn btn-line"
            type="button"
            disabled={!props.hasPrevChapter}
            onClick={props.onPrevChapter}
          >
            上一章
          </button>
          <button
            className="btn btn-line"
            type="button"
            disabled={!props.hasNextChapter}
            onClick={props.onNextChapter}
          >
            下一章
          </button>
        </div>
      ) : null}
    </>
  )
}
