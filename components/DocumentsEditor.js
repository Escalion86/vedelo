'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import ComboBox from '@components/ComboBox'
import Input from '@components/Input'
import Notice from '@components/Notice'
import {
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPES,
  getDocumentDefaultTitle,
  getDocumentLastNumberKey,
  getDocumentTypeLabel,
} from '@helpers/documentTypes'
import { normalizeEventDocuments } from '@helpers/eventDocuments'
import exportDocxFromTemplate from '@helpers/exportDocxFromTemplate'
import { postData } from '@helpers/CRUD'
import { apiJson } from '@helpers/apiClient'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'

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
  documentTemplates = [],
  buildTemplateVariables,
}) => {
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)

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

  const buildTitle = (title, type, customTypeName) =>
    String(title ?? '').trim() || getDocumentDefaultTitle(type, customTypeName)

  const formatDateForDocFileName = (value) => {
    if (!value) return ''
    const str = String(value)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return str
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    return `${dd}.${mm}.${yyyy}`
  }

  const getDefaultDocumentDate = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`
  }

  const getNextDocumentNumber = (template) => {
    const lastNumberKey = getDocumentLastNumberKey(template?.type)
    const currentLastNumber = Number(siteSettings?.custom?.[lastNumberKey])
    return Number.isFinite(currentLastNumber) && currentLastNumber > 0
      ? String(currentLastNumber + 1)
      : '1'
  }

  const updateLastDocumentNumber = async (template, value) => {
    const lastNumberKey = getDocumentLastNumberKey(template?.type)
    const parsed = Number(String(value ?? '').trim())
    if (!lastNumberKey || !Number.isFinite(parsed) || parsed <= 0) return
    const previous = Number(siteSettings?.custom?.[lastNumberKey])
    if (Number.isFinite(previous) && previous >= parsed) return

    await postData(
      '/api/site',
      {
        custom: {
          ...(siteSettings?.custom ?? {}),
          [lastNumberKey]: parsed,
        },
      },
      (data) => setSiteSettings(data),
      null,
      false,
      loggedUser?._id
    )
  }

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
        onEntityChange?.(payload?.data?.entity)
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
      const anchor = document.createElement('a')
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

  const openAddDocumentModal = () => {
    const AddEventDocumentModal = ({
      closeModal,
      setOnConfirmFunc,
      setConfirmButtonName,
      setDisableConfirm,
    }) => {
      const [mode, setMode] = useState('file')
      const [fileSource, setFileSource] = useState('local')
      const [type, setType] = useState(DOCUMENT_TYPES.OTHER)
      const [customTypeName, setCustomTypeName] = useState('')
      const [title, setTitle] = useState('')
      const [url, setUrl] = useState('')
      const [file, setFile] = useState(null)
      const [templateId, setTemplateId] = useState(
        documentTemplates[0]?.id ?? ''
      )
      const [documentNumber, setDocumentNumber] = useState(
        getNextDocumentNumber(documentTemplates[0])
      )
      const [documentDate, setDocumentDate] = useState(getDefaultDocumentDate)
      const [localError, setLocalError] = useState('')
      const [saving, setSaving] = useState(false)
      const confirmRef = useRef(null)
      const selectedTemplate = useMemo(
        () => documentTemplates.find((template) => template.id === templateId),
        [templateId]
      )

      useEffect(() => {
        if (!selectedTemplate) return
        setType(selectedTemplate.type || DOCUMENT_TYPES.OTHER)
        setCustomTypeName(selectedTemplate.customTypeName || '')
        setTitle((prev) => prev || selectedTemplate.name || '')
        setDocumentNumber(getNextDocumentNumber(selectedTemplate))
      }, [selectedTemplate])

      const handleConfirm = useCallback(async () => {
        const normalizedCustomTypeName =
          type === DOCUMENT_TYPES.OTHER ? customTypeName.trim() : ''
        const now = new Date().toISOString()

        if (mode === 'link') {
          const normalizedUrl = String(url ?? '').trim()
          if (!normalizedUrl) {
            setLocalError('Добавьте ссылку на документ')
            return
          }
          await emitChange([
            ...safeDocuments,
            {
              id: createId(),
              type,
              customTypeName: normalizedCustomTypeName,
              title: buildTitle(title, type, normalizedCustomTypeName),
              url: normalizedUrl,
              file: null,
              createdAt: now,
            },
          ])
          setError('')
          closeModal()
          return
        }

        if (!entityId) {
          setLocalError(
            `Сначала сохраните ${entityLabel}, затем прикрепите файл`
          )
          return
        }

        let sourceFile = file
        let generatedTemplate = null
        let generatedDocumentNumber = documentNumber
        if (fileSource === 'template') {
          generatedTemplate = selectedTemplate
          if (!generatedTemplate) {
            setLocalError('Выберите шаблон документа')
            return
          }
          if (typeof buildTemplateVariables !== 'function') {
            setLocalError('Формирование документов сейчас недоступно')
            return
          }
          const generatedFileName = `${generatedTemplate.name} №${
            String(documentNumber || '').trim() || '1'
          } от ${
            formatDateForDocFileName(documentDate) ||
            formatDateForDocFileName(new Date())
          }.docx`
          const variables = buildTemplateVariables(
            generatedTemplate,
            documentNumber,
            documentDate,
            siteSettings
          )
          const blob = await exportDocxFromTemplate({
            templateBase64: generatedTemplate.templateBase64,
            fileName: generatedFileName,
            variables,
            download: false,
          })
          if (!blob) {
            setLocalError('Не удалось сформировать документ по шаблону')
            return
          }
          sourceFile = new File([blob], generatedFileName, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          })
        }

        if (!sourceFile) {
          setLocalError('Выберите файл документа')
          return
        }

        setSaving(true)
        setLocalError('')
        try {
          const uploadId = createId()
          const formData = new FormData()
          formData.append('file', sourceFile, sourceFile.name)
          formData.append('uploadId', uploadId)
          formData.append('type', type)
          formData.append('customTypeName', normalizedCustomTypeName)
          formData.append(
            'title',
            buildTitle(
              title || selectedTemplate?.name || sourceFile.name,
              type,
              normalizedCustomTypeName
            )
          )
          const response = await fetch(filesEndpoint, {
            method: 'POST',
            body: formData,
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload?.success === false) {
            throw new Error(
              payload?.error?.message ||
                payload?.error ||
                'Не удалось загрузить файл'
            )
          }
          const nextDocuments = normalizeEventDocuments(
            [
              ...safeDocuments,
              ...(payload?.data?.entity?.documents || []),
              payload?.data?.document,
            ],
            { trustStorageKey: true }
          )
          onEntityChange?.(payload?.data?.entity)
          await emitChange(nextDocuments)
          if (generatedTemplate) {
            await updateLastDocumentNumber(
              generatedTemplate,
              generatedDocumentNumber
            )
          }
          setError('')
          closeModal()
        } catch (reason) {
          setLocalError(
            reason instanceof Error
              ? reason.message
              : 'Не удалось загрузить файл'
          )
        } finally {
          setSaving(false)
        }
      }, [
        closeModal,
        customTypeName,
        file,
        fileSource,
        mode,
        documentNumber,
        documentDate,
        selectedTemplate,
        title,
        type,
        url,
      ])

      useEffect(() => {
        confirmRef.current = handleConfirm
      }, [handleConfirm])

      useEffect(() => {
        setConfirmButtonName(saving ? 'Загрузка...' : 'Добавить')
      }, [saving, setConfirmButtonName])

      useEffect(() => {
        setDisableConfirm(saving)
      }, [saving, setDisableConfirm])

      useEffect(() => {
        setOnConfirmFunc(() => confirmRef.current?.())
      }, [setOnConfirmFunc])

      return (
        <div className="flex flex-col gap-3">
          {localError ? (
            <Notice tone="error" role="alert" className="rounded">
              {localError}
            </Notice>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`flex h-10 cursor-pointer items-center justify-center rounded border px-3 text-sm font-semibold ${
                mode === 'link'
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              onClick={() => {
                setMode('link')
                setLocalError('')
              }}
            >
              Ссылка
            </button>
            <button
              type="button"
              className={`flex h-10 cursor-pointer items-center justify-center rounded border px-3 text-sm font-semibold ${
                mode === 'file'
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              onClick={() => {
                setMode('file')
                setLocalError('')
              }}
            >
              Файл
            </button>
          </div>

          <ComboBox
            label="Тип"
            items={DOCUMENT_TYPE_OPTIONS}
            value={type}
            onChange={(value) => setType(value || DOCUMENT_TYPES.OTHER)}
            noMargin
            fullWidth
          />
          {type === DOCUMENT_TYPES.OTHER ? (
            <Input
              label="Название типа"
              value={customTypeName}
              onChange={setCustomTypeName}
              noMargin
              fullWidth
            />
          ) : null}
          <Input
            label="Название"
            value={title}
            onChange={setTitle}
            noMargin
            fullWidth
          />
          {mode === 'link' ? (
            <Input
              label="Ссылка"
              value={url}
              onChange={setUrl}
              noMargin
              fullWidth
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`flex h-10 cursor-pointer items-center justify-center rounded border px-3 text-sm font-semibold ${
                    fileSource === 'local'
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                  onClick={() => {
                    setFileSource('local')
                    setLocalError('')
                  }}
                >
                  Локальный файл
                </button>
                <button
                  type="button"
                  className={`flex h-10 cursor-pointer items-center justify-center rounded border px-3 text-sm font-semibold ${
                    fileSource === 'template'
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                  onClick={() => {
                    setFileSource('template')
                    setLocalError('')
                  }}
                >
                  По шаблону
                </button>
              </div>

              {fileSource === 'local' ? (
                <div className="flex flex-col gap-2 rounded border border-gray-200 p-3">
                  <div className="text-sm font-semibold text-gray-800">
                    {file?.name || 'Файл не выбран'}
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      setLocalError('')
                      const nextFile = event.target.files?.[0] ?? null
                      if (nextFile && nextFile.size > 5 * 1024 * 1024) {
                        setFile(null)
                        setLocalError('Файл не должен превышать 5 МБ')
                        event.target.value = ''
                        return
                      }
                      setFile(nextFile)
                      if (nextFile?.name) setTitle(nextFile.name)
                    }}
                  />
                </div>
              ) : documentTemplates.length > 0 ? (
                <>
                  <ComboBox
                    label="Шаблон"
                    items={documentTemplates.map((template) => ({
                      value: template.id,
                      name: template.name,
                    }))}
                    value={templateId}
                    onChange={(value) => setTemplateId(value || '')}
                    noMargin
                    fullWidth
                  />
                  <div className="flex items-end gap-2">
                    <Input
                      label="№ документа"
                      value={documentNumber}
                      onChange={setDocumentNumber}
                      type="number"
                      min={1}
                      noMargin
                      className="w-[120px]"
                      inputClassName="hide-number-spin w-[45px]"
                    />
                    <Input
                      label="Дата документа"
                      value={documentDate}
                      onChange={setDocumentDate}
                      type="date"
                      noMargin
                      className="w-[160px]"
                    />
                  </div>
                </>
              ) : (
                <Notice tone="warning" className="rounded">
                  Загрузите DOCX-шаблоны на странице Документы.
                </Notice>
              )}

              {!entityId ? (
                <Notice tone="warning" className="rounded px-2 py-1 text-xs">
                  {`Для прикрепления файла нужно сначала сохранить ${entityLabel}.`}
                </Notice>
              ) : null}
            </div>
          )}
        </div>
      )
    }

    modalsFunc.add({
      title: 'Добавить файл или ссылку',
      confirmButtonName: 'Добавить',
      declineButtonName: 'Закрыть',
      closeButtonName: 'Закрыть',
      Children: AddEventDocumentModal,
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
        <div className="text-sm font-semibold text-gray-800">
          Файлы и документы · {safeDocuments.length}
        </div>
        <button
          type="button"
          className="action-icon-button action-icon-button--warning tablet:w-auto flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
          onClick={openAddDocumentModal}
        >
          Добавить файл или ссылку
        </button>
      </div>

      {safeDocuments.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleDocuments.map((document) => (
            <div
              key={document.id}
              className="tablet:flex-row tablet:items-center tablet:justify-between flex flex-col gap-2 rounded border border-gray-200 p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-800">
                  {document.title || getDocumentDefaultTitle(document.type)}
                </div>
                <button
                  type="button"
                  onClick={() => openDocument(document)}
                  className="mt-1 block max-w-full cursor-pointer truncate text-left text-xs text-gray-500 hover:text-gray-900"
                >
                  {getDocumentTypeLabel(document.type, document.customTypeName)}{' '}
                  · {document.url || document.file?.name || 'Документ'}
                  {formatFileSize(document.file?.size)
                    ? ` · ${formatFileSize(document.file.size)}`
                    : ''}
                </button>
              </div>
              <button
                type="button"
                className="action-icon-button action-icon-button--warning tablet:w-auto flex h-8 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                onClick={() => removeDocument(document)}
              >
                Удалить
              </button>
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
