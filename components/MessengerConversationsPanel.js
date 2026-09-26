'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import formatDateTime from '@helpers/formatDateTime'
import useSnackbar from '@helpers/useSnackbar'
import AudioPlayer from '@components/AudioPlayer'

const buildQuery = ({ clientId, eventId }) => {
  const params = new URLSearchParams()
  if (clientId) params.set('clientId', clientId)
  if (eventId) params.set('eventId', eventId)
  return params.toString()
}

const getAudioAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.audioUrl)
}

const getPhotoAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.photoUrl)
}

const getVideoAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.videoUrl)
}

const getFileAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.fileUrl)
}

const formatFileSize = (size) => {
  const bytes = Number(size)
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

const MessageBubble = ({ message }) => {
  const audioAttachments = getAudioAttachments(message)
  const photoAttachments = getPhotoAttachments(message)
  const videoAttachments = getVideoAttachments(message)
  const fileAttachments = getFileAttachments(message)

  return (
    <div
      className={`flex ${
        message.direction === 'outgoing' ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`max-w-[85%] rounded px-3 py-2 text-sm ${
          message.direction === 'outgoing'
            ? 'bg-general text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
        {photoAttachments.length > 0 ? (
          <div className="mt-2 grid grid-cols-1 gap-2">
            {photoAttachments.map((attachment, index) => (
              <a
                key={`${message._id}-photo-${index}`}
                href={attachment.photoUrl}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded border border-black/10 bg-white/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.photoUrl}
                  alt={attachment.title || 'Фото VK'}
                  className="max-h-72 w-full max-w-80 object-contain"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : null}
        {videoAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {videoAttachments.map((attachment, index) =>
              attachment.videoUrl.includes('.mp4') ? (
                <video
                  key={`${message._id}-video-${index}`}
                  className="max-h-72 w-full max-w-80 rounded bg-black"
                  controls
                  preload="metadata"
                  src={attachment.videoUrl}
                >
                  Ваш браузер не поддерживает видео.
                </video>
              ) : attachment.previewUrl ? (
                <a
                  key={`${message._id}-video-${index}`}
                  href={attachment.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block max-w-80 overflow-hidden rounded border border-black/10 bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.title || attachment.label || 'Видео VK'}
                    className="max-h-72 w-full object-contain opacity-80"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
                    Открыть видео VK
                  </span>
                </a>
              ) : (
                <a
                  key={`${message._id}-video-${index}`}
                  href={attachment.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex rounded border px-3 py-2 text-xs font-semibold ${
                    message.direction === 'outgoing'
                      ? 'border-white/30 text-white'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  Открыть видео VK
                </a>
              )
            )}
          </div>
        ) : null}
        {audioAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {audioAttachments.map((attachment, index) => (
              <AudioPlayer
                key={`${message._id}-audio-${index}`}
                src={attachment.audioUrl}
                title={attachment.title || 'Голосовая запись'}
                compact
              />
            ))}
          </div>
        ) : null}
        {fileAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {fileAttachments.map((attachment, index) => (
              <a
                key={`${message._id}-file-${index}`}
                href={attachment.fileUrl}
                target="_blank"
                rel="noreferrer"
                className={`flex max-w-80 items-center justify-between gap-3 rounded border px-3 py-2 text-xs ${
                  message.direction === 'outgoing'
                    ? 'border-white/30 text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {attachment.fileName || 'Файл VK'}
                  </span>
                  <span className="block opacity-70">
                    {[attachment.fileExt, formatFileSize(attachment.fileSize)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">Скачать</span>
              </a>
            ))}
          </div>
        ) : null}
        <div className="mt-1 text-[10px] opacity-70">
          {formatDateTime(message.sentAt || message.createdAt)}
          {message.status === 'failed' ? ' · ошибка отправки' : ''}
        </div>
      </div>
    </div>
  )
}

const MessengerConversationsPanel = ({
  clientId = '',
  eventId = '',
  provider,
  title,
  emptyText,
  loadingText,
  replyPlaceholder,
  sendButtonText,
  getConversationTitle,
  getConversationSubtitle,
  getConversationMeta,
}) => {
  const snackbar = useSnackbar()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')

  const query = useMemo(() => buildQuery({ clientId, eventId }), [clientId, eventId])
  const selectedConversation = useMemo(
    () => conversations.find((item) => item._id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const loadMessages = useCallback(
    async ({ showSuccess = false } = {}) => {
      if (!selectedId) {
        setMessages([])
        return
      }
      setMessagesLoading(true)
      try {
        const response = await fetch(
          `/api/integrations/${provider}/conversations/${selectedId}/messages`
        )
        const result = await response.json().catch(() => ({}))
        const nextMessages = Array.isArray(result?.data?.messages)
          ? result.data.messages
          : []
        setMessages(nextMessages)
        if (result?.data?.conversation) {
          setConversations((prev) =>
            prev.map((item) =>
              item._id === result.data.conversation._id
                ? result.data.conversation
                : item
            )
          )
        }
        if (showSuccess) snackbar.success('Сообщения обновлены')
      } catch (error) {
        snackbar.error(`Не удалось загрузить сообщения ${title}`)
      } finally {
        setMessagesLoading(false)
      }
    },
    [provider, selectedId, snackbar, title]
  )

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!query) return
      setLoading(true)
      try {
        const response = await fetch(`/api/integrations/${provider}/conversations?${query}`)
        const result = await response.json().catch(() => ({}))
        if (!active) return
        const items = Array.isArray(result?.data) ? result.data : []
        setConversations(items)
        setSelectedId((current) => current || items[0]?._id || '')
      } catch (error) {
        if (active) snackbar.error(`Не удалось загрузить переписки ${title}`)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [provider, query, snackbar, title])

  useEffect(() => {
    // Смена беседы запускает HTTP-запрос и его индикатор загрузки.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages()
  }, [loadMessages])

  const sendMessage = async () => {
    const nextText = text.trim()
    if (!selectedId || !nextText) return
    setSending(true)
    try {
      const response = await fetch(
        `/api/integrations/${provider}/conversations/${selectedId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: nextText }),
        }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        snackbar.error(result?.error?.message || 'Не удалось отправить сообщение')
        if (result?.data?.message) setMessages((prev) => [...prev, result.data.message])
        return
      }
      if (result?.data?.message) setMessages((prev) => [...prev, result.data.message])
      setText('')
    } catch (error) {
      snackbar.error('Не удалось отправить сообщение')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">{loadingText}</div>
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {conversations.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {conversations.map((conversation) => (
            <button
              key={conversation._id}
              type="button"
              className={`shrink-0 cursor-pointer rounded border px-3 py-2 text-left text-xs ${
                selectedId === conversation._id
                  ? 'border-general bg-general text-white'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              onClick={() => setSelectedId(conversation._id)}
            >
              <div className="font-semibold">{getConversationTitle(conversation)}</div>
              <div className="max-w-40 truncate opacity-80">
                {getConversationSubtitle(conversation)}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {selectedConversation ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-gray-800">
                {getConversationTitle(selectedConversation)}
              </div>
              <div>{getConversationMeta(selectedConversation)}</div>
              {selectedConversation.lastMessageAt ? (
                <div>
                  Последнее сообщение:{' '}
                  {formatDateTime(selectedConversation.lastMessageAt)}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-general hover:text-general disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => loadMessages({ showSuccess: true })}
              disabled={messagesLoading}
              title="Обновить сообщения"
            >
              <FontAwesomeIcon
                icon={faRotateRight}
                className={`h-3.5 w-3.5 ${messagesLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-72 space-y-2 overflow-y-auto rounded border border-gray-200 bg-white p-2">
        {messagesLoading ? (
          <div className="text-sm text-gray-500">Загрузка сообщений...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500">Сообщений пока нет.</div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message._id} message={message} />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          className="min-h-20 w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-general"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={replyPlaceholder}
          maxLength={4000}
        />
        <button
          type="button"
          className="action-icon-button action-icon-button--success flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 tablet:w-auto tablet:self-end"
          onClick={sendMessage}
          disabled={sending || !selectedId || !text.trim()}
        >
          {sending ? 'Отправка...' : sendButtonText}
        </button>
      </div>
    </div>
  )
}

export default MessengerConversationsPanel
