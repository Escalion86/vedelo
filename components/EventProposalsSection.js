'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import dynamic from 'next/dynamic'
import Notice from '@components/Notice'
import useSnackbar from '@helpers/useSnackbar'
import Section from '@components/CompactEventSection'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import AppButton from '@components/AppButton'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import selectEventServicesFunc from '@layouts/modals/modalsFunc/selectEventServicesFunc'
import { queryKeys } from '@helpers/queryKeys'
import ProposalLineEditor from '@components/ProposalLineEditor'
import { useServicesQuery } from '@helpers/useEntityQueries'
import {
  calculatePackageTotal,
  reconcileProposalServices,
  isProposalSelectionApplied,
} from '@helpers/proposalWorkflow'
import { formatMoney } from '@helpers/formatMoney'
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

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

const dateInput = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 86400000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const hasPendingDeliveryFailures = (delivery) => {
  const latest = new Map()
  for (const item of Array.isArray(delivery) ? delivery : []) {
    latest.set(item.mediaId || item.type, item.status)
  }
  return [...latest.values()].some((status) => status === 'failed')
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
  onChanged,
  closeModal,
  setOnShowOnCloseConfirmDialog,
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
  const [items, setItems] = useState([])
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
    if (initialProposal) return onChanged?.()
    if (!eventId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [templatesResponse, proposalsResponse] = await Promise.all([
        fetch('/api/proposal-templates', { cache: 'no-store' }),
        fetch(`/api/events/${eventId}/proposals`, { cache: 'no-store' }),
      ])
      const [templatesBody, proposalsBody] = await Promise.all([
        templatesResponse.json().catch(() => ({})),
        proposalsResponse.json().catch(() => ({})),
      ])
      if (
        templatesResponse.status === 403 ||
        proposalsResponse.status === 403
      ) {
        setUnavailable(true)
        return
      }
      if (!templatesResponse.ok)
        throw new Error(
          templatesBody?.error?.message || 'Не удалось загрузить шаблоны'
        )
      if (!proposalsResponse.ok)
        throw new Error(
          proposalsBody?.error?.message || 'Не удалось загрузить предложения'
        )
      const activeTemplates = (templatesBody.data || []).filter(
        (item) => item.status === 'active'
      )
      setTemplates(activeTemplates)
      setItems(proposalsBody.data || [])
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [eventId, initialProposal, onChanged, reportMessage])

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
      childrenProps: { eventId, initialProposal: proposal, onChanged: load },
    })
  }

  const create = async (sourceProposalId = '', templateId = '') => {
    setBusy(true)
    try {
      const response = await fetch(`/api/events/${eventId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sourceProposalId
            ? { sourceProposalId }
            : { templateId }
        ),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.success === false)
        throw new Error(
          body?.error?.message || 'Не удалось создать предложение'
        )
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

  const saveDraft = async (notify = true) => {
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
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.success === false)
        throw new Error(body?.error?.message || 'Не удалось сохранить')
      setEditing({ ...body.data, validUntil: dateInput(body.data.validUntil) })
      setSavedSnapshot(
        JSON.stringify({
          ...body.data,
          validUntil: dateInput(body.data.validUntil),
        })
      )
      if (notify) reportMessage({ tone: 'success', text: 'Черновик сохранён' })
      await load()
      return body.data
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
      return null
    } finally {
      setBusy(false)
    }
  }

  const action = async (proposal, name) => {
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
      if (name === 'publish') closeModal?.()
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
    } catch (error) {
      reportMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const deleteDraft = (proposal) => {
    modalsFunc.add({
      title: 'Удалить предложение?',
      text: `Черновик «${proposal.title}», версия ${proposal.version}, будет удалён. Восстановить его будет нельзя.`,
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
          setItems((current) =>
            current.filter((item) => item._id !== proposal._id)
          )
          reportMessage({
            tone: 'success',
            text: 'Черновик предложения удалён',
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

  const chooseServices = (packageIndex) => {
    const item = editing.packages[packageIndex]
    modalsFunc.add(
      selectEventServicesFunc(
        item.lines.map((line) => line.serviceId).filter(Boolean),
        (ids) => {
          const catalog =
            queryClient.getQueryData(queryKeys.services()) || services
          const lines = reconcileProposalServices(item.lines, ids, catalog)
          if (lines.length > 30) {
            reportMessage({
              tone: 'warning',
              text: 'В варианте может быть до 30 позиций. Выберите меньше услуг.',
            })
            return
          }
          updatePackage(packageIndex, { lines })
        }
      )
    )
  }

  const updatePackage = (packageIndex, patch) =>
    setEditing((current) => ({
      ...current,
      packages: current.packages.map((item, index) =>
        index === packageIndex
          ? {
              ...item,
              ...patch,
              ...((patch.lines && !item.manualTotal) ||
              patch.manualTotal === false
                ? { total: calculatePackageTotal(patch.lines || item.lines) }
                : {}),
            }
          : item
      ),
    }))
  const updateLine = (packageIndex, lineIndex, patch) =>
    setEditing((current) => ({
      ...current,
      packages: current.packages.map((item, index) =>
        index === packageIndex
          ? {
              ...item,
              lines: item.lines.map((line, currentLineIndex) =>
                currentLineIndex === lineIndex ? { ...line, ...patch } : line
              ),
              total: item.manualTotal
                ? item.total
                : calculatePackageTotal(
                    item.lines.map((line, currentLineIndex) =>
                      currentLineIndex === lineIndex
                        ? { ...line, ...patch }
                        : line
                    )
                  ),
            }
          : item
      ),
    }))

  const updateBlock = (blockIndex, patch) =>
    setEditing((current) => ({
      ...current,
      blocksSnapshot: current.blocksSnapshot.map((block, index) =>
        index === blockIndex ? { ...block, ...patch } : block
      ),
    }))

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
        Коммерческие предложения временно доступны только разработчику.
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
        {unresolved.size ? (
          <Notice tone="warning">
            Заполните переменные перед публикацией: {[...unresolved].join(', ')}
          </Notice>
        ) : null}
        <div>
          <h3 className="font-semibold">Что предлагаем клиенту</h3>
          <p className="mt-1 text-xs text-gray-600">
            Выберите услуги из каталога или добавьте свои позиции. Несколько
            вариантов нужны, если хотите дать клиенту выбор.
          </p>
        </div>
        {servicesError ? (
          <Notice tone="warning">
            Не удалось загрузить каталог услуг. Можно заполнить свои позиции или
            повторно открыть редактор.
          </Notice>
        ) : null}
        {servicesLoading ? (
          <p className="text-xs text-gray-600">Загружаем каталог услуг…</p>
        ) : null}
        <div className="space-y-3">
          {editing.packages.map((item, packageIndex) => (
            <div
              key={item.id}
              className="proposal-package rounded-lg border border-gray-200 px-3"
            >
              <Section
                title={item.title || `Вариант ${packageIndex + 1}`}
                summary={`${formatMoney(item.total)} · Позиций: ${item.lines.length}${item.recommended ? ' · Рекомендуем' : ''}`}
                initiallyOpen={
                  packageIndex === 0 ||
                  !initialProposal?.packages?.some(
                    (candidate) => candidate.id === item.id
                  )
                }
                noDivider
                wrapSummary
              >
                <div className="flex gap-2">
                  <Input
                    inputClassName="min-w-0"
                    label="Название варианта"
                    help="Вариант — отдельный набор услуг и цены, который клиент сможет выбрать на странице предложения."
                    noMargin
                    fullWidth
                    className="min-w-0 flex-1"
                    value={item.title}
                    onChange={(title) => updatePackage(packageIndex, { title })}
                  />
                  <label className="flex cursor-pointer items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={item.recommended}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          packages: current.packages.map(
                            (candidate, index) => ({
                              ...candidate,
                              recommended:
                                index === packageIndex
                                  ? event.target.checked
                                  : false,
                            })
                          ),
                        }))
                      }
                    />
                    Рекомендуем
                  </label>
                </div>
                {editing.packages.length > 1 ? (
                  <IconActionButton
                    icon={faTrashAlt}
                    title="Удалить вариант"
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setEditing((current) => ({
                        ...current,
                        packages: current.packages.filter(
                          (_, index) => index !== packageIndex
                        ),
                      }))
                    }
                  />
                ) : null}
                <Textarea
                  label="Описание варианта"
                  rows={2}
                  value={item.description || ''}
                  onChange={(description) =>
                    updatePackage(packageIndex, { description })
                  }
                />
                <div className="mt-2 space-y-2">
                  {item.lines.map((line, lineIndex) => (
                    <ProposalLineEditor
                      key={lineIndex}
                      line={line}
                      index={lineIndex}
                      services={services}
                      onChange={(patch) =>
                        updateLine(packageIndex, lineIndex, patch)
                      }
                      onRemove={() =>
                        updatePackage(packageIndex, {
                          lines: item.lines.filter(
                            (_, index) => index !== lineIndex
                          ),
                        })
                      }
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <AppButton
                    variant="primary"
                    size="sm"
                    disabled={busy || servicesLoading || servicesError}
                    onClick={() => chooseServices(packageIndex)}
                  >
                    Выбрать услуги
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={item.lines.length >= 30}
                    onClick={() =>
                      updatePackage(packageIndex, {
                        lines: [
                          ...item.lines,
                          {
                            serviceId: '',
                            title: '',
                            description: '',
                            price: 0,
                          },
                        ],
                      })
                    }
                  >
                    Своя позиция
                  </AppButton>
                  <Input
                    inputClassName="min-w-0"
                    label="Итого"
                    help="По умолчанию итог равен сумме позиций. Включите ручную цену, чтобы задать общую стоимость варианта, например со скидкой. Цены отдельных позиций при этом сохранятся."
                    type="number"
                    min={0}
                    step={1000}
                    decimalScale={2}
                    postfix="₽"
                    noMargin
                    value={item.total}
                    disabled={!item.manualTotal}
                    onChange={(total) => updatePackage(packageIndex, { total })}
                  />
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(item.manualTotal)}
                    onChange={(event) =>
                      updatePackage(packageIndex, {
                        manualTotal: event.target.checked,
                      })
                    }
                  />
                  Указать итоговую цену вручную
                </label>
                {item.manualTotal ? (
                  <div className="mt-1 text-xs text-gray-600">
                    Сумма позиций:{' '}
                    {formatMoney(calculatePackageTotal(item.lines))}. Разница с
                    итогом:{' '}
                    {formatMoney(
                      item.total - calculatePackageTotal(item.lines)
                    )}
                    .
                  </div>
                ) : null}
              </Section>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <AddIconButton
            title="Добавить вариант"
            label="Добавить вариант"
            size="sm"
            className="px-3"
            disabled={editing.packages.length >= 6}
            onClick={() =>
              setEditing((current) => ({
                ...current,
                packages: [
                  ...current.packages,
                  {
                    id: crypto.randomUUID(),
                    title: `Вариант ${current.packages.length + 1}`,
                    description: '',
                    lines:
                      current.packages[0]?.lines?.map((line) => ({
                        ...line,
                      })) || [],
                    total: current.packages[0]?.total || 0,
                    manualTotal: current.packages[0]?.manualTotal ?? false,
                    recommended: false,
                  },
                ].slice(0, 6),
              }))
            }
          />
        </div>
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
        <div className="grid grid-cols-2 gap-2">
          <AppButton
            type="button"
            disabled={busy}
            variant="primary"
            size="sm"
            onClick={() => saveDraft()}
          >
            Сохранить
          </AppButton>
          <AppButton
            type="button"
            disabled={busy}
            variant="primary"
            size="sm"
            onClick={async () => {
              const saved = await saveDraft(false)
              if (saved) await action(saved, 'publish')
            }}
          >
            Опубликовать
          </AppButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex justify-end">
        <AddIconButton
          title="Создать предложение"
          label="Создать предложение"
          size="base"
          disabled={busy || loading}
          className="self-end px-3 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={startCreate}
        />
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((proposal) => {
            const hasFailedDelivery = hasPendingDeliveryFailures(
              proposal.delivery
            )
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
                  </div>
                  {proposal.status === 'draft' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <IconActionButton
                        icon={faPencilAlt}
                        variant="warning"
                        size="sm"
                        title="Редактировать"
                        disabled={busy}
                        onClick={() => loadDetails(proposal)}
                      />
                      <IconActionButton
                        icon={faTrashAlt}
                        variant="danger"
                        size="sm"
                        title="Удалить предложение"
                        disabled={busy}
                        onClick={() => deleteDraft(proposal)}
                      />
                    </div>
                  ) : null}
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
                {proposal.status !== 'draft' ? (
                  <div className="tablet:grid-cols-3 mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="h-9 cursor-pointer rounded border px-2 text-xs"
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
                    </button>
                    <button
                      type="button"
                      className="h-9 cursor-pointer rounded border px-2 text-xs"
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
                    </button>
                    <button
                      type="button"
                      className="h-9 cursor-pointer rounded border px-2 text-xs"
                      onClick={async () => {
                        const response = await fetch(
                          `/api/proposals/${proposal._id}/send-telegram`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              retryFailedOnly: hasFailedDelivery,
                            }),
                          }
                        )
                        const body = await response.json().catch(() => ({}))
                        reportMessage(
                          response.ok && body?.success !== false
                            ? {
                                tone: 'success',
                                text: 'Предложение отправлено в Telegram',
                              }
                            : {
                                tone: 'error',
                                text:
                                  body?.error?.message ||
                                  'Не удалось отправить',
                              }
                        )
                        load()
                      }}
                    >
                      {hasFailedDelivery ? 'Повторить ошибки' : 'В Telegram'}
                    </button>
                    {proposal.selectedPackageId &&
                    !isProposalSelectionApplied(proposal) ? (
                      <button
                        type="button"
                        className="h-9 cursor-pointer rounded border border-emerald-300 px-2 text-xs text-emerald-700"
                        onClick={() => action(proposal, 'apply')}
                      >
                        Применить
                      </button>
                    ) : null}
                    {proposal.status === 'published' ? (
                      <button
                        type="button"
                        className="h-9 cursor-pointer rounded border border-red-200 px-2 text-xs text-red-700"
                        onClick={() => action(proposal, 'revoke')}
                      >
                        Отозвать
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="h-9 cursor-pointer rounded border px-2 text-xs"
                      onClick={() => create(proposal._id)}
                    >
                      Новая версия
                    </button>
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
