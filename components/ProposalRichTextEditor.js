'use client'

import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { sendFile } from '@helpers/cloudinary'
import { resolveUploadedFileUrl } from '@helpers/escalionCloudUpload.mjs'
import {
  PROPOSAL_VARIABLE_OPTIONS,
  sanitizeProposalRichText,
} from '@helpers/proposalRichText'

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 40 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm'])

const ProposalVariable = Node.create({
  name: 'proposalVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-proposal-variable') || '',
      },
      label: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-proposal-variable-label') || '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-proposal-variable]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const key = String(HTMLAttributes.key || '')
    const label = String(HTMLAttributes.label || key)
    return [
      'span',
      mergeAttributes({
        'data-proposal-variable': key,
        'data-proposal-variable-label': label,
        contenteditable: 'false',
      }),
      `{{${key}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${node.attrs.key}}}`
  },

  addCommands() {
    return {
      insertProposalVariable:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    }
  },
})

const createMediaNode = ({ name, tag, isVideo }) =>
  Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
      const common = {
        src: { default: '' },
        title: { default: null },
      }
      if (isVideo) return common
      return {
        ...common,
        alt: { default: '' },
        loading: { default: 'lazy' },
      }
    },

    parseHTML() {
      return [{ tag: `${tag}[src]` }]
    },

    renderHTML({ HTMLAttributes }) {
      if (isVideo)
        return [
          'video',
          mergeAttributes(HTMLAttributes, {
            controls: '',
            playsinline: '',
            preload: 'metadata',
          }),
        ]
      return ['img', mergeAttributes(HTMLAttributes, { loading: 'lazy' })]
    },
  })

const ProposalImage = createMediaNode({
  name: 'proposalImage',
  tag: 'img',
  isVideo: false,
})
const ProposalVideo = createMediaNode({
  name: 'proposalVideo',
  tag: 'video',
  isVideo: true,
})

const ProposalRichTextEditor = ({
  value = '',
  onChange,
  placeholder = '',
  directory = 'proposals/draft',
}) => {
  const fileInputRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
        codeBlock: false,
        code: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      ProposalVariable,
      ProposalImage,
      ProposalVideo,
    ],
    []
  )

  const editor = useEditor({
    extensions,
    content: sanitizeProposalRichText(value) || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'proposal-rich-text-content min-h-32 px-3 py-3 text-sm text-gray-800 focus:outline-none',
        'aria-label': placeholder || 'Текст блока предложения',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (typeof onChange === 'function')
        onChange(sanitizeProposalRichText(currentEditor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    const normalized = sanitizeProposalRichText(value) || '<p></p>'
    if (sanitizeProposalRichText(editor.getHTML()) === normalized) return
    editor.commands.setContent(normalized, { emitUpdate: false })
  }, [editor, value])

  if (!editor)
    return (
      <div className="min-h-32 animate-pulse rounded border border-gray-300 bg-gray-100" />
    )

  const setLink = () => {
    const currentHref = editor.getAttributes('link').href || ''
    const href = window.prompt('Адрес ссылки', currentHref)
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: href.trim() })
      .run()
  }

  const uploadMedia = async (file) => {
    if (!file || isUploading) return
    const isVideo = ALLOWED_VIDEO_TYPES.has(file.type)
    if (!isVideo && !ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError('Разрешены картинки JPG, PNG, WebP, GIF и видео MP4, WebM')
      return
    }
    const sizeLimit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES
    if (file.size > sizeLimit) {
      setUploadError(
        isVideo
          ? 'Видео должно быть не больше 40 МБ'
          : 'Картинка должна быть не больше 10 МБ'
      )
      return
    }

    setUploadError('')
    setIsUploading(true)
    try {
      const uploadResult = await sendFile(
        file,
        null,
        directory,
        null,
        'artistcrm',
        (message) => setUploadError(message || 'Не удалось загрузить файл')
      )
      const url = resolveUploadedFileUrl(uploadResult, { directory })
      if (!url) {
        setUploadError('Сервер не вернул ссылку на загруженный файл')
        return
      }
      const inserted = editor
        .chain()
        .focus()
        .insertContent([
          isVideo
            ? {
                type: 'proposalVideo',
                attrs: { src: url, title: file.name || 'Видео' },
              }
            : {
                type: 'proposalImage',
                attrs: { src: url, alt: file.name || 'Изображение' },
              },
          { type: 'paragraph' },
        ])
        .run()
      if (!inserted)
        setUploadError('Файл загрузился, но не вставился в текст блока')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="proposal-rich-text-editor overflow-hidden rounded-lg border border-gray-300 bg-white">
        <div className="proposal-rich-text-toolbar flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('bold') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Полужирный"
          >
            Ж
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('italic') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Курсив"
          >
            К
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={
              editor.isActive('heading', { level: 2 }) ? 'primary' : 'secondary'
            }
            aria-pressed={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H2
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={
              editor.isActive('heading', { level: 3 }) ? 'primary' : 'secondary'
            }
            aria-pressed={editor.isActive('heading', { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            H3
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('bulletList') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Маркированный список"
          >
            • Список
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('orderedList') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Нумерованный список"
          >
            1. Список
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('blockquote') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Цитата"
          >
            Цитата
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant={editor.isActive('link') ? 'primary' : 'secondary'}
            aria-pressed={editor.isActive('link')}
            onClick={setLink}
          >
            Ссылка
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant="secondary"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            title="Вставить картинку"
          >
            {isUploading ? 'Загрузка…' : 'Картинка'}
          </AppButton>
          <AppButton
            size="sm"
            type="button"
            variant="secondary"
            disabled={isUploading}
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = ''
              fileInputRef.current?.click()
            }}
            title="Вставить видео"
          >
            {isUploading ? 'Загрузка…' : 'Видео'}
          </AppButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            className="hidden"
            onChange={(event) => {
              void uploadMedia(event.target.files?.[0] ?? null)
              event.target.value = ''
            }}
          />
          <select
            className="h-8 min-w-40 cursor-pointer rounded border border-gray-300 bg-white px-2 text-xs"
            defaultValue=""
            onChange={(event) => {
              const key = event.target.value
              const option = PROPOSAL_VARIABLE_OPTIONS.find(
                (item) => item.key === key
              )
              if (option) {
                editor
                  .chain()
                  .focus()
                  .insertProposalVariable(option)
                  .insertContent(' ')
                  .run()
              }
              event.target.value = ''
            }}
            aria-label="Вставить переменную"
          >
            <option value="">Вставить данные…</option>
            {PROPOSAL_VARIABLE_OPTIONS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <EditorContent editor={editor} />
          {editor.isEmpty && placeholder ? (
            <div className="pointer-events-none absolute top-3 left-3 text-sm text-gray-400">
              {placeholder}
            </div>
          ) : null}
        </div>
      </div>
      {uploadError ? <Notice tone="error">{uploadError}</Notice> : null}
    </div>
  )
}

export default ProposalRichTextEditor
