import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

export const BookImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-image-id'),
        renderHTML: (attributes) =>
          attributes.imageId ? { 'data-image-id': attributes.imageId } : {},
      },
    }
  },
})

export function editorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    BookImage.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({ placeholder: '从这里写下去…' }),
  ]
}
