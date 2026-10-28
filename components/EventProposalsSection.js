'use client'

import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { pickProposalArtistContacts } from '@helpers/proposalArtistContacts.mjs'
import fieldHelp from '@helpers/fieldHelp.json'
import FieldHelp from '@components/FieldHelp'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import dynamic from 'next/dynamic'
import Notice from '@components/Notice'
import ProposalShareDialog from '@components/ProposalShareDialog'
import { copyProposalText as copyText } from '@helpers/copyProposalText'
import { proposalTemplateFromProposal } from '@helpers/proposalTemplateFromProposal.mjs'
import proposalTemplateFunc from '@layouts/modals/modalsFunc/proposalTemplateFunc'
import LoadingSpinner from '@components/LoadingSpinner'
import useSnackbar from '@helpers/useSnackbar'
import {
  useEventProposalsQuery,
  cacheEventProposal,
} from '@helpers/useEventProposalsQuery'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import AppButton from '@components/AppButton'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons/faExternalLinkAlt'
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons/faPaperPlane'
import { faCopy } from '@fortawesome/free-regular-svg-icons/faCopy'
import { queryKeys } from '@helpers/queryKeys'
import ProposalPackagesEditor from '@components/ProposalPackagesEditor'
import ProposalAppearanceEditor from '@components/ProposalAppearanceEditor'
import { normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { useServicesQuery } from '@helpers/useEntityQueries'
import { isProposalSelectionApplied, isProposalSelectionLocked, isProposalApplicationPending } from '@helpers/proposalWorkflow'
import ProposalMediaEditor from '@components/ProposalMediaEditor'
import {
  renderProposalVariables,
  toProposalEditorBlocks,
  getVisibleProposalBlocks,
} from '@helpers/proposalContent'
import ProposalContentEditor from '@components/ProposalContentEditor'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '@helpers/proposalRichText'
import { useQueryClient } from '@tanstack/react-query'

const ProposalPageView = dynamic(() => import('@components/ProposalPageView'), {
  ssr: false,
})

const dateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
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
  const loggedUser = useAtomValue(loggedUserAtom)
  const snackbar = useSnackbar()
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
          blocksSnapshot: toProposalEditorBlocks(
            initialProposal.blocksSnapshot,
            initialProposal.artistSnapshot
          ),
          validUntil: dateInput(initialProposal.validUntil),
        }
      : null
  )
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(
      initialProposal
        ? {
            ...initialProposal,
            blocksSnapshot: toProposalEditorBlocks(
              initialProposal.blocksSnapshot,
              initialProposal.artistSnapshot
            ),
            validUntil: dateInput(initialProposal.validUntil),
          }
        : null
    )
  )
  useEffect(() => {
    setOnShowOnCloseConfirmDialog?.(JSON.stringify(editing) !== savedSnapshot)
  }, [editing, savedSnapshot, setOnShowOnCloseConfirmDialog])
  const saveInFlight = useRef(false)
  const openInFlight = useRef(false)
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
      if (saveInFlight.current) return null
      saveInFlight.current = true
      setBusy(true)
      try {
        const response = await fetch(`/api/proposals/${editing._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentRevision: editing.contentRevision || 0,
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
        await cacheEventProposal(queryClient, eventId, body.data)
        if (notify)
          reportMessage({ tone: 'success', text: 'Предложение сохранено' })
        await load()
        return body.data
      } catch (error) {
        reportMessage({ tone: 'error', text: error.message })
        return null
      } finally {
        saveInFlight.current = false
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

  const fetchProposalDetails = async (proposal) => {
    const response = await fetch(`/api/proposals/${proposal._id}`, {
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.success === false)
      return reportMessage({
        tone: 'error',
        text: body?.error?.message || 'Не удалось открыть предложение',
      })
    return body.data
  }

  const loadDetails = async (proposal, edit = false) => {
    const data = await fetchProposalDetails(proposal)
    if (data && (edit || proposal.status === 'draft')) openEditor(data)
    return data
  }

  const saveAsTemplate = async (proposal) => {
    if (openInFlight.current || busy) return
    openInFlight.current = true
    setBusy(true)
    try {
      const data = await fetchProposalDetails(proposal)
      if (!data) return
      modalsFunc.add(proposalTemplateFunc(
        proposalTemplateFromProposal(data),
        () => {
          reportMessage({ tone: 'success', text: 'Шаблон сохранён' })
          void load()
        },
        { fromProposal: true }
      ))
    } catch {
      reportMessage({ tone: 'error', text: 'Не удалось подготовить шаблон' })
    } finally {
      openInFlight.current = false
      setBusy(false)
    }
  }

  const editProposal = async (proposal) => {
    if (openInFlight.current || busy) return
    openInFlight.current = true
    setBusy(true)
    try {
      await loadDetails(proposal, true)
    } catch {
      reportMessage({ tone: 'error', text: 'Не удалось открыть предложение' })
    } finally {
      openInFlight.current = false
      setBusy(false)
    }
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
          publicUrl: data.publicUrl,
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

  const copyProposalLink = async (proposal) => {
    if (openInFlight.current || busy) return
    openInFlight.current = true
    setBusy(true)
    try {
      const data = await fetchProposalDetails(proposal)
      if (!data) return
      if (!data.publicUrl) throw new Error('missing_url')
      await copyText(data.publicUrl)
      snackbar.info('Ссылка скопирована')
    } catch {
      snackbar.error('Не удалось скопировать ссылку')
    } finally {
      openInFlight.current = false
      setBusy(false)
    }
  }

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
    getVisibleProposalBlocks(editing.blocksSnapshot).forEach((block) => {
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
          <div className="font-semibold">{editing.status === 'draft' ? 'Черновик' : 'Редактирование предложения'}</div>
        </div>
        {editing.selectedPackageId || isProposalSelectionLocked(editing) ? (
          <Notice tone="info">
            {isProposalSelectionLocked(editing)
              ? 'Условия уже применены к заказу. Можно изменить срок действия, название, оформление, медиа и сообщение.'
              : 'При изменении условий или вариантов прежний выбор клиента будет сброшен. Изменение только срока действия сохраняет выбор.'}
          </Notice>
        ) : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Input
          inputClassName="min-w-0"
          label="Название предложения"
          help={fieldHelp['proposal.title']}
          noMargin
          fullWidth
          value={editing.title || ''}
          onChange={(title) => setEditing({ ...editing, title })}
        />
        <Input
          inputClassName="min-w-0"
          label="Действует до"
          help={fieldHelp['proposal.expiresAt']}
          type="date"
          noMargin
          fullWidth
          value={editing.validUntil || ''}
          onChange={(validUntil) => setEditing({ ...editing, validUntil })}
        />
        {unresolved.size ? (
          <Notice tone="warning">
            Заполните переменные перед публикацией: {[...unresolved].join(', ')}
          </Notice>
        ) : null}
        <ProposalContentEditor
          blocks={editing.blocksSnapshot}
          onChange={(blocksSnapshot) =>
            setEditing((current) => ({ ...current, blocksSnapshot }))
          }
          directory={`proposals/${editing._id || 'draft'}`}
          artist={editing.artistSnapshot}
          appearanceEditor={
            <ProposalAppearanceEditor
              value={editing.appearance}
              onChange={(appearance) =>
                setEditing((current) => ({ ...current, appearance }))
              }
              onUpload={uploadLogo}
              busy={busy}
            />
          }
          mediaEditor={
            <ProposalMediaEditor
              media={editing.mediaSnapshot || []}
              onChange={(mediaSnapshot) => setEditing((current) => ({ ...current, mediaSnapshot }))}
              directory={`proposals/${editing._id || 'draft'}`}
              busy={busy}
              setBusy={setBusy}
              onError={(text) => reportMessage(text ? { tone: 'error', text } : null)}
            />
          }
        >
          <ProposalPackagesEditor
            packages={editing.packages}
            onChange={(packages) =>
              setEditing((current) => ({ ...current, packages }))
            }
            services={services}
            servicesLoading={servicesLoading}
            servicesError={servicesError}
            busy={busy}
          />
        </ProposalContentEditor>
        <details className="rounded-lg border border-gray-200 p-3">
          <summary className="cursor-pointer font-semibold">
            Сообщение для чата
          </summary>
          <Textarea
            label="Текст сообщения"
            help={fieldHelp['proposal.message']}
            rows={3}
            value={editing.messageText || ''}
            onChange={(messageText) => setEditing({ ...editing, messageText })}
          />
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
              socialContacts: loggedUser?._id ? pickProposalArtistContacts(loggedUser) : editing.socialContacts,
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
                      {isProposalApplicationPending(proposal) ? ' · применение ожидает сверки' : ''}
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
                      title="Редактировать"
                      disabled={busy}
                      onClick={() => editProposal(proposal)}
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
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {proposal.status === 'published' ? (
                    <AppButton
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => copyProposalLink(proposal)}
                    >
                      <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" aria-hidden="true" />
                      Копировать ссылку
                    </AppButton>
                  ) : null}
                  <AppButton
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => saveAsTemplate(proposal)}
                  >
                    Сохранить как шаблон
                  </AppButton>
                  {proposal.status === 'draft' ? (
                    <AppButton
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => action(proposal, 'publish')}
                    >
                      Опубликовать
                    </AppButton>
                  ) : null}
                </div>
                {proposal.status !== 'draft' ? (
                  <div className="tablet:grid-cols-3 mt-3 grid grid-cols-2 gap-2">
                    <AppButton
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
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
                      <FontAwesomeIcon
                        icon={faExternalLinkAlt}
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Открыть
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => shareProposal(proposal)}
                    >
                      <FontAwesomeIcon
                        icon={faPaperPlane}
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Отправить
                    </AppButton>
                    {proposal.selectedPackageId &&
                    (!isProposalSelectionLocked(proposal) || isProposalApplicationPending(proposal)) ? (
                      <div className="flex items-center gap-1">
                        <AppButton
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => action(proposal, 'apply')}
                        >
                          {isProposalApplicationPending(proposal) ? 'Завершить / сверить' : 'Применить'}
                        </AppButton>
                        <FieldHelp
                          text={fieldHelp['proposal.apply']}
                          label="Применить"
                        />
                      </div>
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
