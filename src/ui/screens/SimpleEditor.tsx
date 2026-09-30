import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findInRoot } from '../../editor/find'
import { simplifyXhtml } from '../../epub/simplify'
import { parseHtml } from '../../epub/xml'
import { docToXhtml } from '../../epub/serialize'
import { replaceAllInDoc } from '../../epub/replace'
import { applyImageLayout, readImageLayout, type ImageAlign } from '../../images/layout'
import type { TiptapDoc } from '../../types/book'
import { htmlFromPaste } from '../../editor/paste'
import { countChars, textFromDoc } from '../../content/text'
import { outlineFromDoc } from '../../editor/outline'
import { markBlankBlocks } from '../blankLines'
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
    const remember = () => {
      const sel = window.getSelection()
      if (sel?.rangeCount && surface.current?.contains(sel.anchorNode) && surface.current.contains(sel.focusNode)) {
        selectionRef.current = sel.getRangeAt(0).cloneRange()
      }
    }
    document.addEventListener('selectionchange', remember)
    return () => {
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
        onToggleOutline={() => setShowOutline((v) => !v)}
        onPreview={props.onPreview}
        onSplit={props.onSplit}
        wordCount={wordCount}
      >
        {showOutline ? (
          <div className="outline-pop">
            {outlineFromDoc(currentDoc()).map((item) => (
              <button
                key={`${item.index}-${item.title}`}
                type="button"
                onClick={() => {
                  const block = surface.current?.children[item.index]
                  if (!(block instanceof HTMLElement)) return
                  block.scrollIntoView({ block: 'start' })
                  const range = document.createRange()
                  range.selectNodeContents(block)
                  range.collapse(true)
                  window.getSelection()?.removeAllRanges()
                  window.getSelection()?.addRange(range)
                  focusSurface()
                  setShowOutline(false)
                }}
              >
                {item.title}
              </button>
            ))}
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
              focusSurface()
              const range = document.createRange()
              range.selectNodeContents(el)
              const sel = window.getSelection()
              sel?.removeAllRanges()
              sel?.addRange(range)
              // Keep this operation on the browser's native undo stack.
              run('insertHTML', toInnerHtml(doc))
              emitChange()
              if (document.scrollingElement) document.scrollingElement.scrollTop = scroll
              return count
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
