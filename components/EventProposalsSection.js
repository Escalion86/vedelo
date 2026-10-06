'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import dynamic from 'next/dynamic'
import Notice from '@components/Notice'
import ProposalShareDialog from '@components/ProposalShareDialog'
import { copyProposalText as copyText } from '@helpers/copyProposalText'
import LoadingSpinner from '@components/LoadingSpinner'
import useSnackbar from '@helpers/useSnackbar'
import {
  useEventProposalsQuery,
  cacheEventProposal,
} from '@helpers/useEventProposalsQuery'
import Section from '@components/CompactEventSection'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import AppButton from '@components/AppButton'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { queryKeys } from '@helpers/queryKeys'
import ProposalLineDialog from '@components/ProposalLineDialog'
import ProposalPackagesEditor from '@components/ProposalPackagesEditor'
import ProposalAppearanceEditor from '@components/ProposalAppearanceEditor'
import { normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { useServicesQuery } from '@helpers/useEntityQueries'
import { isProposalSelectionApplied } from '@helpers/proposalWorkflow'
import { sendFile } from '@helpers/cloudinary'
import { renderProposalVariables } from '@helpers/proposalContent'
import {
  getProposalBlockContentHtml,
  PROPOSAL_RICH_TEXT_BLOCK_TYPES,
  renderProposalRichTextVariables,
} from '@helpers/proposalRichText'
import { useQueryClient } from '@tanstack/react-query'

const ProposalRichTextEditor = dynamic(
  () => import('@components/ProposalRichTextEditor'),
  { ssr: false }
)
const ProposalPageView = dynamic(() => import('@components/ProposalPageView'), {
  ssr: false,
})

const dateInput = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 86400000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const WITHOUT_TEMPLATE = '__without_template__'

const ProposalTemplatePicker = ({
  templates,
  onSelect,
  closeModal,
  setOnConfirmFunc,
}) => {
  const [templateId, setTemplateId] = useState(templates[0]?._id || '')

  useEffect(() => {
    setOnConfirmFunc(async () => {
      closeModal()
      await onSelect(templateId === WITHOUT_TEMPLATE ? '' : templateId)
    })
  }, [closeModal, onSelect, setOnConfirmFunc, templateId])

  return (
    <ComboBox
      label="Шаблон предложения"
      value={templateId}
      onChange={setTemplateId}
      items={[
        ...templates.map((item) => ({ name: item.name, value: item._id })),
        { name: 'Без шаблона', value: WITHOUT_TEMPLATE },
      ]}
      noMargin
      fullWidth
    />
  )
}

const EventProposalsSection = ({
  eventId,
  onApplied,
  initialProposal,
  closeModal,
  setOnShowOnCloseConfirmDialog,
  setOnConfirmFunc,
  setConfirmButtonName,
  setDisableConfirm,
}) => {
  const snackbar = useSnackbar()
  const mediaInput = useRef(null)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const queryClient = useQueryClient()
  const {
    data: services = [],
    isError: servicesError,
    isPending: servicesLoading,
  } = useServicesQuery()
  const [templates, setTemplates] = useState([])
  const {
    data: items = [],
    error: proposalsError,
    isFetching: proposalsFetching,
  } = useEventProposalsQuery(eventId, {
    enabled: !initialProposal,
  })
  const [editing, setEditing] = useState(() =>
    initialProposal
      ? {
          ...initialProposal,
          validUntil: dateInput(initialProposal.validUntil),
        }
      : null
  )
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(
      initialProposal
        ? {
            ...initialProposal,
            validUntil: dateInput(initialProposal.validUntil),
          }
        : null
    )
  )
  useEffect(() => {
    setOnShowOnCloseConfirmDialog?.(JSON.stringify(editing) !== savedSnapshot)
  }, [editing, savedSnapshot, setOnShowOnCloseConfirmDialog])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(() => !initialProposal)
  const listLoading = !initialProposal && (loading || proposalsFetching)
  const [message, setMessage] = useState(null)
  const reportMessage = useCallback(
    (next) => {
      if (next?.tone === 'success') {
        setMessage(null)
        snackbar.success(next.text)
      } else {
        setMessage(next)
      }
    },
    [snackbar]
  )
  const [unavailable, setUnavailable] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const load = useCallback(async () => {
    if (initialProposal)
      return queryClient.invalidateQueries({
        queryKey: queryKeys.eventProposals(eventId),
      })
    if (!eventId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [templatesResponse] = await Promise.all([
        fetch('/api/proposal-templates', { cache: 'no-store' }),
        queryClient.invalidateQueries({ queryKey: queryKeys.proposalStatuses }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.eventProposals(eventId),
        }),
      ])
      const templatesBody = await templatesResponse.json().catch(() => ({}))
      if (templatesResponse.status === 403) {
        setUnavailable(true)
        return
      }
      if (!templatesResponse.ok)
        throw new Error(
          templatesBody?.error?.message || 'Не удалось загрузить шаблоны'
        )
      const activeTemplates = (templatesBody.data || []).filter(
        (item) => item.status === 'active'
      )
      setTemplates(activeTemplates)
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [eventId, initialProposal, queryClient, reportMessage])

  useEffect(() => {
    // Загрузка с сервера выставляет loading перед первым await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialProposal) load()
  }, [load, initialProposal])

  const openEditor = (proposal) => {
    modalsFunc.add({
      title: 'Редактор коммерческого предложения',
      declineButtonBgClassName: 'bg-general',
      closeButtonName: 'Закрыть',
      declineButtonName: 'Закрыть',
      Children: EventProposalsSection,
      childrenProps: { eventId, initialProposal: proposal },
    })
  }

  const create = async (sourceProposalId = '', templateId = '') => {
    setBusy(true)
    try {
      const response = await fetch(`/api/events/${eventId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sourceProposalId ? { sourceProposalId } : { templateId }
        ),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.success === false)
        throw new Error(
          body?.error?.message || 'Не удалось создать предложение'
        )
      await cacheEventProposal(queryClient, eventId, body.data)
      openEditor(body.data)
      await load()
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const startCreate = () => {
    if (templates.length === 0) {
      create()
      return
    }
    modalsFunc.add({
      title: 'Выбор шаблона предложения',
      confirmButtonName: 'Создать',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      Children: ProposalTemplatePicker,
      childrenProps: {
        templates,
        onSelect: (templateId) => create('', templateId),
      },
    })
  }

  const saveDraft = useCallback(
    async (notify = true) => {
      setBusy(true)
      try {
        const response = await fetch(`/api/proposals/${editing._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editing.title,
            validUntil: editing.validUntil,
            messageText: editing.messageText,
            blocks: editing.blocksSnapshot,
            packages: editing.packages,
            media: editing.mediaSnapshot,
            appearance: normalizeProposalAppearance(editing.appearance),
          }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body?.success === false)
          throw new Error(body?.error?.message || 'Не удалось сохранить')
        await cacheEventProposal(queryClient, eventId, body.data)
        setEditing({
          ...body.data,
          validUntil: dateInput(body.data.validUntil),
        })
        setSavedSnapshot(
          JSON.stringify({
            ...body.data,
            validUntil: dateInput(body.data.validUntil),
          })
        )
        if (notify)
          reportMessage({ tone: 'success', text: 'Черновик сохранён' })
        await load()
        return body.data
      } catch (error) {
        reportMessage({ tone: 'error', text: error.message })
        return null
      } finally {
        setBusy(false)
      }
    },
    [editing, eventId, queryClient, reportMessage, load]
  )

  const isDirty = Boolean(editing) && JSON.stringify(editing) !== savedSnapshot
  useEffect(() => {
    if (!initialProposal) return
    setConfirmButtonName?.('Сохранить')
    setDisableConfirm?.(busy)
    setOnConfirmFunc?.(isDirty ? () => saveDraft() : undefined)
  }, [
    initialProposal,
    isDirty,
    busy,
    saveDraft,
    setConfirmButtonName,
    setDisableConfirm,
    setOnConfirmFunc,
  ])

  const action = async (proposal, name) => {
    if (busy || (name === 'revoke' && proposal.selectedPackageId)) return
    if (
      name === 'apply' &&
      !window.confirm(
        'Применить выбранный вариант? Сумма и услуги заказа будут заменены; полный состав КП сохранится для документов. Договор и счёт автоматически не создаются.'
      )
    )
      return
    setBusy(true)
    try {
      const response = await fetch(`/api/proposals/${proposal._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: name }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.success === false)
        throw new Error(body?.error?.message || 'Действие не выполнено')
      await cacheEventProposal(queryClient, eventId, body.data)
      if (name === 'apply') {
        if (body.event && typeof onApplied === 'function') {
          onApplied({
            contractSum: body.event.contractSum,
            servicesIds: body.event.servicesIds || [],
            agreedProposal: body.event.agreedProposal,
          })
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
          queryClient.invalidateQueries({ queryKey: ['events'] }),
        ])
      }
      reportMessage({
        tone: 'success',
        text:
          name === 'publish'
            ? 'Предложение опубликовано'
            : name === 'revoke'
              ? 'Ссылка отозвана'
              : 'Выбранный вариант применён к заявке',
      })
      await load()
      if (name === 'publish') closeModal?.()
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const deleteProposal = (proposal) => {
    modalsFunc.add({
      title: 'Удалить предложение?',
      text: `Вы уверены, что хотите удалить предложение «${proposal.title}», версия ${proposal.version}?${proposal.selectedPackageId ? ' Клиент уже выбрал вариант в этом предложении.' : ''} Ссылка перестанет работать. Восстановить предложение будет нельзя.${proposal.appliedAt ? ' Ранее применённые услуги и сумма заказа сохранятся.' : ''}`,
      confirmButtonName: 'Удалить',
      closeButtonName: 'Отмена',
      declineButtonName: 'Отмена',
      waitForConfirm: true,
      onConfirm: async () => {
        setBusy(true)
        try {
          const response = await fetch(`/api/proposals/${proposal._id}`, {
            method: 'DELETE',
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok || body?.success === false)
            throw new Error(
              body?.error?.message || 'Не удалось удалить предложение'
            )
          await queryClient.cancelQueries({
            queryKey: queryKeys.eventProposals(eventId),
          })
          queryClient.setQueryData(
            queryKeys.eventProposals(eventId),
            (current = []) =>
              current.filter((item) => item._id !== proposal._id)
          )
          void queryClient.invalidateQueries({
            queryKey: queryKeys.proposalStatuses,
          })
          reportMessage({
            tone: 'success',
            text:
              proposal.status === 'draft'
                ? 'Черновик предложения удалён'
                : 'Предложение удалено',
          })
          return true
        } catch (error) {
          reportMessage({ tone: 'error', text: error.message })
          // Close the confirmation so the error in the proposal list is visible.
          return true
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const loadDetails = async (proposal) => {
    const response = await fetch(`/api/proposals/${proposal._id}`, {
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.success === false)
      return reportMessage({
        tone: 'error',
        text: body?.error?.message || 'Не удалось открыть предложение',
      })
    if (proposal.status === 'draft') openEditor(body.data)
    return body.data
  }

  const shareProposal = async (proposal) => {
    if (busy) return
    setBusy(true)
    try {
      const data = await loadDetails(proposal)
      if (!data?.renderedMessage) return
      let initiallyCopied = false
      try {
        await copyText(data.renderedMessage)
        initiallyCopied = true
      } catch {
        // Keep the message available for manual copying in the dialog.
      }
      modalsFunc.add({
        title: 'Отправить предложение',
        closeButtonName: 'Закрыть',
        Children: ProposalShareDialog,
        childrenProps: {
          clientId: data.clientId,
          message: data.renderedMessage,
          initiallyCopied,
        },
      })
    } catch {
      reportMessage({
        tone: 'error',
        text: 'Не удалось подготовить предложение для отправки',
      })
    } finally {
      setBusy(false)
    }
  }


  const updateBlock = (blockIndex, patch) =>
    setEditing((current) => ({
      ...current,
      blocksSnapshot: current.blocksSnapshot.map((block, index) =>
        index === blockIndex ? { ...block, ...patch } : block
      ),
    }))

  const uploadLogo = async (file) => {
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      reportMessage({
        tone: 'error',
        text: 'Выберите PNG, JPG или WebP до 5 МБ',
      })
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`/api/proposals/${editing._id}/logo`, {
        method: 'POST',
        body: form,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.data?.url)
        throw new Error(body?.error?.message || 'Не удалось загрузить логотип')
      setEditing((current) => ({
        ...current,
        appearance: {
          ...normalizeProposalAppearance(current.appearance),
          logoUrl: body.data.url,
        },
      }))
      setMessage(null)
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const uploadProposalMedia = async (file) => {
    if (!file || !editing) return
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(
      file.type
    )
    const isVideo = file.type === 'video/mp4'
    const limit = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if ((!isImage && !isVideo) || file.size > limit) {
      reportMessage({
        tone: 'error',
        text: 'Разрешены JPG, PNG, WebP до 10 МБ и MP4 до 50 МБ',
      })
      return
    }
    if ((editing.mediaSnapshot || []).length >= 10) {
      reportMessage({
        tone: 'error',
        text: 'Можно добавить не больше 10 медиа',
      })
      return
    }
    setBusy(true)
    const result = await sendFile(file, null, `proposals/${editing._id}`)
    const uploaded = Array.isArray(result) ? result[0] : result
    const rawUrl = uploaded?.url || uploaded?.fileUrl || ''
    const path = uploaded?.path || uploaded?.filePath || ''
    const url =
      rawUrl ||
      (path
        ? `https://cloud.escalion.ru/uploads/${String(path).replace(/^\/+/, '')}`
        : '')
    if (url) {
      setEditing((current) => ({
        ...current,
        mediaSnapshot: [
          ...(current.mediaSnapshot || []),
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
    } else {
      reportMessage({ tone: 'error', text: 'Не удалось загрузить файл' })
    }
    setBusy(false)
  }

  if (unavailable)
    return (
      <Notice tone="warning">
        Коммерческие предложения недоступны на текущем тарифе.
      </Notice>
    )

  if (editing) {
    const previewVariables = {
      proposal: { url: 'https://vedelo.ru/proposal/…' },
      client: editing.clientSnapshot || {},
      event: editing.eventSnapshot || {},
      artist: editing.artistSnapshot || {},
    }
    const unresolved = new Set()
    const previewMessage = renderProposalVariables(
      editing.messageText || '',
      previewVariables
    )
    previewMessage.unknown.forEach((key) => unresolved.add(key))
    editing.blocksSnapshot
      .filter((block) => block.enabled !== false)
      .forEach((block) => {
        renderProposalVariables(
          `${block.title || ''}\n${block.text || ''}`,
          previewVariables
        ).unknown.forEach((key) => unresolved.add(key))
        renderProposalRichTextVariables(
          getProposalBlockContentHtml(block),
          previewVariables
        ).unknown.forEach((key) => unresolved.add(key))
      })
    const previewBlocks = editing.blocksSnapshot.map((block) => ({
      ...block,
      title: renderProposalVariables(block.title || '', previewVariables).text,
      contentHtml: renderProposalRichTextVariables(
        getProposalBlockContentHtml(block),
        previewVariables
      ).html,
    }))
    return (
      <div
        className="proposal-editor space-y-3"
        role="region"
        aria-label="Редактор КП"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Черновик версии {editing.version}</div>
        </div>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Input
          inputClassName="min-w-0"
          label="Название предложения"
          noMargin
          fullWidth
          value={editing.title || ''}
          onChange={(title) => setEditing({ ...editing, title })}
        />
        <Input
          inputClassName="min-w-0"
          label="Действует до"
          type="date"
          noMargin
          fullWidth
          value={editing.validUntil || ''}
          onChange={(validUntil) => setEditing({ ...editing, validUntil })}
        />
        <ProposalAppearanceEditor
          value={editing.appearance}
          onChange={(appearance) =>
            setEditing((current) => ({ ...current, appearance }))
          }
          onUpload={uploadLogo}
          busy={busy}
        />
        {unresolved.size ? (
          <Notice tone="warning">
            Заполните переменные перед публикацией: {[...unresolved].join(', ')}
          </Notice>
        ) : null}
        <div>
          <h3 className="font-semibold">Что предлагаем клиенту</h3>
        </div>
        <ProposalPackagesEditor
          packages={editing.packages}
          onChange={(packages) =>
            setEditing((current) => ({ ...current, packages }))
          }
          services={services}
          servicesLoading={servicesLoading}
          servicesError={servicesError}
          busy={busy}
          initiallyOpenIds={(initialProposal?.packages || []).map(
            (candidate) => candidate.id
          )}
        />
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer font-semibold">
            Тексты страницы
          </summary>
          <div className="mt-3 space-y-3">
            {editing.blocksSnapshot.map((block, blockIndex) => (
              <div key={block.id || block.type} className="rounded border p-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={block.enabled !== false}
                    onChange={(event) =>
                      updateBlock(blockIndex, { enabled: event.target.checked })
                    }
                  />
                  {{
                    cover: 'Обложка',
                    intro: 'Вступление',
                    packages: 'Варианты и цены',
                    media: 'Фото и видео',
                    benefits: 'Преимущества',
                    terms: 'Условия',
                    contacts: 'Контакты',
                  }[block.type] || block.type}
                </label>
                <Input
                  inputClassName="min-w-0"
                  label="Заголовок блока"
                  fullWidth
                  value={block.title || ''}
                  onChange={(title) => updateBlock(blockIndex, { title })}
                />
                {PROPOSAL_RICH_TEXT_BLOCK_TYPES.includes(block.type) ? (
                  <div className="mt-2">
                    <ProposalRichTextEditor
                      value={getProposalBlockContentHtml(block)}
                      onChange={(contentHtml) =>
                        updateBlock(blockIndex, { contentHtml })
                      }
                      placeholder="Введите текст блока…"
                      directory={`proposals/${editing._id || 'draft'}`}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </details>
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer font-semibold">
            Сообщение для чата
          </summary>
          <Textarea
            label="Текст сообщения"
            help="Текст для отправки предложения в Telegram. Проверьте его перед отправкой клиенту."
            rows={3}
            value={editing.messageText || ''}
            onChange={(messageText) => setEditing({ ...editing, messageText })}
          />
        </details>
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer font-semibold">
            Фото и видео ({editing.mediaSnapshot?.length || 0}/10)
          </summary>
          <div className="mt-2 space-y-2">
            {(editing.mediaSnapshot || []).map((item, index) => (
              <div
                key={item.id || item.url}
                className="flex items-center justify-between gap-2 rounded border p-2 text-xs"
              >
                <span className="min-w-0 truncate">
                  {item.title || item.url}
                </span>
                <IconActionButton
                  icon={faTrashAlt}
                  title="Удалить"
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setEditing((current) => ({
                      ...current,
                      mediaSnapshot: current.mediaSnapshot.filter(
                        (_, mediaIndex) => mediaIndex !== index
                      ),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="tablet:flex-row mt-3 flex flex-col gap-2">
            <AppButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => mediaInput.current?.click()}
            >
              Загрузить фото или видео
            </AppButton>
            <input
              ref={mediaInput}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              disabled={busy}
              onChange={(event) => {
                uploadProposalMedia(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <AddIconButton
              title="Добавить видео-ссылку"
              label="Добавить видео-ссылку"
              size="sm"
              className="ml-auto self-end px-3"
              onClick={() => {
                const url = window.prompt(
                  'Ссылка на VK Video, Rutube или YouTube'
                )
                if (url)
                  setEditing((current) => ({
                    ...current,
                    mediaSnapshot: [
                      ...(current.mediaSnapshot || []),
                      {
                        id: crypto.randomUUID(),
                        kind: 'video_link',
                        url,
                        title: 'Видео',
                      },
                    ].slice(0, 10),
                  }))
              }}
            />
          </div>
        </details>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowPreview((current) => !current)}
        >
          {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр для клиента'}
        </AppButton>
        {showPreview ? (
          <ProposalPageView
            preview
            proposal={{
              ...editing,
              blocks: previewBlocks,
              media: editing.mediaSnapshot || [],
              client: editing.clientSnapshot,
              artist: editing.artistSnapshot,
            }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3" aria-busy={Boolean(listLoading)}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {proposalsError ? (
        <Notice tone="error">Не удалось загрузить предложения</Notice>
      ) : null}
      <div className="flex justify-end">
        <AddIconButton
          title="Создать предложение"
          label="Создать предложение"
          size="base"
          disabled={busy || listLoading}
          className="self-end px-3 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={startCreate}
        />
      </div>
      {listLoading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-2 text-sm text-gray-600"
        >
          <div aria-hidden="true" className="shrink-0">
            <LoadingSpinner size="xxs" heightClassName="h-auto" />
          </div>
          <span>
            {items.length
              ? 'Обновляем коммерческие предложения…'
              : 'Загружаем коммерческие предложения…'}
          </span>
        </div>
      ) : null}
      {items.length ? (
        <div className="space-y-2">
          {items.map((proposal) => {
            return (
              <div
                key={proposal._id}
                className="proposal-list-item rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <div className="font-semibold">{proposal.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Версия {proposal.version} ·{' '}
                      {proposal.status === 'draft'
                        ? 'черновик'
                        : proposal.status === 'published'
                          ? 'опубликовано'
                          : proposal.status === 'expired'
                            ? 'срок истёк'
                            : 'отозвано'}
                      {proposal.selectedPackageId
                        ? ' · клиент выбрал вариант'
                        : ''}
                      {proposal.appliedAt &&
                      !isProposalSelectionApplied(proposal)
                        ? ' · выбор изменён после применения'
                        : ''}
                      {isProposalSelectionApplied(proposal)
                        ? ' · применено к заказу'
                        : ''}
                      {proposal.sentAt ? ' · отправлено' : ''}
                      {proposal.viewedAt ? ' · ссылка открывалась' : ''}
                    </div>
                    {proposal.selectedPackageId ? (
                      <div className="text-sm font-semibold text-emerald-700">
                        {
                          proposal.packages.find(
                            (item) => item.id === proposal.selectedPackageId
                          )?.title
                        }
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <IconActionButton
                      icon={faPencilAlt}
                      variant="warning"
                      size="sm"
                      title={
                        proposal.status === 'draft'
                          ? 'Редактировать'
                          : 'Редактировать в новой версии'
                      }
                      disabled={busy}
                      onClick={() =>
                        proposal.status === 'draft'
                          ? loadDetails(proposal)
                          : create(proposal._id)
                      }
                    />
                    <IconActionButton
                      icon={faTrashAlt}
                      variant="danger"
                      size="sm"
                      title="Удалить предложение"
                      disabled={busy}
                      className="disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => deleteProposal(proposal)}
                    />
                  </div>
                </div>
                {proposal.status === 'draft' ? (
                  <div className="mt-3 flex justify-end">
                    <AppButton
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => action(proposal, 'publish')}
                    >
                      Опубликовать
                    </AppButton>
                  </div>
                ) : null}
                {proposal.status !== 'draft' ? (
                  <div className="tablet:grid-cols-3 mt-3 grid grid-cols-2 gap-2">
                    <AppButton
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const data = await loadDetails(proposal)
                        if (data?.publicUrl)
                          window.open(
                            data.publicUrl,
                            '_blank',
                            'noopener,noreferrer'
                          )
                      }}
                    >
                      Открыть
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const data = await loadDetails(proposal)
                        if (data?.renderedMessage) {
                          await copyText(data.renderedMessage)
                          reportMessage({
                            tone: 'success',
                            text: 'Сообщение и ссылка скопированы',
                          })
                        }
                      }}
                    >
                      Копировать
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => shareProposal(proposal)}
                    >
                      Отправить
                    </AppButton>
                    {proposal.selectedPackageId &&
                    !isProposalSelectionApplied(proposal) ? (
                      <AppButton
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => action(proposal, 'apply')}
                      >
                        Применить
                      </AppButton>
                    ) : null}
                    {proposal.status === 'published' ? (
                      <AppButton
                        variant="danger"
                        size="sm"
                        disabled={busy || Boolean(proposal.selectedPackageId)}
                        title={
                          proposal.selectedPackageId
                            ? 'Принятое клиентом предложение нельзя отозвать'
                            : 'Закрыть доступ по ссылке'
                        }
                        onClick={() => action(proposal, 'revoke')}
                      >
                        Отозвать
                      </AppButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default EventProposalsSection
