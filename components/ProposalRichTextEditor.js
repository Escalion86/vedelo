'use client'

import AppButton from '@components/AppButton'
import { useEffect, useMemo } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import {
  PROPOSAL_VARIABLE_OPTIONS,
  sanitizeProposalRichText,
} from '@helpers/proposalRichText'

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

const ProposalRichTextEditor = ({ value = '', onChange, placeholder = '' }) => {
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

  return (
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
  )
}

export default ProposalRichTextEditor
