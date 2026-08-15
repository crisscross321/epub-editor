import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { imageCss, type ImageAlign } from '../images/layout'

function parseAlign(value: string | null | undefined): ImageAlign {
  return value === 'left' || value === 'right' ? value : 'center'
}

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
      width: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute('data-width') || '100') || 100,
        renderHTML: (attributes) => ({
          'data-width': attributes.width ?? 100,
          style: imageCss(
            Number(attributes.width ?? 100) || 100,
            parseAlign(String(attributes.align ?? 'center')),
          ),
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => parseAlign(element.getAttribute('data-align')),
        renderHTML: (attributes) => ({
          'data-align': attributes.align ?? 'center',
        }),
      },
    }
  },
})

export function editorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    BookImage.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({ placeholder: '从这里写下去…' }),
  ]
}
