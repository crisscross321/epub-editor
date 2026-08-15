import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect } from 'react'
import type { TiptapDoc } from '../../types/book'
import { editorExtensions } from '../../editor/schema'

export function EditorScreen(props: {
  docKey: string
  doc: TiptapDoc
  pendingImage: { src: string; imageId: string } | null
  onImageConsumed: () => void
  onChange: (doc: TiptapDoc) => void
  onInsertImage: () => void
}) {
  const editor = useEditor({
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
      attrs: { src: props.pendingImage.src, imageId: props.pendingImage.imageId },
    }).run()
    props.onImageConsumed()
  }, [editor, props.pendingImage, props.onImageConsumed])

  if (!editor) return null

  const setBlock = (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <>
      <div className="toolbar">
        <button type="button" className={editor.isActive('heading', { level: 1 }) ? 'is-on' : ''} onClick={() => setBlock(1)}>
          H1
        </button>
        <button type="button" className={editor.isActive('heading', { level: 2 }) ? 'is-on' : ''} onClick={() => setBlock(2)}>
          H2
        </button>
        <button type="button" className={editor.isActive('heading', { level: 3 }) ? 'is-on' : ''} onClick={() => setBlock(3)}>
          H3
        </button>
        <button type="button" className={editor.isActive('heading', { level: 4 }) ? 'is-on' : ''} onClick={() => setBlock(4)}>
          H4
        </button>
        <button type="button" className={editor.isActive('heading', { level: 5 }) ? 'is-on' : ''} onClick={() => setBlock(5)}>
          H5
        </button>
        <button type="button" className={editor.isActive('heading', { level: 6 }) ? 'is-on' : ''} onClick={() => setBlock(6)}>
          H6
        </button>
        <button type="button" className={editor.isActive('paragraph') ? 'is-on' : ''} onClick={() => setBlock(0)}>
          正文
        </button>
        <button type="button" className={editor.isActive('bold') ? 'is-on' : ''} onClick={() => editor.chain().focus().toggleBold().run()}>
          粗
        </button>
        <button type="button" className={editor.isActive('italic') ? 'is-on' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}>
          斜
        </button>
        <button type="button" className={editor.isActive('bulletList') ? 'is-on' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          列表
        </button>
        <button type="button" className={editor.isActive('orderedList') ? 'is-on' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          编号
        </button>
        <button type="button" onClick={props.onInsertImage}>
          插图
        </button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()}>
          撤销
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()}>
          重做
        </button>
      </div>
      <EditorContent editor={editor} />
    </>
  )
}
