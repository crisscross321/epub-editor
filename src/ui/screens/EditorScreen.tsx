import { Capacitor } from '@capacitor/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import type { TiptapDoc } from '../../types/book'
import { findInRoot } from '../../editor/find'
import { editorExtensions } from '../../editor/schema'
import { replaceAllInDoc } from '../../epub/replace'
import { clampWidth, type ImageAlign } from '../../images/layout'
import { EditorToolbar } from '../EditorToolbar'
import { FindReplaceBar } from '../FindReplaceBar'
import { ImageFloat, imageFloatStyle } from '../ImageFloat'
import { SimpleEditor } from './SimpleEditor'

export function EditorScreen(props: {
  docKey: string
  doc: TiptapDoc
  pendingImage: { src: string; imageId: string } | null
  onImageConsumed: () => void
  onChange: (doc: TiptapDoc) => void
  onInsertImage: () => void
}) {
  if (Capacitor.getPlatform() === 'android') {
    return <SimpleEditor {...props} />
  }
  return <TipTapEditor {...props} />
}

function TipTapEditor(props: {
  docKey: string
  doc: TiptapDoc
  pendingImage: { src: string; imageId: string } | null
  onImageConsumed: () => void
  onChange: (doc: TiptapDoc) => void
  onInsertImage: () => void
}) {
  const [showFind, setShowFind] = useState(false)
  const [imageSel, setImageSel] = useState<{ width: number; align: ImageAlign; rect: DOMRect } | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions(),
    content: props.doc,
    editorProps: {
      attributes: { spellcheck: 'false' },
    },
    onUpdate: ({ editor: instance }) => {
      props.onChange(instance.getJSON() as TiptapDoc)
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(props.doc)
    // chapter switch only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, props.docKey])

  useEffect(() => {
    if (!editor || !props.pendingImage) return
    editor.chain().focus().insertContent({
      type: 'image',
      attrs: {
        src: props.pendingImage.src,
        imageId: props.pendingImage.imageId,
        width: 100,
        align: 'center',
      },
    }).run()
    props.onImageConsumed()
  }, [editor, props.pendingImage, props.onImageConsumed])

  useEffect(() => {
    if (!editor) return
    const sync = () => {
      if (!editor.isActive('image')) {
        setImageSel(null)
        return
      }
      const attrs = editor.getAttributes('image')
      const raw = String(attrs.align ?? 'center')
      const align: ImageAlign = raw === 'left' || raw === 'right' ? raw : 'center'
      const from = editor.state.selection.from
      const dom = editor.view.nodeDOM(from)
      const el =
        dom instanceof HTMLElement
          ? dom.tagName === 'IMG'
            ? dom
            : dom.querySelector('img')
          : null
      const rect = el?.getBoundingClientRect()
      if (!rect) {
        setImageSel(null)
        return
      }
      setImageSel({
        width: clampWidth(Number(attrs.width ?? 100) || 100),
        align,
        rect,
      })
    }
    editor.on('selectionUpdate', sync)
    editor.on('transaction', sync)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      editor.off('selectionUpdate', sync)
      editor.off('transaction', sync)
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [editor])

  if (!editor) {
    return <div className="muted" style={{ padding: 20 }}>正在打开编辑器…</div>
  }

  const setBlock = (level: 0 | 1 | 2 | 3) => {
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <>
      <EditorToolbar
        headingOn={(level) => (level === 0 ? editor.isActive('paragraph') : editor.isActive('heading', { level }))}
        formatOn={(kind) => editor.isActive(kind)}
        onHeading={setBlock}
        onFormat={(kind) => {
          if (kind === 'bold') editor.chain().focus().toggleBold().run()
          if (kind === 'italic') editor.chain().focus().toggleItalic().run()
          if (kind === 'bulletList') editor.chain().focus().toggleBulletList().run()
          if (kind === 'orderedList') editor.chain().focus().toggleOrderedList().run()
        }}
        onInsertImage={props.onInsertImage}
        onUndo={() => editor.chain().focus().undo().run()}
        onRedo={() => editor.chain().focus().redo().run()}
        showFind={showFind}
        onToggleFind={() => setShowFind((v) => !v)}
      >
        {showFind ? (
          <FindReplaceBar
            onFind={(search) => findInRoot(editor.view.dom, search, true)}
            onFindNext={(search) => findInRoot(editor.view.dom, search, false)}
            onReplace={(search, replacement) => {
              if (window.getSelection()?.toString() === search) {
                editor.commands.insertContent(replacement)
                return
              }
              if (findInRoot(editor.view.dom, search, false) && window.getSelection()?.toString() === search) {
                editor.commands.insertContent(replacement)
              }
            }}
            onReplaceAll={(search, replacement) => {
              const { doc, count } = replaceAllInDoc(editor.getJSON() as TiptapDoc, search, replacement)
              editor.commands.setContent(doc)
              props.onChange(doc)
              return count
            }}
          />
        ) : null}
      </EditorToolbar>
      <EditorContent editor={editor} />
      {imageSel ? (
        <ImageFloat
          width={imageSel.width}
          align={imageSel.align}
          onWidth={(width) => editor.chain().updateAttributes('image', { width }).run()}
          onAlign={(align) => editor.chain().updateAttributes('image', { align }).run()}
          style={imageFloatStyle(imageSel.rect)}
        />
      ) : null}
    </>
  )
}
