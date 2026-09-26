'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import LabeledContainer from '@components/LabeledContainer'
import ComboBox from '@components/ComboBox'
import Notice from '@components/Notice'
import IconActionButton from '@components/IconActionButton'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import Input from '@components/Input'
import ReactMarkdown from 'react-markdown'
import ProposalTemplatesPanel from '@components/ProposalTemplatesPanel'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { modalsFuncAtom } from '@state/atoms'
import { postData } from '@helpers/CRUD'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import {
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPES,
  getDocumentTypeLabel,
} from '@helpers/documentTypes'
import {
  normalizeDocumentTemplatesFromSettings,
  validateDocxTemplateFileMeta,
} from '@helpers/documentTemplates'
import { canUseProposalBuilder } from '@helpers/proposalAccess'

const DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL =
  '/templates/default-contract-template.docx'
const DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL = '/api/document-templates/examples/act'

const DocxDocumentsGuide = () => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/public/docs/docx-documents')
        if (!response.ok) throw new Error(String(response.status))
        const text = await response.text()
        if (!active) return
        setContent(text)
      } catch (loadError) {
        if (!active) return
        setError('Не удалось загрузить инструкцию DOCX')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <div className="text-sm text-gray-600">Загрузка...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>

  return (
    <div className="max-h-[65dvh] overflow-auto text-sm leading-6 text-gray-800">
      <ReactMarkdown
        components={{
          h1: ({ ...props }) => (
            <h1
              className="mb-3 text-xl font-semibold text-gray-900"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="mt-4 mb-2 text-lg font-semibold text-gray-900"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="mt-3 mb-2 text-base font-semibold text-gray-900"
              {...props}
            />
          ),
          p: ({ ...props }) => <p className="mb-2" {...props} />,
          ul: ({ ...props }) => (
            <ul className="mb-2 list-disc pl-5" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="mb-2 list-decimal pl-5" {...props} />
          ),
          li: ({ ...props }) => <li className="mb-1" {...props} />,
          code: ({ className, children, ...props }) =>
            className ? (
              <code
                className={`block overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100 ${className}`}
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900"
                {...props}
              >
                {children}
              </code>
            ),
          pre: ({ ...props }) => <pre className="mb-3" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

const DocumentsContent = () => {
  const [section, setSection] = useState('documents')
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const customSettings = useMemo(
    () => siteSettings?.custom ?? {},
    [siteSettings]
  )
  const tariffAccess = useMemo(
    () => getUserTariffAccess(loggedUser, tariffs),
    [loggedUser, tariffs]
  )
  const canUseDocuments = Boolean(tariffAccess?.allowDocuments)
  const canUseProposals = canUseProposalBuilder(loggedUser)
  const documentTemplates = useMemo(
    () => normalizeDocumentTemplatesFromSettings(customSettings),
    [customSettings]
  )

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get(
      'section'
    )
    if (requestedSection === 'proposals' && canUseProposals)
      // URL читается после гидратации, когда известны права пользователя.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSection('proposals')
  }, [canUseProposals])

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result ?? '')
        const [, payload = ''] = result.split(',')
        resolve(payload || '')
      }
      reader.onerror = () => reject(new Error('Ошибка чтения файла'))
      reader.readAsDataURL(file)
    })

  const saveDocumentTemplates = async (templates) => {
    const normalizedTemplates = normalizeDocumentTemplatesFromSettings({
      documentTemplates: templates,
    })

    await postData(
      '/api/site',
      {
        custom: {
          ...(siteSettings?.custom ?? {}),
          documentTemplates: normalizedTemplates,
        },
      },
      (data) => setSiteSettings(data),
      null,
      false,
      null
    )
  }

  const openTemplateEditor = (template = null) => {
    const isEdit = Boolean(template?.id)

    const TemplateEditor = ({ closeModal, setOnConfirmFunc }) => {
      const [name, setName] = useState(template?.name ?? '')
      const [type, setType] = useState(
        template?.type ?? DOCUMENT_TYPES.CONTRACT
      )
      const [customTypeName, setCustomTypeName] = useState(
        template?.customTypeName ?? ''
      )
      const [file, setFile] = useState(null)
      const [error, setError] = useState('')
      const confirmRef = useRef(null)

      const handleSave = useCallback(async () => {
        const normalizedName = String(name ?? '').trim()
        if (!normalizedName) {
          setError('Введите название шаблона')
          return
        }
        if (!isEdit && !file) {
          setError('Загрузите DOCX-файл')
          return
        }
        if (file) {
          const validation = validateDocxTemplateFileMeta(file)
          if (!validation.valid) {
            setError(validation.error)
            return
          }
        }

        const now = new Date().toISOString()
        const base64 = file ? await readFileAsBase64(file) : ''
        const nextTemplate = {
          id:
            template?.id ||
            (typeof crypto !== 'undefined' && crypto?.randomUUID
              ? crypto.randomUUID()
              : `template-${Date.now()}`),
          name: normalizedName,
          type,
          customTypeName:
            type === DOCUMENT_TYPES.OTHER
              ? String(customTypeName ?? '').trim()
              : '',
          fileName: file?.name || template?.fileName || 'template.docx',
          templateBase64: base64 || template?.templateBase64 || '',
          createdAt: template?.createdAt || now,
          updatedAt: now,
        }
        const nextTemplates = isEdit
          ? documentTemplates.map((item) =>
              item.id === template.id ? nextTemplate : item
            )
          : [...documentTemplates, nextTemplate]
        await saveDocumentTemplates(nextTemplates)
        closeModal()
      }, [closeModal, customTypeName, file, name, type])

      useEffect(() => {
        confirmRef.current = handleSave
      }, [handleSave])

      useEffect(() => {
        setOnConfirmFunc(() => confirmRef.current?.())
      }, [setOnConfirmFunc])

      return (
        <div className="flex flex-col gap-3">
          {error ? (
            <Notice tone="error" role="alert" className="rounded">
              {error}
            </Notice>
          ) : null}
          <Input
            label="Название шаблона"
            value={name}
            onChange={setName}
            noMargin
            fullWidth
          />
          <ComboBox
            label="Тип документа"
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
          <div className="flex flex-col gap-2 rounded border border-gray-200 p-3">
            <div className="text-sm font-semibold text-gray-800">
              {file?.name ||
                template?.fileName ||
                (isEdit ? 'Файл не изменяется' : 'Файл не выбран')}
            </div>
            <input
              type="file"
              accept=".docx"
              onChange={(event) => {
                setError('')
                setFile(event.target.files?.[0] ?? null)
              }}
            />
            <div className="text-xs text-gray-500">
              DOCX-шаблон до 5 МБ. Для редактирования можно оставить текущий
              файл.
            </div>
          </div>
        </div>
      )
    }

    modalsFunc.add({
      title: isEdit ? 'Редактирование шаблона' : 'Новый шаблон',
      confirmButtonName: 'Сохранить',
      declineButtonName: 'Закрыть',
      showDecline: true,
      Children: TemplateEditor,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {canUseProposals ? (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              className={`h-10 cursor-pointer rounded-md text-sm font-semibold transition ${section === 'documents' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              onClick={() => setSection('documents')}
            >
              Документы
            </button>
            <button
              type="button"
              className={`h-10 cursor-pointer rounded-md text-sm font-semibold transition ${section === 'proposals' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              onClick={() => setSection('proposals')}
            >
              Предложения
            </button>
          </div>
        ) : null}
        {canUseProposals && section === 'proposals' ? (
          <LabeledContainer
            label="Коммерческие предложения"
            help="Создайте шаблон с текстом, блоками, фото и видео. Затем в редакторе мероприятия или заказа создайте КП на его основе, настройте варианты и цены, опубликуйте и отправьте клиенту ссылку. Сам шаблон клиенту не отправляется."
            noMargin
          >
            <ProposalTemplatesPanel enabled={canUseProposals} />
          </LabeledContainer>
        ) : !canUseDocuments ? (
          <Notice tone="warning" className="rounded p-3">
            Работа с документами недоступна на текущем тарифе.
          </Notice>
        ) : (
          <LabeledContainer label="Работа с документами" noMargin>
            <div className="flex w-full flex-col gap-3">
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() =>
                    modalsFunc.settings?.artistRequisitesEditor?.()
                  }
                >
                  Редактировать реквизиты
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Инструкция DOCX',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: DocxDocumentsGuide,
                    })
                  }
                >
                  Открыть инструкцию DOCX
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-800">
                    Шаблоны документов
                  </div>
                  <button
                    type="button"
                    className="action-icon-button action-icon-button--warning tablet:w-auto flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                    onClick={() => openTemplateEditor()}
                  >
                    Добавить шаблон
                  </button>
                </div>
                {documentTemplates.length === 0 ? (
                  <div className="rounded border border-gray-200 p-3 text-sm text-gray-500">
                    Шаблоны еще не загружены.
                  </div>
                ) : (
                  <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
                    {documentTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="document-template-card flex items-start gap-3 rounded border border-gray-200 p-3"
                      >
                        <div className="min-w-0 flex-1 break-words">
                          <div className="text-sm font-semibold text-gray-800">
                            {template.name}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {getDocumentTypeLabel(
                              template.type,
                              template.customTypeName
                            )}{' '}
                            · {template.fileName}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <IconActionButton
                            icon={faPencilAlt}
                            variant="warning"
                            size="sm"
                            title="Редактировать"
                            onClick={() => openTemplateEditor(template)}
                          />
                          <IconActionButton
                            icon={faTrashAlt}
                            variant="danger"
                            size="sm"
                            title="Удалить"
                            onClick={async () => {
                              if (!window.confirm('Удалить шаблон документа?'))
                                return
                              await saveDocumentTemplates(
                                documentTemplates.filter(
                                  (item) => item.id !== template.id
                                )
                              )
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL}
                    download
                    className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] inline-flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                  >
                    Скачать пример договора
                  </a>
                  <a
                    href={DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL}
                    download
                    className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] inline-flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                  >
                    Скачать пример акта
                  </a>
                </div>
              </div>
            </div>
          </LabeledContainer>
        )}
      </div>
    </div>
  )
}

export default DocumentsContent
