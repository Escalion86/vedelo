'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import Notice from '@components/Notice'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import DocumentCreateDialog from '@components/DocumentCreateDialog'
import DocumentEditDialog from '@components/DocumentEditDialog'
import ReceiptPaymentDialog from '@components/ReceiptPaymentDialog'
import { getPaymentsWithoutReceipts } from '@helpers/documentWorkflow'
import {
  getDocumentDefaultTitle,
  getDocumentTypeLabel,
} from '@helpers/documentTypes'
import { normalizeEventDocuments } from '@helpers/eventDocuments'
import { apiJson } from '@helpers/apiClient'
import { modalsFuncAtom } from '@state/atoms'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'

const createId = () =>
  typeof crypto !== 'undefined' && crypto?.randomUUID
    ? crypto.randomUUID()
    : `document-${Date.now()}-${Math.random().toString(16).slice(2)}`

const formatFileSize = (size) => {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

const DocumentsEditor = ({
  documents = [],
  onChange,
  entityType = 'events',
  entityId,
  entityLabel = 'заявку или заказ',
  onEntityChange,
  maxVisible = null,
  noMargin = false,
  showHeading = true,
  documentTemplates = [],
  payments = [],
  hasAgreedProposal = false,
}) => {
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const queryClient = useQueryClient()
  const entityChanged = (entity) => {
    onEntityChange?.(entity)
    if (entityType === 'events' && entity?._id) {
      queryClient.setQueryData(['event', entity._id], entity)
      queryClient.setQueriesData({ queryKey: ['events'] }, (current) =>
        current?.data
          ? {
              ...current,
              data: current.data.map((item) =>
                item._id === entity._id ? entity : item
              ),
            }
          : current
      )
    }
  }

  const safeDocuments = useMemo(
    () => normalizeEventDocuments(documents, { trustStorageKey: true }),
    [documents]
  )

  const emitChange = useCallback(
    async (nextDocuments) => {
      await onChange?.(
        normalizeEventDocuments(nextDocuments, { trustStorageKey: true })
      )
    },
    [onChange]
  )

  const filesEndpoint = entityId
    ? `/api/${entityType}/${encodeURIComponent(entityId)}/files`
    : ''
  const visibleDocuments =
    !showAll && Number(maxVisible) > 0
      ? safeDocuments.slice(-Number(maxVisible))
      : safeDocuments

  const removeDocument = async (document) => {
    if (!window.confirm('Удалить документ?')) return
    try {
      if (document.file?.storageKey && filesEndpoint) {
        const payload = await apiJson(filesEndpoint, {
          method: 'DELETE',
          body: JSON.stringify({
            documentId: document.id,
            deleteId: createId(),
          }),
        })
        entityChanged(payload?.data?.entity)
        await emitChange(payload?.data?.entity?.documents ?? [])
      } else {
        await emitChange(
          safeDocuments.filter((item) => item.id !== document.id)
        )
      }
      setError('')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось удалить документ'
      )
    }
  }

  const openDocument = async (document) => {
    try {
      let url = document.url || document.file?.url || ''
      if (document.file?.storageKey && filesEndpoint) {
        const payload = await apiJson(`${filesEndpoint}/access-url`, {
          method: 'POST',
          body: JSON.stringify({
            documentId: document.id,
            disposition:
              document.file?.contentType?.startsWith('image/') ||
              document.file?.contentType === 'application/pdf'
                ? 'inline'
                : 'attachment',
          }),
        })
        url = payload?.data?.url || ''
      }
      if (!url) throw new Error('Ссылка на документ недоступна')
      const parsedUrl = new URL(url, window.location.origin)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Небезопасный адрес документа')
      }
      const anchor = window.document.createElement('a')
      anchor.href = parsedUrl.toString()
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.click()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось открыть документ'
      )
    }
  }

  const missingReceipts = getPaymentsWithoutReceipts(payments, safeDocuments)
  const linkReceipt = (document) =>
    modalsFunc.add({
      title: 'Связать чек с оплатой',
      confirmButtonName: 'Сохранить',
      declineButtonName: 'Закрыть',
      Children: (props) => (
        <ReceiptPaymentDialog
          {...props}
          payments={payments}
          document={document}
          eventId={entityId}
          onSaved={async (data) => {
            entityChanged(data.entity)
            await emitChange(
              safeDocuments.map((item) =>
                item.id === document.id ? data.document : item
              )
            )
          }}
        />
      ),
    })
  const openEditDocumentModal = (document) => {
    modalsFunc.add({
      title: 'Редактировать документ',
      confirmButtonName: 'Сохранить',
      declineButtonName: 'Закрыть',
      closeButtonName: 'Закрыть',
      Children: (props) => (
        <DocumentEditDialog
          {...props}
          document={document}
          payments={payments}
          onSave={async (changes) => {
            if (entityType === 'events' && entityId) {
              const payload = await apiJson(
                `/api/events/${encodeURIComponent(entityId)}/documents`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({
                    documentId: document.id,
                    ...changes,
                  }),
                }
              )
              entityChanged(payload?.data?.entity)
              await emitChange(payload?.data?.entity?.documents ?? [])
              return
            }
            await emitChange(
              safeDocuments.map((item) =>
                item.id === document.id ? { ...item, ...changes } : item
              )
            )
          }}
        />
      ),
    })
  }
  const openAddDocumentModal = (
    initialType = 'other',
    initialTransactionId = ''
  ) => {
    modalsFunc.add({
      title: 'Добавить документ',
      confirmButtonName: 'Добавить',
      declineButtonName: 'Закрыть',
      closeButtonName: 'Закрыть',
      Children: (props) => (
        <DocumentCreateDialog
          {...props}
          entityId={entityId}
          entityType={entityType}
          entityLabel={entityLabel}
          templates={documentTemplates}
          payments={payments}
          initialType={initialType}
          initialTransactionId={initialTransactionId}
          hasAgreedProposal={hasAgreedProposal}
          onAdd={(document) => emitChange([...safeDocuments, document])}
          onUploaded={async (data) => {
            entityChanged(data.entity)
            await emitChange([
              ...safeDocuments,
              ...(data.entity?.documents || []),
              data.document,
            ])
          }}
        />
      ),
    })
  }

  return (
    <div className={`flex flex-col gap-3 ${noMargin ? '' : 'mt-2'}`}>
      {error ? (
        <Notice tone="error" role="alert" className="rounded">
          {error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {showHeading ? (
          <div className="text-sm font-semibold text-gray-800">
            Файлы и документы · {safeDocuments.length}
          </div>
        ) : null}
        <AddIconButton
          onClick={() => openAddDocumentModal()}
          title="Добавить документ"
          label="Добавить документ"
          size="sm"
          className="ml-auto px-3"
        />
      </div>

      {missingReceipts.length ? (
        <Notice tone="info">
          <div>
            К {missingReceipts.length} оплатам ещё не привязан чек. Если чек уже
            добавлен без связи, он остаётся в списке документов.
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {missingReceipts.map((payment) => (
              <AddIconButton
                key={payment._id}
                title={`Добавить чек к оплате ${Number(payment.amount).toLocaleString('ru-RU')} ₽`}
                label={`Добавить чек · ${Number(payment.amount).toLocaleString('ru-RU')} ₽ · ${new Date(payment.date).toLocaleDateString('ru-RU')}`}
                size="sm"
                className="px-3"
                onClick={() =>
                  openAddDocumentModal('receipt', String(payment._id))
                }
              />
            ))}
          </div>
        </Notice>
      ) : null}
      {safeDocuments.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleDocuments.map((document) => (
            <div
              key={document.id}
              data-document-card={document.id}
              className="rounded border border-gray-200 p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-800">
                    {document.title || getDocumentDefaultTitle(document.type)}
                    {document.transactionId ? (
                      <span className="ml-2 text-xs font-normal">
                        · к оплате
                      </span>
                    ) : null}
                    {document.documentDate ? (
                      <span className="ml-2 text-xs font-normal">
                        от {document.documentDate.split('-').reverse().join('.')}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => openDocument(document)}
                    className="mt-1 block max-w-full cursor-pointer truncate text-left text-xs text-gray-500 hover:text-gray-900"
                  >
                    {getDocumentTypeLabel(
                      document.type,
                      document.customTypeName
                    )}{' '}
                    · {document.url || document.file?.name || 'Документ'}
                    {formatFileSize(document.file?.size)
                      ? ` · ${formatFileSize(document.file.size)}`
                      : ''}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IconActionButton
                    icon={faPencilAlt}
                    title="Редактировать документ"
                    size="sm"
                    onClick={() => openEditDocumentModal(document)}
                  />
                  <IconActionButton
                    icon={faTrashAlt}
                    title="Удалить документ"
                    variant="danger"
                    size="sm"
                    onClick={() => removeDocument(document)}
                  />
                </div>
              </div>
              {entityType === 'events' &&
              entityId &&
              document.type === 'receipt' &&
              payments.length ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="action-icon-button min-h-9 cursor-pointer rounded border px-3 text-xs"
                    onClick={() => linkReceipt(document)}
                  >
                    {document.transactionId
                      ? 'Изменить оплату'
                      : 'Связать с оплатой'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {Number(maxVisible) > 0 && safeDocuments.length > Number(maxVisible) ? (
        <button
          type="button"
          className="client-view-action-btn min-h-9 cursor-pointer self-start rounded border px-3 py-1 text-xs font-semibold transition"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Показать последние' : 'Показать все'}
        </button>
      ) : null}
    </div>
  )
}

export default DocumentsEditor
