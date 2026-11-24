'use client'

import fieldHelp from '@helpers/fieldHelp.json'

import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import ComboBox from '@components/ComboBox'
import DocumentLinkInput from '@components/DocumentLinkInput'
import Notice from '@components/Notice'
import {
  DOCUMENT_TYPE_OPTIONS,
  getDocumentDefaultTitle,
  getDocumentTitleAfterTypeChange,
} from '@helpers/documentTypes'
import { isReceiptPayment } from '@helpers/documentWorkflow'
import { apiJson } from '@helpers/apiClient'
import { getActivityProfile } from '@helpers/activityProfile.mjs'
import {
  BUILT_IN_CONTRACT_TEMPLATES,
  getBuiltInContractTemplateMetadata,
  getRecommendedBuiltInContractTemplates,
} from '@helpers/builtInContractTemplates.mjs'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function DocumentCreateDialog({
  closeModal,
  setOnConfirmFunc,
  setConfirmButtonName,
  setDisableConfirm,
  entityId,
  entityType,
  entityLabel,
  templates,
  payments = [],
  initialType = 'other',
  initialTransactionId = '',
  hasAgreedProposal = false,
  onAdd,
  onUploaded,
}) {
  const [type, setType] = useState(initialType)
  const [mode, setMode] = useState('file')
  const [title, setTitle] = useState(() => getDocumentDefaultTitle(initialType))
  const [customTypeName, setCustomTypeName] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [templateFields, setTemplateFields] = useState({})
  const [date, setDate] = useState(today)
  const [source, setSource] = useState('event')
  const [transactionId, setTransactionId] = useState(initialTransactionId)
  const [preview, setPreview] = useState(null)
  const [allowEmpty, setAllowEmpty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmRef = useRef(null)
  const request = useRef({ key: '', id: '' })
  const inFlight = useRef(false)
  const { preset } = getActivityProfile(useAtomValue(siteSettingsAtom))
  const recommended = getRecommendedBuiltInContractTemplates(preset)
  const recommendedIds = new Set(recommended.map(({ id }) => id))
  const matchingTemplates = templates.filter((item) => item.type === type)
  const builtInTemplates = type === 'contract'
    ? [...recommended, ...BUILT_IN_CONTRACT_TEMPLATES.filter(({ id }) => !recommendedIds.has(id))]
    : []
  const selectedTemplate = matchingTemplates.find(({ id }) => id === templateId)
  const templateMetadata = getBuiltInContractTemplateMetadata(selectedTemplate?.baseTemplateId || templateId)
  const canGenerate = entityType === 'events' && type !== 'receipt'
  const key = JSON.stringify({ type, templateId, date, source, templateFields })
  const currentPreview = preview?.key === key ? preview.data : null
  const paymentOptions = payments.filter(isReceiptPayment).map((item) => ({
    value: String(item._id),
    name: `${Number(item.amount).toLocaleString('ru-RU')} ₽ · ${new Date(item.date).toLocaleDateString('ru-RU')}${item.comment ? ` · ${item.comment}` : ''}`,
  }))
  const handleConfirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      if (mode === 'template') {
        if (!entityId) throw new Error(`Сначала сохраните ${entityLabel}`)
        if (!templateId) throw new Error('Выберите шаблон')
        const missing = templateMetadata?.fields.filter(({ key, required }) =>
          required && !templateFields[key]?.trim()
        )
        if (missing?.length)
          throw new Error(`Заполните поля: ${missing.map(({ label }) => label).join(', ')}.`)
        if (!currentPreview) {
          const result = await apiJson(
            `/api/events/${entityId}/documents/generate`,
            {
              method: 'POST',
              body: JSON.stringify({
                action: 'preview',
                templateId,
                documentDate: date,
                source,
                templateFields,
              }),
            }
          )
          setPreview({ key, data: result.data.preview })
          setAllowEmpty(false)
          return
        }
        if (request.current.key !== key)
          request.current = { key, id: crypto.randomUUID() }
        const result = await apiJson(
          `/api/events/${entityId}/documents/generate`,
          {
            method: 'POST',
            body: JSON.stringify({
              templateId,
              documentDate: date,
              source,
              templateFields,
              allowEmpty,
              requestId: request.current.id,
            }),
          }
        )
        await onUploaded(result.data)
      } else if (mode === 'link') {
        let parsed
        try {
          parsed = new URL(url.trim())
        } catch {
          throw new Error('Введите полную ссылку https://…')
        }
        if (!['https:', 'http:'].includes(parsed.protocol))
          throw new Error('Допустимы только ссылки HTTP/HTTPS')
        const linkKey = JSON.stringify({
          type,
          title,
          url: parsed.toString(),
          transactionId,
        })
        if (request.current.key !== linkKey)
          request.current = { key: linkKey, id: crypto.randomUUID() }
        const document = {
          id: request.current.id,
          type,
          customTypeName,
          title: title.trim() || getDocumentDefaultTitle(type, customTypeName),
          url: parsed.toString(),
          transactionId: type === 'receipt' ? transactionId : '',
          createdAt: new Date().toISOString(),
        }
        if (entityType === 'events' && entityId) {
          const result = await apiJson(`/api/events/${entityId}/documents`, {
            method: 'POST',
            body: JSON.stringify(document),
          })
          await onUploaded(result.data)
        } else await onAdd(document)
      } else {
        if (!entityId) throw new Error(`Сначала сохраните ${entityLabel}`)
        if (!file) throw new Error('Выберите файл')
        if (file.size > 5 * 1024 * 1024)
          throw new Error('Файл не должен превышать 5 МБ')
        const uploadKey = JSON.stringify({
          mode,
          type,
          title,
          transactionId,
          name: file.name,
          size: file.size,
          modified: file.lastModified,
        })
        if (request.current.key !== uploadKey)
          request.current = { key: uploadKey, id: crypto.randomUUID() }
        const form = new FormData()
        form.set('file', file)
        form.set('uploadId', request.current.id)
        form.set('type', type)
        form.set(
          'title',
          title.trim() || getDocumentDefaultTitle(type, customTypeName)
        )
        form.set('customTypeName', customTypeName)
        if (type === 'receipt') form.set('transactionId', transactionId)
        const response = await fetch(`/api/${entityType}/${entityId}/files`, {
          method: 'POST',
          body: form,
        })
        const result = await response.json()
        if (!response.ok || !result.success)
          throw new Error(
            result.error?.message || result.error || 'Не удалось загрузить файл'
          )
        await onUploaded(result.data)
      }
      closeModal()
    } catch (reason) {
      setError(reason.message || 'Не удалось добавить документ')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    confirmRef.current = handleConfirm
  })
  useEffect(() => {
    setOnConfirmFunc(() => confirmRef.current?.())
  }, [setOnConfirmFunc])
  useEffect(() => {
    setConfirmButtonName(
      busy
        ? 'Подождите…'
        : mode === 'template'
          ? currentPreview
            ? 'Создать документ'
            : 'Проверить данные'
          : 'Добавить'
    )
    setDisableConfirm(
      busy ||
        (mode === 'template' &&
          Boolean(
            currentPreview?.unknown.length ||
            (currentPreview?.missing.length && !allowEmpty)
          ))
    )
  }, [
    busy,
    mode,
    currentPreview,
    allowEmpty,
    setConfirmButtonName,
    setDisableConfirm,
  ])

  return (
    <div className="document-create-dialog flex flex-col gap-3">
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      <ComboBox
        label="Тип документа"
        help="Добавляйте только нужные документы: КП, договор, счёт и чек независимы. Чек прикрепляется готовым файлом или ссылкой из сервиса, в котором он выдан."
        items={DOCUMENT_TYPE_OPTIONS}
        value={type}
        onChange={(value) => {
          const nextType = value || 'other'
          setTitle((currentTitle) =>
            getDocumentTitleAfterTypeChange({
              title: currentTitle,
              previousType: type,
              nextType,
              previousCustomTypeName: customTypeName,
              nextCustomTypeName: customTypeName,
            })
          )
          setType(nextType)
          setTemplateId('')
          setTemplateFields({})
          setPreview(null)
          setError('')
          if (value === 'receipt') setMode('file')
        }}
        noMargin
        fullWidth
      />
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Способ добавления"
      >
        {[
          ['file', 'Загрузить файл'],
          ['link', 'Добавить ссылку'],
          ...(canGenerate ? [['template', 'Сформировать']] : []),
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`action-icon-button min-h-10 cursor-pointer rounded border px-3 text-sm ${mode === value ? 'action-icon-button--warning' : 'action-icon-button--neutral'}`}
            onClick={() => {
              setMode(value)
              setError('')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode !== 'template' ? (
        <>
          <Input
            label="Название"
            value={title}
            onChange={setTitle}
            noMargin
            fullWidth
          />
          {type === 'other' ? (
            <Input
              label="Название типа"
              value={customTypeName}
              onChange={(value) => {
                setTitle((currentTitle) =>
                  getDocumentTitleAfterTypeChange({
                    title: currentTitle,
                    previousType: type,
                    nextType: type,
                    previousCustomTypeName: customTypeName,
                    nextCustomTypeName: value,
                  })
                )
                setCustomTypeName(value)
              }}
              noMargin
              fullWidth
            />
          ) : null}
          {mode === 'link' ? (
            <DocumentLinkInput value={url} onChange={setUrl} />
          ) : (
            <label className="flex flex-col gap-2 text-sm">
              Файл до 5 МБ
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>
          )}
          {type === 'receipt' && paymentOptions.length ? (
            <ComboBox
              label="К какой оплате относится чек"
              help="Связь помогает увидеть, для какой оплаты уже добавлен чек. Её можно не указывать: чек останется в документах."
              items={[
                { value: '', name: 'Без связи с оплатой' },
                ...paymentOptions,
              ]}
              value={transactionId}
              onChange={(value) => setTransactionId(value || '')}
              noMargin
              fullWidth
            />
          ) : null}
        </>
      ) : (
        <>
          <ComboBox
            label="Шаблон"
            help="Используются сохранённые данные. После правок заказа сначала сохраните его и откройте документы снова. Номер документа назначается автоматически при создании."
            placeholder="Выберите шаблон"
            items={[
              ...builtInTemplates.map(({ id, name }) => ({
                value: id,
                name: `${recommendedIds.has(id) ? 'Рекомендуем' : 'Стандартный'} · ${name}`,
              })),
              ...matchingTemplates.map(({ id, name }) => ({ value: id, name })),
            ]}
            value={templateId}
            onChange={(value) => {
              setTemplateId(value || '')
              setTemplateFields({})
              setError('')
            }}
            noMargin
            fullWidth
          />
          {!matchingTemplates.length && !builtInTemplates.length ? (
            <Notice tone="warning">
              Нет шаблона этого типа. Добавьте его в разделе «Документы» или
              загрузите готовый файл.
            </Notice>
          ) : null}
          {templateMetadata && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-600">{templateMetadata.description}</p>
              {templateMetadata.fields.map(({ key, label, multiline, placeholder, required }) => {
                const Field = multiline ? Textarea : Input
                return (
                  <Field
                    key={key}
                    label={label}
                    ariaLabel={label}
                    help={placeholder}
                    value={templateFields[key] || ''}
                    onChange={(value) => setTemplateFields((current) => ({ ...current, [key]: value }))}
                    maxLength={2000}
                    required={required}
                    noMargin
                    fullWidth
                  />
                )
              })}
            </div>
          )}
          <Input
            label="Дата документа"
            help={fieldHelp['documents.date']}
            type="date"
            value={date}
            onChange={setDate}
            noMargin
            fullWidth
          />
          {hasAgreedProposal ? (
            <ComboBox
              label="Состав и стоимость"
              help="Выберите текущие сохранённые данные заказа или состав и цены из применённого согласованного КП. Это определяет услуги и суммы в создаваемом документе."
              value={source}
              onChange={setSource}
              items={[
                { value: 'event', name: 'Из заказа' },
                { value: 'proposal', name: 'Из согласованного КП' },
              ]}
              noMargin
              fullWidth
            />
          ) : null}
          {currentPreview ? (
            <>
              <div className="font-semibold">Проверка данных документа</div>
              <p className="text-xs text-gray-600">
                Значения для подстановки в DOCX. Оформление и разбиение на
                страницы задаёт ваш шаблон.
              </p>
              {currentPreview.unknown.length ? (
                <Notice tone="error">
                  Исправьте неизвестные переменные в шаблоне:{' '}
                  {currentPreview.unknown.join(', ')}
                </Notice>
              ) : null}
              {currentPreview.missing.length ? (
                <Notice tone="warning">
                  Не заполнено: {currentPreview.missing.join(', ')}. Заполните
                  данные клиента/исполнителя или разрешите пустые поля.
                </Notice>
              ) : null}
              <dl className="max-h-64 space-y-2 overflow-auto rounded border border-gray-300 p-3 text-sm">
                {currentPreview.fields.map((field) => (
                  <div key={field.name}>
                    <dt className="text-xs text-gray-500">{field.name}</dt>
                    <dd className="break-words whitespace-pre-wrap">
                      {field.value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              {currentPreview.missing.length ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allowEmpty}
                    onChange={(event) => setAllowEmpty(event.target.checked)}
                  />
                  Создать с незаполненными полями
                </label>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
