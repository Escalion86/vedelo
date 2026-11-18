'use client'

import { useEffect, useRef, useState } from 'react'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons/faTrashAlt'
import AppButton from '@components/AppButton'
import IconActionButton from '@components/IconActionButton'
import Input from '@components/Input'
import Notice from '@components/Notice'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import useSnackbar from '@helpers/useSnackbar'
import { telegramQuestionnaireMediaKey } from '@helpers/telegramQuestionnaireBlocks.mjs'
import {
  TelegramQuestionnairePreview,
  TelegramQuestionnaireScenario,
  getScenarioEditorError,
} from './TelegramQuestionnaireScenario'
import {
  TelegramQuestionnaireTestChats,
  telegramQuestionnaireTestEndpoint,
  useTelegramQuestionnaireTestData,
} from './TelegramQuestionnaireTestChats'

const endpoint = '/api/integrations/telegram/questionnaire'
const maxMedia = 6
const maxText = 500
const maxUrl = 2048

const modes = [
  { value: 'off', label: 'Выключен' },
  { value: 'test', label: 'Тестовые чаты' },
  { value: 'live', label: 'В работе' },
]

const mediaTypes = [
  { value: 'photo', label: 'Фото' },
  { value: 'video', label: 'Видео' },
]

const mediaFormats = {
  photo: { accept: 'image/jpeg,image/png,.jpg,.jpeg,.png', limit: 5 },
  video: { accept: 'video/mp4,.mp4', limit: 20 },
}

const readResponse = async (response, errorMessage) => {
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.questionnaire) {
    throw new Error(result?.error?.message || errorMessage)
  }
  return result
}

const parseHttpsUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= maxUrl
      ? url.href
      : ''
  } catch {
    return ''
  }
}

const SettingCheck = ({ checked, onChange, disabled, children }) => (
  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed">
    <input
      type="checkbox"
      className="h-5 w-5 shrink-0 cursor-pointer accent-general focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    {children}
  </label>
)

const MediaPicker = ({ items, onUpload, onAddLink, onRemove, busy, uploading }) => {
  const photoInput = useRef(null)
  const videoInput = useRef(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkType, setLinkType] = useState('photo')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const atLimit = items.length >= maxMedia

  const selectFile = (type) => (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) onUpload(type, file)
  }

  const addLink = () => {
    const url = parseHttpsUrl(linkUrl.trim())
    if (!url) {
      setLinkError('Укажите прямую HTTPS-ссылку на файл.')
      return
    }
    if (items.some((item) => item.url === url)) {
      setLinkError('Этот файл уже добавлен.')
      return
    }
    onAddLink({ type: linkType, url })
    setLinkUrl('')
    setLinkError('')
    setLinkOpen(false)
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Файлы сценария</legend>
      <p className="text-xs leading-5 text-gray-600">
        Выберите загруженные файлы в блоке «Сообщение или медиа».
        До {maxMedia} файлов. Фото JPG или PNG до 5 МБ, видео MP4 до 20 МБ.
      </p>
      <p className="text-xs leading-5 text-gray-600">
        Файлы с устройства добавляются сразу. Чтобы применить удаление и новые ссылки, сохраните настройки.
      </p>
      {items.length ? (
        <ul className="flex min-w-0 flex-col gap-2">
          {items.map((item, index) => {
            const title = item.name || item.url
            const kind = item.type === 'video' ? 'Видео' : 'Фото'
            return (
              <li
                key={telegramQuestionnaireMediaKey(item)}
                className="flex min-w-0 items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1"
              >
                <div className="min-w-0 text-xs">
                  <span className="block font-medium">{kind}</span>
                  <span className="block break-all text-gray-600">{title}</span>
                </div>
                <IconActionButton
                  icon={faTrashAlt}
                  title={`Убрать из отправки ${kind.toLowerCase()} ${index + 1}`}
                  variant="danger"
                  disabled={busy}
                  onClick={() => onRemove(index)}
                />
              </li>
            )
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          ref={photoInput}
          className="hidden"
          accept={mediaFormats.photo.accept}
          onChange={selectFile('photo')}
          disabled={busy || atLimit}
        />
        <input
          type="file"
          ref={videoInput}
          className="hidden"
          accept={mediaFormats.video.accept}
          onChange={selectFile('video')}
          disabled={busy || atLimit}
        />
        <AppButton variant="secondary" size="sm" disabled={busy || atLimit} onClick={() => photoInput.current.click()}>
          Загрузить фото
        </AppButton>
        <AppButton variant="secondary" size="sm" disabled={busy || atLimit} onClick={() => videoInput.current.click()}>
          Загрузить видео
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          disabled={busy || atLimit}
          onClick={() => setLinkOpen((value) => !value)}
          aria-expanded={linkOpen}
        >
          {linkOpen ? 'Закрыть добавление ссылки' : 'Добавить по ссылке'}
        </AppButton>
      </div>
      {uploading ? <p className="text-sm" role="status">Загружаем файл…</p> : null}
      {linkOpen && !atLimit ? (
        <div className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-3">
          <Select label="Тип файла" aria-label="Тип файла" value={linkType} options={mediaTypes} onChange={setLinkType} disabled={busy} noMargin />
          <Input
            label="Прямая HTTPS-ссылка на файл"
            ariaLabel="Прямая HTTPS-ссылка на файл"
            type="url"
            value={linkUrl}
            maxLength={maxUrl}
            error={Boolean(linkError)}
            disabled={busy}
            onChange={(value) => {
              setLinkUrl(value)
              setLinkError('')
            }}
            noMargin
            fullWidth
          />
          {linkError ? <p role="alert" className="text-xs text-danger">{linkError}</p> : null}
          <AppButton className="self-start" variant="secondary" size="sm" disabled={busy || !linkUrl.trim()} onClick={addLink}>
            Добавить ссылку
          </AppButton>
        </div>
      ) : null}
    </fieldset>
  )
}

const TelegramQuestionnaireSettings = ({ connected, disabled }) => {
  const snackbar = useSnackbar()
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [validationError, setValidationError] = useState(null)
  const [openBlockId, setOpenBlockId] = useState(null)
  const [preview, setPreview] = useState(false)
  const [search, setSearch] = useState('')
  const [operation, setOperation] = useState('')
  const operationRef = useRef(false)
  const needsServices = draft?.blocks.some(({ id, type }) => id === openBlockId && type === 'services') === true
  const testData = useTelegramQuestionnaireTestData(draft?.mode === 'test' || needsServices, search)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const canStartTest = connected && !dirty && saved?.mode === 'test'

  useEffect(() => {
    const controller = new AbortController()
    const failMessage = 'Не удалось загрузить настройки автоответчика.'
    fetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then((response) => readResponse(response, failMessage))
      .then(({ questionnaire }) => {
        if (controller.signal.aborted) return
        setDraft(questionnaire)
        setSaved(questionnaire)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message || failMessage)
      })
    return () => controller.abort()
  }, [loadAttempt])

  const busy = disabled || Boolean(operation)

  const setField = (name, value) => setDraft((current) => ({ ...current, [name]: value }))

  const addMedia = (item) => setDraft((current) => ({ ...current, media: [...current.media, item] }))
  const removeMedia = (index) => setDraft((current) => {
    const key = telegramQuestionnaireMediaKey(current.media[index])
    return {
      ...current,
      media: current.media.filter((_, itemIndex) => itemIndex !== index),
      blocks: current.blocks.map((block) => block.mediaIds?.includes(key)
        ? { ...block, mediaIds: block.mediaIds.filter((id) => id !== key) }
        : block),
    }
  })

  const runOperation = async (kind, action, failMessage) => {
    if (busy || operationRef.current) return
    operationRef.current = true
    setOperation(kind)
    try {
      await action()
    } catch (error) {
      snackbar.error(error.message || failMessage)
    } finally {
      operationRef.current = false
      setOperation('')
    }
  }

  const upload = async (type, file) => {
    const { limit } = mediaFormats[type]
    if (file.size > limit * 1024 * 1024) {
      snackbar.error(`Выберите файл размером до ${limit} МБ.`)
      return
    }
    const failMessage = 'Не удалось загрузить файл.'
    await runOperation('upload', async () => {
      const body = new FormData()
      body.append('file', file)
      body.append('type', type)
      body.append('revision', String(draft.revision))
      const response = await fetch(`${endpoint}/media`, { method: 'POST', body })
      const { attachment, questionnaire } = await readResponse(response, failMessage)
      if (!attachment?.id) throw new Error(failMessage)
      setSaved(questionnaire)
      setDraft((current) => ({
        ...current,
        revision: questionnaire.revision,
        media: [...current.media, attachment],
      }))
      snackbar.success('Файл загружен')
    }, failMessage)
  }

  const save = async (event) => {
    event.preventDefault()
    if (draft.mode === 'test' && !draft.testChatIds.length) {
      setValidationError({ text: 'Выберите хотя бы один тестовый чат.' })
      return
    }
    if (draft.mode !== 'off' && !draft.blocks.some(({ type }) => type !== 'message')) {
      setValidationError({ text: 'Добавьте хотя бы один вопрос.' })
      return
    }
    const invalid = getScenarioEditorError(draft.blocks)
    setValidationError(invalid)
    if (invalid) {
      setOpenBlockId(invalid.id)
      requestAnimationFrame(() => document.getElementById(`telegram-block-${invalid.id}`)?.querySelector('textarea, input')?.focus())
      return
    }
    const failMessage = 'Не удалось сохранить настройки автоответчика.'
    await runOperation('save', async () => {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const { questionnaire } = await readResponse(response, failMessage)
      setDraft(questionnaire)
      setSaved(questionnaire)
      snackbar.success('Настройки автоответчика сохранены')
    }, failMessage)
  }

  const startTest = async (chatId, createDraft) => {
    if (!canStartTest || !saved.testChatIds.includes(chatId)) return
    const failMessage = 'Не удалось запустить тест в этом чате.'
    await runOperation('test', async () => {
      const response = await fetch(telegramQuestionnaireTestEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, createDraft }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.run) throw new Error(result?.error?.message || failMessage)
      testData.refresh()
      snackbar.success('Тест готов. Попросите участника написать «Начать тест»')
    }, failMessage)
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded border border-gray-200 p-3" aria-label="Автоответчик Telegram">
      <h3 className="text-sm font-semibold">Автоответчик</h3>
      {loadError ? (
        <div className="flex flex-col items-start gap-2">
          <Notice tone="error" role="alert">{loadError}</Notice>
          <AppButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoadError('')
              setLoadAttempt((attempt) => attempt + 1)
            }}
          >
            Повторить загрузку
          </AppButton>
        </div>
      ) : !draft ? (
        <p className="text-sm" role="status">Загружаем настройки…</p>
      ) : (
        <form className="flex min-w-0 flex-col gap-4" aria-busy={Boolean(operation)} onSubmit={save} noValidate>
          <div className="flex flex-col gap-2">
            <Select
              label="Режим автоответчика"
              aria-label="Режим автоответчика"
              value={draft.mode}
              options={connected ? modes : modes.filter(({ value }) => value === 'off' || value === saved.mode)}
              onChange={(mode) => setField('mode', mode)}
              disabled={busy}
              noMargin
              fullWidth
            />
            <p className="text-xs leading-5 text-gray-600">
              В рабочем режиме бот начинает опрос в новых личных чатах, к которым у него есть доступ в Telegram.
            </p>
            {!connected ? <Notice tone="info">Чтобы включить автоответчик, подключите бота в Telegram Business.</Notice> : null}
            <SettingCheck checked={draft.useTelegramGreeting} disabled={busy} onChange={(value) => setField('useTelegramGreeting', value)}>
              Приветствие уже настроено в Telegram
            </SettingCheck>
            {draft.useTelegramGreeting ? (
              <p className="text-xs leading-5 text-gray-600">Бот добавит отдельное сообщение «Чем могу помочь?» с кнопками.</p>
            ) : (
              <Textarea
                label="Текст приветствия бота"
                ariaLabel="Текст приветствия бота"
                value={draft.welcomeText}
                onChange={(value) => setField('welcomeText', value)}
                help="Оставьте поле пустым, чтобы бот написал «Здравствуйте! Чем могу помочь?»."
                maxLength={maxText}
                rows={2}
                disabled={busy}
                noMargin
                fullWidth
              />
            )}
          </div>

          <TelegramQuestionnaireScenario
            blocks={draft.blocks}
            services={testData.services}
            media={draft.media}
            openId={openBlockId}
            validationError={validationError}
            disabled={busy}
            onOpen={setOpenBlockId}
            onChange={(blocks) => {
              setField('blocks', blocks)
              if (validationError) setValidationError(getScenarioEditorError(blocks))
            }}
          />
          {needsServices && testData.error ? (
            <Notice tone="error" role="alert">
              {testData.error}
              <AppButton className="ml-2" size="sm" variant="secondary" onClick={testData.refresh}>Повторить</AppButton>
            </Notice>
          ) : null}

          <MediaPicker
            items={draft.media}
            busy={busy}
            uploading={operation === 'upload'}
            onUpload={upload}
            onAddLink={addMedia}
            onRemove={removeMedia}
          />

          {draft.mode === 'test' ? (
            <TelegramQuestionnaireTestChats
              selectedIds={draft.testChatIds}
              data={testData}
              search={search}
              onSearch={setSearch}
              onSelect={(ids) => {
                setField('testChatIds', ids)
                if (validationError && !validationError.id) setValidationError(null)
              }}
              onStart={startTest}
              busy={busy}
              canStart={canStartTest}
            />
          ) : null}
          {validationError && !validationError.id ? <Notice tone="error" role="alert">{validationError.text}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <AppButton type="submit" disabled={busy} aria-busy={operation === 'save'}>
              {operation === 'save' ? 'Сохраняем…' : 'Сохранить сценарий'}
            </AppButton>
            <AppButton variant="secondary" aria-expanded={preview} onClick={() => setPreview((value) => !value)}>
              {preview ? 'Закрыть предпросмотр' : 'Предпросмотр'}
            </AppButton>
          </div>
          {preview ? <TelegramQuestionnairePreview questionnaire={draft} /> : null}
        </form>
      )}
    </section>
  )
}

export default TelegramQuestionnaireSettings
