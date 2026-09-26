'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Notice from '@components/Notice'
import FieldHelp from '@components/FieldHelp'
import IconActionButton from '@components/IconActionButton'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { sendFile } from '@helpers/cloudinary'
import { DEFAULT_PROPOSAL_BLOCKS } from '@helpers/proposalContent'
import {
  getProposalBlockContentHtml,
  PROPOSAL_RICH_TEXT_BLOCK_TYPES,
} from '@helpers/proposalRichText'

const ProposalRichTextEditor = dynamic(
  () => import('@components/ProposalRichTextEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-32 animate-pulse rounded border border-gray-300 bg-gray-100" />
    ),
  }
)

const cloneBlocks = () =>
  DEFAULT_PROPOSAL_BLOCKS.map((item) => ({
    ...item,
    items: [...(item.items || [])],
  }))
const emptyTemplate = () => ({
  uploadKey: crypto.randomUUID(),
  name: '',
  status: 'active',
  blocks: cloneBlocks(),
  messageTemplate:
    'Здравствуйте, {{client.firstName}}! Подготовили предложение для вашего мероприятия: {{proposal.url}}',
  media: [],
})
const blockLabels = {
  cover: 'Обложка',
  intro: 'Вступление',
  packages: 'Варианты',
  media: 'Медиа',
  benefits: 'Преимущества',
  terms: 'Условия',
  contacts: 'Контакты',
  cta: 'Призыв к действию',
}

const ProposalTemplatesPanel = ({ enabled }) => {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const response = await fetch('/api/proposal-templates', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(body?.error?.message || 'Не удалось загрузить шаблоны')
      setItems(body.data || [])
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    // Первичная загрузка шаблонов с сервера, включая состояние loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const updateBlock = (index, patch) =>
    setEditing((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...patch } : block
      ),
    }))
  const moveBlock = (index, direction) =>
    setEditing((current) => {
      const blocks = [...current.blocks]
      const target = index + direction
      if (target < 0 || target >= blocks.length) return current
      ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
      return { ...current, blocks }
    })

  const save = async () => {
    if (!editing?.name?.trim())
      return setMessage({ tone: 'error', text: 'Укажите название шаблона' })
    setSaving(true)
    try {
      const response = await fetch(
        editing._id
          ? `/api/proposal-templates/${editing._id}`
          : '/api/proposal-templates',
        {
          method: editing._id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing),
        }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(body?.error?.message || 'Не удалось сохранить шаблон')
      setEditing(null)
      setMessage({ tone: 'success', text: 'Шаблон сохранён' })
      await load()
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  const uploadMedia = async (file) => {
    if (!file || !editing) return
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(
      file.type
    )
    const isVideo = file.type === 'video/mp4'
    const limit = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if ((!isImage && !isVideo) || file.size > limit) {
      setMessage({
        tone: 'error',
        text: 'Разрешены JPG, PNG, WebP до 10 МБ и MP4 до 50 МБ',
      })
      return
    }
    if ((editing.media || []).length >= 10)
      return setMessage({
        tone: 'error',
        text: 'В шаблоне может быть не больше 10 медиапозиций',
      })
    setSaving(true)
    const result = await sendFile(
      file,
      null,
      `proposal-templates/${editing._id || editing.uploadKey || 'draft'}`
    )
    const uploaded = Array.isArray(result) ? result[0] : result
    const rawUrl = uploaded?.url || uploaded?.fileUrl || ''
    const path = uploaded?.path || uploaded?.filePath || ''
    const url =
      rawUrl ||
      (path
        ? `https://cloud.escalion.ru/uploads/${String(path).replace(/^\/+/, '')}`
        : '')
    if (url)
      setEditing((current) => ({
        ...current,
        media: [
          ...(current.media || []),
          {
            id: crypto.randomUUID(),
            kind: isVideo ? 'video' : 'image',
            url,
            title: file.name,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
          },
        ],
      }))
    else setMessage({ tone: 'error', text: 'Не удалось загрузить файл' })
    setSaving(false)
  }

  if (!enabled)
    return (
      <Notice tone="warning">
        Коммерческие предложения временно доступны только разработчику.
      </Notice>
    )

  if (editing)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 text-lg font-semibold">
            {editing._id ? 'Редактирование шаблона' : 'Новый шаблон'}
            <FieldHelp
              label="Шаблон предложения"
              text="Это основа будущих предложений. Тексты, порядок блоков и медиа копируются при создании КП из заявки."
            />
          </h2>
          <button
            type="button"
            className="action-icon-button h-9 cursor-pointer rounded px-3 text-sm"
            onClick={() => setEditing(null)}
          >
            К списку
          </button>
        </div>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <label className="text-sm font-medium">
          Название
          <input
            className="mt-1 h-10 w-full rounded border border-gray-300 px-3"
            value={editing.name}
            onChange={(event) =>
              setEditing({ ...editing, name: event.target.value })
            }
          />
        </label>
        <label className="text-sm font-medium">
          Сообщение для чата
          <textarea
            className="mt-1 min-h-24 w-full rounded border border-gray-300 p-3"
            value={editing.messageTemplate}
            onChange={(event) =>
              setEditing({ ...editing, messageTemplate: event.target.value })
            }
          />
          <span className="mt-1 block text-xs text-gray-500">
            Переменные: {'{{client.firstName}}'}, {'{{event.type}}'},{' '}
            {'{{event.date}}'}, {'{{proposal.url}}'}
          </span>
        </label>
        <div className="space-y-3">
          <div className="font-semibold">Структура страницы</div>
          {editing.blocks.map((block, index) => (
            <div
              key={block.type}
              className="rounded-lg border border-gray-200 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={block.enabled !== false}
                    onChange={(event) =>
                      updateBlock(index, { enabled: event.target.checked })
                    }
                  />
                  {blockLabels[block.type] || block.type}
                </label>
                <button
                  type="button"
                  className="h-8 cursor-pointer rounded border px-2"
                  onClick={() => moveBlock(index, -1)}
                  aria-label="Поднять блок"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="h-8 cursor-pointer rounded border px-2"
                  onClick={() => moveBlock(index, 1)}
                  aria-label="Опустить блок"
                >
                  ↓
                </button>
              </div>
              <input
                className="mt-3 h-9 w-full rounded border border-gray-300 px-3 text-sm"
                value={block.title || ''}
                onChange={(event) =>
                  updateBlock(index, { title: event.target.value })
                }
                placeholder="Заголовок блока"
              />
              {PROPOSAL_RICH_TEXT_BLOCK_TYPES.includes(block.type) ? (
                <div className="mt-2">
                  <ProposalRichTextEditor
                    value={getProposalBlockContentHtml(block)}
                    onChange={(contentHtml) =>
                      updateBlock(index, { contentHtml })
                    }
                    placeholder="Введите текст блока…"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="font-semibold">
            Фото и видео ({editing.media?.length || 0}/10)
          </div>
          <div className="tablet:grid-cols-2 mt-3 grid gap-2">
            {(editing.media || []).map((item, index) => (
              <div
                key={item.id || item.url}
                className="flex items-center justify-between gap-2 rounded border p-2 text-xs"
              >
                <span className="min-w-0 truncate">
                  {item.title || item.url}
                </span>
                <button
                  type="button"
                  className="cursor-pointer text-red-600"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      media: editing.media.filter(
                        (_, mediaIndex) => mediaIndex !== index
                      ),
                    })
                  }
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
          <div className="tablet:flex-row mt-3 flex flex-col gap-2">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              disabled={saving}
              onChange={(event) => uploadMedia(event.target.files?.[0])}
            />
            <button
              type="button"
              className="action-icon-button h-9 cursor-pointer rounded px-3 text-sm"
              onClick={() => {
                const url = window.prompt(
                  'Ссылка на VK Video, Rutube или YouTube'
                )
                if (url)
                  setEditing({
                    ...editing,
                    media: [
                      ...(editing.media || []),
                      {
                        id: crypto.randomUUID(),
                        kind: 'video_link',
                        url,
                        title: 'Видео',
                      },
                    ].slice(0, 10),
                  })
              }}
            >
              Добавить ссылку на видео
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          className="action-icon-button action-icon-button--warning h-11 cursor-pointer rounded px-4 font-semibold disabled:opacity-50"
          onClick={save}
        >
          {saving ? 'Сохраняем…' : 'Сохранить шаблон'}
        </button>
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">Шаблоны предложений</div>
          <div className="text-xs text-gray-500">
            Структурные страницы, сообщения и медиаподборки
          </div>
        </div>
        <button
          type="button"
          className="action-icon-button action-icon-button--warning tablet:w-auto h-9 w-full cursor-pointer rounded px-3 text-sm"
          onClick={() => {
            setMessage(null)
            setEditing(emptyTemplate())
          }}
        >
          Добавить шаблон
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">Загрузка…</div>
      ) : items.length ? (
        <div className="tablet:grid-cols-2 grid gap-3">
          {items.map((item) => (
            <div
              key={item._id}
              className="proposal-template-card flex items-start gap-3 rounded-lg border border-gray-200 p-3"
            >
              <div className="min-w-0 flex-1 break-words">
                <div className="font-semibold">{item.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {item.blocks?.filter((block) => block.enabled !== false)
                    .length || 0}{' '}
                  блоков · {item.media?.length || 0} медиа ·{' '}
                  {item.status === 'archived' ? 'архив' : 'активен'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <IconActionButton
                  icon={faPencilAlt}
                  variant="warning"
                  size="sm"
                  title="Редактировать"
                  onClick={() => {
                    setMessage(null)
                    setEditing({
                      ...item,
                      blocks: item.blocks?.length ? item.blocks : cloneBlocks(),
                      media: item.media || [],
                    })
                  }}
                />
                <IconActionButton
                  icon={faTrashAlt}
                  variant="danger"
                  size="sm"
                  title="Удалить"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Удалить шаблон? Использованный шаблон будет архивирован.'
                      )
                    )
                      return
                    await fetch(`/api/proposal-templates/${item._id}`, {
                      method: 'DELETE',
                    })
                    load()
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Создайте первый шаблон предложения
        </div>
      )}
    </div>
  )
}

export default ProposalTemplatesPanel
