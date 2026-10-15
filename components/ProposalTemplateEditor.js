'use client'

import fieldHelp from '@helpers/fieldHelp.json'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { faTrashAlt } from '@fortawesome/free-regular-svg-icons'
import AppButton from '@components/AppButton'
import FormWrapper from '@components/FormWrapper'
import IconActionButton from '@components/IconActionButton'
import Input from '@components/Input'
import Notice from '@components/Notice'
import ProposalPackagesEditor from '@components/ProposalPackagesEditor'
import ProposalContentEditor from '@components/ProposalContentEditor'
import ProposalPageView from '@components/ProposalPageView'
import Textarea from '@components/Textarea'
import { apiJson } from '@helpers/apiClient'
import { sendFile } from '@helpers/cloudinary'
import { resolveUploadedFileUrl } from '@helpers/escalionCloudUpload.mjs'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'
import { useServicesQuery } from '@helpers/useEntityQueries'
import {
  DEFAULT_PROPOSAL_MESSAGE,
  toProposalEditorBlocks,
  normalizeProposalTemplateDefaults,
  renderProposalVariables,
} from '@helpers/proposalContent'
import { calculatePackageTotal } from '@helpers/proposalWorkflow'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '@helpers/proposalRichText'
import loggedUserAtom from '@state/atoms/loggedUserAtom'

const MAX_TEMPLATE_MEDIA = 10
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_TYPES = ['video/mp4']
// Примеры для предпросмотра считаются один раз при загрузке модуля.
const PREVIEW_EVENT_DATE = new Date(
  Date.now() + 30 * 86400000
).toLocaleDateString('ru-RU')
const PREVIEW_VALID_UNTIL = new Date(Date.now() + 7 * 86400000).toISOString()

const emptyPackage = () => ({
  id: 'main',
  title: 'Основной вариант',
  description: '',
  lines: [],
  total: 0,
  manualTotal: false,
  recommended: true,
})

// Шаблон хранит те же варианты, что и КП: перечень услуг, описание, цену,
// отметку «Рекомендуем» и ручной итог. Шаблоны старого формата (один список
// услуг) сервер отдаёт уже переведёнными в вариант.
const buildDraft = (template, artist) => {
  const defaults = normalizeProposalTemplateDefaults(template?.defaults)
  return {
    _id: template?._id || null,
    name: template?.name || '',
    status: template?.status === 'archived' ? 'archived' : 'active',
    blocks: toProposalEditorBlocks(template?.blocks, {
      ...artist,
      fullName: getPersonFullName(artist),
    }),
    messageTemplate: template?.messageTemplate || DEFAULT_PROPOSAL_MESSAGE,
    media: Array.isArray(template?.media) ? template.media : [],
    packages: defaults.packages.length ? defaults.packages : [emptyPackage()],
  }
}

const ProposalTemplateEditor = ({
  template,
  onSaved,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
  setOnShowOnCloseConfirmDialog,
}) => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const {
    data: servicesData,
    isPending: servicesLoading,
    isError: servicesError,
  } = useServicesQuery()
  const services = useMemo(
    () => (Array.isArray(servicesData) ? servicesData : []),
    [servicesData]
  )
  const initial = useMemo(
    () => buildDraft(template, loggedUser),
    [template, loggedUser]
  )
  const [draft, setDraft] = useState(() => initial)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial))
  const [uploadKey] = useState(() => template?.uploadKey || crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef(null)

  const isChanged = JSON.stringify(draft) !== baseline
  const mediaDirectory = `proposal-templates/${
    draft._id || uploadKey || 'draft'
  }`
  const validPackages = draft.packages.filter(
    (item) => String(item.title || '').trim().length > 0
  )
  const canSave =
    draft.name.trim().length > 0 &&
    validPackages.length === draft.packages.length

  const previewVariables = useMemo(() => {
    const titles = draft.packages
      .flatMap((item) => item.lines.map((line) => line.title))
      .filter(Boolean)
    const total = draft.packages.reduce(
      (sum, item) =>
        sum +
        (item.manualTotal
          ? Number(item.total) || 0
          : calculatePackageTotal(item.lines)),
      0
    )
    return {
      proposal: { url: 'https://vedelo.ru/proposal/…' },
      client: { firstName: 'Анна', fullName: 'Анна Петрова' },
      event: {
        type: 'Свадьба',
        date: PREVIEW_EVENT_DATE,
        services: titles.join(', '),
        sum: formatMoney(total),
      },
      artist: {
        firstName: loggedUser?.firstName || '',
        fullName: getPersonFullName(loggedUser) || loggedUser?.firstName || '',
        phone: loggedUser?.phone || '',
        telegram: loggedUser?.telegram || '',
      },
    }
  }, [draft.packages, loggedUser])

  const previewProposal = useMemo(() => {
    const recommended =
      draft.packages.find((item) => item.recommended) || draft.packages[0]
    return {
      title: draft.name || 'Персональное предложение',
      blocks: draft.blocks.map((block) => ({
        ...block,
        title: renderProposalVariables(block.title || '', previewVariables)
          .text,
        contentHtml: renderProposalRichTextVariables(
          getProposalBlockContentHtml(block),
          previewVariables
        ).html,
      })),
      packages: draft.packages.map((item) => ({
        ...item,
        total: item.manualTotal
          ? Number(item.total) || 0
          : calculatePackageTotal(item.lines),
      })),
      media: draft.media,
      client: previewVariables.client,
      artist: previewVariables.artist,
      validUntil: PREVIEW_VALID_UNTIL,
      selectedPackageId: '',
      expired: false,
      recommendedPackageId: recommended?.id || '',
    }
  }, [draft.blocks, draft.media, draft.name, draft.packages, previewVariables])

  const hasLines = draft.packages.some((item) => item.lines.length > 0)

  const uploadMedia = useCallback(
    async (file) => {
      if (!file || saving) return
      const isImage = IMAGE_TYPES.includes(file.type)
      const isVideo = VIDEO_TYPES.includes(file.type)
      const limit = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
      if (!isImage && !isVideo) {
        setError('Разрешены JPG, PNG, WebP до 10 МБ и MP4 до 50 МБ')
        return
      }
      if (file.size > limit) {
        setError('Разрешены JPG, PNG, WebP до 10 МБ и MP4 до 50 МБ')
        return
      }
      setError('')
      setSaving(true)
      const uploadResult = await sendFile(file, null, mediaDirectory)
      const url = resolveUploadedFileUrl(uploadResult, {
        directory: mediaDirectory,
      })
      if (url) {
        setDraft((current) => ({
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
          ].slice(0, MAX_TEMPLATE_MEDIA),
        }))
      } else {
        setError('Не удалось загрузить файл')
      }
      setSaving(false)
    },
    [mediaDirectory, saving]
  )

  const save = useCallback(async () => {
    setError('')
    setSaving(true)
    const payload = {
      name: draft.name.trim(),
      status: draft.status,
      blocks: draft.blocks,
      messageTemplate: draft.messageTemplate,
      media: draft.media || [],
      defaults: {
        packages: draft.packages,
        // Совместимость со старым форматом: услуги основного варианта.
        servicesIds: [
          ...new Set(
            draft.packages
              .flatMap((item) => item.lines.map((line) => line.serviceId))
              .filter(Boolean)
              .map(String)
          ),
        ],
      },
    }
    const url = draft._id
      ? `/api/proposal-templates/${draft._id}`
      : '/api/proposal-templates'
    try {
      await apiJson(url, {
        method: draft._id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      if (typeof onSaved === 'function') onSaved()
      closeModal()
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось сохранить шаблон')
    } finally {
      setSaving(false)
    }
  }, [closeModal, draft, onSaved])

  useEffect(() => {
    setDisableConfirm(!canSave || saving)
    setOnShowOnCloseConfirmDialog(isChanged)
    setOnConfirmFunc(canSave && !saving ? save : undefined)
  }, [
    canSave,
    isChanged,
    save,
    saving,
    setDisableConfirm,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
  ])

  return (
    <FormWrapper className="flex h-full flex-col gap-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Input
        label="Название шаблона"
        value={draft.name}
        onChange={(name) => setDraft((current) => ({ ...current, name }))}
        maxLength={160}
        fullWidth
        required
        noMargin
      />
      <Textarea
        label="Сообщение для чата"
        value={draft.messageTemplate}
        onChange={(messageTemplate) =>
          setDraft((current) => ({ ...current, messageTemplate }))
        }
        help={fieldHelp['proposal.templateMessage']}
      />
      <ProposalContentEditor
        blocks={draft.blocks}
        onChange={(blocks) => setDraft((current) => ({ ...current, blocks }))}
        artist={loggedUser}
        directory={mediaDirectory}
        mediaEditor={
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="font-semibold">
              Фото и видео ({draft.media?.length || 0}/{MAX_TEMPLATE_MEDIA})
            </div>
            {(draft.media || []).length ? (
              <div className="tablet:grid-cols-2 mt-3 grid gap-2">
                {(draft.media || []).map((item, index) => (
                  <div
                    key={item.id || item.url}
                    className="flex items-center justify-between gap-2 rounded border p-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.title || item.url}
                    </span>
                    <IconActionButton
                      icon={faTrashAlt}
                      variant="danger"
                      size="xs"
                      title={`Удалить «${item.title || item.url}»`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          media: current.media.filter(
                            (_, mediaIndex) => mediaIndex !== index
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-500">
                Медиа пока не добавлено. Картинки и видео можно вставить и прямо
                в текст блока.
              </div>
            )}
            <div className="tablet:flex-row mt-3 flex flex-col items-start gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                className="text-xs"
                disabled={saving}
                onChange={(event) => {
                  void uploadMedia(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
              <AppButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  const url = window.prompt(
                    'Ссылка на VK Video, Rutube или YouTube'
                  )
                  if (url)
                    setDraft((current) => ({
                      ...current,
                      media: [
                        ...(current.media || []),
                        {
                          id: crypto.randomUUID(),
                          kind: 'video_link',
                          url,
                          title: 'Видео',
                        },
                      ].slice(0, MAX_TEMPLATE_MEDIA),
                    }))
                }}
              >
                Добавить ссылку на видео
              </AppButton>
            </div>
          </div>
        }
      >
        <ProposalPackagesEditor
          packages={draft.packages}
          onChange={(packages) =>
            setDraft((current) => ({ ...current, packages }))
          }
          services={services}
          servicesLoading={servicesLoading}
          servicesError={servicesError}
          busy={saving}
          hint="Варианты, позиции и цены шаблона попадают в каждое новое предложение по этому шаблону."
        />
      </ProposalContentEditor>
      <div>
        <AppButton
          size="sm"
          variant="secondary"
          aria-expanded={showPreview}
          onClick={() => setShowPreview((current) => !current)}
        >
          {showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр для клиента'}
        </AppButton>
      </div>
      {showPreview ? (
        <div className="rounded-2xl border border-gray-200 bg-stone-100 p-2">
          {hasLines ? null : (
            <Notice tone="info" className="mb-2">
              Позиции не добавлены: при создании предложения вариант заполнится
              услугами заявки. Ниже — пример оформления.
            </Notice>
          )}
          <ProposalPageView preview proposal={previewProposal} />
        </div>
      ) : null}
    </FormWrapper>
  )
}

export default ProposalTemplateEditor
