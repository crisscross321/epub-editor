import { useEffect, useRef, useState } from 'react'
import { findInRoot } from '../../editor/find'
import { simplifyXhtml } from '../../epub/simplify'
import { parseHtml } from '../../epub/xml'
import { docToXhtml } from '../../epub/serialize'
import { replaceAllInDoc } from '../../epub/replace'
import { applyImageLayout, readImageLayout, type ImageAlign } from '../../images/layout'
import type { TiptapDoc } from '../../types/book'
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

export function SimpleEditor(props: {
  docKey: string
  doc: TiptapDoc
  pendingImage: { src: string; imageId: string } | null
  onImageConsumed: () => void
  onChange: (doc: TiptapDoc) => void
  onInsertImage: () => void
  onPreview?: () => void
  onReplaceBook?: (search: string, replacement: string) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const [showFind, setShowFind] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [picked, setPicked] = useState<HTMLImageElement | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const el = surface.current
    if (!el) return
    el.innerHTML = toInnerHtml(props.doc)
    markBlankBlocks(el)
    setPicked(null)
    // chapter switch only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.docKey])

  useEffect(() => {
    const el = surface.current
    if (!el || !props.pendingImage) return
    el.focus()
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
    if (el) markBlankBlocks(el)
    const html = el?.innerHTML || '<p></p>'
    props.onChange(simplifyXhtml(`<div>${html}</div>`, (src) => src))
  }

  const markPicked = (img: HTMLImageElement | null) => {
    surface.current?.querySelectorAll('img.is-picked').forEach((el) => el.classList.remove('is-picked'))
    if (img) img.classList.add('is-picked')
    setPicked(img)
  }

  const headingOn = (level: HeadingLevel) => {
    const block = document.queryCommandValue('formatBlock').toLowerCase()
    if (level === 0) return block === 'p' || block === 'div' || block === ''
    return block === `h${level}`
  }

  const formatOn = (kind: FormatKind) => {
    if (kind === 'bold') return document.queryCommandState('bold')
    if (kind === 'italic') return document.queryCommandState('italic')
    if (kind === 'bulletList') return document.queryCommandState('insertUnorderedList')
    return document.queryCommandState('insertOrderedList')
  }

  const heading = (level: HeadingLevel) => {
    surface.current?.focus()
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
    surface.current?.focus()
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
        wordCount={countChars(textFromDoc(currentDoc()))}
      >
        {showOutline ? (
          <div className="outline-pop">
            {outlineFromDoc(currentDoc()).map((item) => (
              <button key={`${item.index}-${item.title}`} type="button">
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
              const sel = window.getSelection()
              if (sel && sel.toString() === search) {
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
              if (el) {
              el.innerHTML = toInnerHtml(doc)
              markBlankBlocks(el)
            }
              props.onChange(doc)
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
        onInput={emitChange}
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
    </>
  )
}
