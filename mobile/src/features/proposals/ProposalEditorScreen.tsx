import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Modal, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import * as DocumentPicker from 'expo-document-picker'
import {
  Button,
  CompactField,
  Notice,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../shared/ui/components'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import {
  proposalsApi,
  type Proposal,
  type ProposalTemplate,
  type ProposalBlock,
  type ProposalMedia,
  type ProposalPackage,
} from './api'
import {
  ProposalPackagesEditor,
  type CatalogService,
} from './ProposalPackagesEditor'
import { RichTextEditor } from './RichTextEditor'
import { ProposalPreview } from './ProposalPreview'
import { useProposalIdentity } from './identity'
import { proposalOperations } from './operations'
import { proposalPatch } from './proposalPatch'
import { normalizeProposalMedia } from './proposalMedia.generated'
const blockLabels: Record<string, string> = {
  header: 'Шапка',
  packagesIntro: 'Описание под шапкой',
  packagesOutro: 'Описание после вариантов',
  closing: 'Условия и контакты',
  cover: 'Обложка',
  intro: 'Вступление',
  packages: 'Варианты',
  media: 'Медиа',
  benefits: 'Преимущества',
  terms: 'Условия',
  contacts: 'Контакты',
  cta: 'Призыв к действию',
}
const mediaLabels = {
  image: 'Фото',
  video: 'Видео',
  video_link: 'Ссылка на видео',
}
type Draft = {
  title: string
  status: string
  blocks: ProposalBlock[]
  media: ProposalMedia[]
  packages: ProposalPackage[]
  servicesIds: string[]
  defaults?: ProposalTemplate['defaults']
  message: string
  validUntil: string
  contentRevision?: number
  conditionsLocked?: boolean
  appearance: {
    theme: 'classic' | 'light' | 'blue' | 'dark'
    logoUrl: string
    logoAlignment?: 'left' | 'center' | 'right'
  }
}
const fromTemplate = (item: ProposalTemplate): Draft => ({
  title: item.name,
  status: item.status,
  blocks: item.editorBlocks ?? item.blocks,
  contentRevision: item.contentRevision,
  media: item.media,
  packages: item.defaults.packages,
  servicesIds: item.defaults.servicesIds,
  defaults: item.defaults,
  message: item.messageTemplate,
  validUntil: '',
  appearance: item.appearance || { theme: 'classic', logoUrl: '' },
})
const fromProposal = (item: Proposal): Draft => ({
  title: item.title,
  status: item.status,
  blocks: item.editorBlocks ?? item.blocksSnapshot,
  media: item.mediaSnapshot,
  packages: item.packages,
  servicesIds: [],
  message: item.messageText,
  validUntil: item.validUntil ? item.validUntil.slice(0, 10) : '',
  contentRevision: item.contentRevision ?? 0,
  conditionsLocked: Boolean(
    item.applyOperation ||
    item.applicationPending ||
    item.appliedAt ||
    item.appliedPackageId ||
    item.appliedSelectionAt
  ),
  appearance: item.appearance || { theme: 'classic', logoUrl: '' },
})
export type ProposalEditorScreenProps = {
  kind: 'template' | 'proposal'
  id: string
  eventId?: string
  sourceProposalId?: string
  initialPreview?: boolean
}
export function ProposalEditorScreen(props: ProposalEditorScreenProps) {
  const identity = useProposalIdentity()
  return identity ? (
    <IdentityEditor
      key={`${identity}:${props.kind}:${props.id}:${props.eventId || ''}:${props.sourceProposalId || ''}`}
      {...props}
      identity={identity}
    />
  ) : null
}
function IdentityEditor({
  identity,
  kind,
  id,
  eventId,
  sourceProposalId,
  initialPreview = false,
}: ProposalEditorScreenProps & { identity: string }) {
  const navigation = useNavigation(),
    styles = useThemeStyles(createStyles)
  const [draft, setDraft] = useState<Draft | null>(null),
    [services, setServices] = useState<CatalogService[]>([]),
    [catalogError, setCatalogError] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(true)
  const serviceRevision = useRef(0)
  const [creation, setCreation] = useState(() =>
    kind === 'template' && id === 'new'
      ? proposalOperations.get(identity, 'create-template', 'new')
      : undefined
  )
  const lifetime = useRef(new AbortController())
  const [readError, setReadError] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [videoLink, setVideoLink] = useState(''),
    [attempt, setAttempt] = useState(0),
    [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const baseline = useRef(''),
    targetId = useRef(id === 'new' ? undefined : id),
    alive = useRef(true),
    generation = useRef(0),
    lock = useRef(false),
    [uploadKey] = useState(() => Crypto.randomUUID())
  const operation = useCallback(
    () => ({
      expectedIdentity: identity,
      signal: lifetime.current.signal,
    }),
    [identity]
  )
  useEffect(
    () =>
      proposalOperations.subscribe(() => {
        if (alive.current && kind === 'template' && id === 'new')
          setCreation(
            proposalOperations.get(identity, 'create-template', 'new')
          )
      }),
    [identity, kind, id]
  )
  const isTemplate = kind === 'template',
    dirty = Boolean(draft && JSON.stringify(draft) !== baseline.current),
    editable = true,
    conditionsLocked = !isTemplate && Boolean(draft?.conditionsLocked),
    blocked = busy || pending || Boolean(creation)
  usePreventRemove(dirty || blocked, ({ data }) => {
    if (lock.current) return
    Alert.alert('Есть несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      {
        text: 'Выйти без сохранения',
        style: 'destructive',
        onPress: () => {
          if (alive.current && !lock.current) navigation.dispatch(data.action)
        },
      },
    ])
  })
  const templateBody = (value: Draft): Record<string, unknown> => ({
    name: value.title,
    status: value.status,
    blocks: value.blocks,
    media: value.media,
    messageTemplate: value.message,
    appearance: value.appearance,
    defaults: {
      ...value.defaults,
      packages: value.packages,
      servicesIds: value.servicesIds,
    },
  })
  const body = (value: Draft, full = false): Record<string, unknown> => {
    if (!isTemplate) return proposalPatch(value, baseline.current)
    const payload = templateBody(value)
    if (full || !targetId.current || !baseline.current) return payload
    const original = templateBody(JSON.parse(baseline.current) as Draft)
    return { ...(value.contentRevision !== undefined ? { contentRevision: value.contentRevision } : {}), ...Object.fromEntries(
      Object.entries(payload).filter(
        ([key, item]) => JSON.stringify(item) !== JSON.stringify(original[key])
      )
    ) }
  }
  const change = (patch: Partial<Draft>) => {
    if (!draft || !alive.current || lock.current || creation || !editable)
      return
    if (conditionsLocked && patch.packages) return
    setDraft({ ...draft, ...patch })
    setMessage('')
    setError('')
  }
  const fetchServices = async () => {
    const token = generation.current,
      revision = ++serviceRevision.current
    setServicesLoading(true)
    try {
      const items = await proposalsApi.services(operation())
      if (
        alive.current &&
        token === generation.current &&
        revision === serviceRevision.current
      ) {
        setServices(items)
        setCatalogError(false)
      }
    } catch {
      if (
        alive.current &&
        token === generation.current &&
        revision === serviceRevision.current
      )
        setCatalogError(true)
    } finally {
      if (
        alive.current &&
        token === generation.current &&
        revision === serviceRevision.current
      )
        setServicesLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    lifetime.current = new AbortController()
    const token = ++generation.current
    targetId.current = id === 'new' ? undefined : id
    baseline.current = ''
    setDraft(null)
    setReadError('')
    setPreview(null)
    setMessage('')
    setError('')
    lock.current = false
    setBusy(false)
    setPending(false)
    void fetchServices()
    void (async () => {
      try {
        let next: Draft
        if (isTemplate) {
          const restored = id === 'new' ? await proposalsApi.restoreTemplate(operation()) : null
          const item =
            restored || (id === 'new'
              ? sourceProposalId
                ? { ...(await proposalsApi.templateFromProposal(sourceProposalId, operation())), _id: 'new' }
                : {
                  _id: 'new',
                  name: '',
                  status: 'active' as const,
                  ...(await proposalsApi.templateDefaults(operation())),
                }
              : await proposalsApi.template(id, operation()))
          next = fromTemplate(item)
        } else {
          const item = await proposalsApi.get(id, operation())
          if (eventId && item.eventId !== eventId) throw Error('EVENT_MISMATCH')
          next = fromProposal(item)
        }
        if (!alive.current || token !== generation.current) return
        baseline.current = JSON.stringify(next)
        setDraft(next)
        if (initialPreview) {
          try {
            const data = isTemplate
              ? await proposalsApi.previewTemplate(
                  id,
                  body(next, true),
                  operation()
                )
              : await proposalsApi.previewProposal(id, body(next), operation())
            if (alive.current && token === generation.current) setPreview(data)
          } catch {
            if (alive.current && token === generation.current)
              setError('Предпросмотр недоступен. Изменения не сохранены.')
          }
        }
      } catch {
        if (alive.current && token === generation.current)
          setReadError('Не удалось загрузить редактор.')
      }
    })()
    return () => {
      alive.current = false
      lifetime.current.abort()
      generation.current++
    }
  }, [kind, id, eventId, sourceProposalId, attempt])
  const run = async (work: () => Promise<void>, failure: string) => {
    if (lock.current || !alive.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    const token = generation.current
    try {
      await work()
    } catch (cause) {
      if (alive.current && token === generation.current) {
        const readbackId = (cause as { readbackId?: string })?.readbackId
        if (readbackId) {
          targetId.current = readbackId
          if (isTemplate && id === 'new')
            setCreation(
              proposalOperations.get(identity, 'create-template', 'new')
            )
        }
        if (cause instanceof Error && cause.message === 'CREATION_CANCELLED') {
          targetId.current = undefined
          setMessage('Попытка создания отменена. Можно изменить форму и сохранить заново.')
        } else if (cause instanceof Error && cause.message === 'CREATED_RESOURCE_GONE') {
          targetId.current = undefined
          setError('Созданный шаблон уже удалён. Он не восстановлен. При необходимости сохраните форму как новый шаблон.')
        } else setError(failure)
      }
    } finally {
      if (alive.current && token === generation.current) {
        lock.current = false
        setBusy(false)
      }
    }
  }
  const save = () => {
    if (!draft || blocked || !editable) return
    if (
      !draft.title.trim() ||
      !draft.packages.length ||
      draft.packages.some(
        (p) => !p.title.trim() || p.lines.some((l) => !l.title.trim())
      )
    ) {
      setError('Укажите название и названия вариантов/позиций.')
      return
    }
    if (
      draft.validUntil &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(draft.validUntil) ||
        !Number.isFinite(new Date(draft.validUntil).getTime()) ||
        new Date(draft.validUntil).toISOString().slice(0, 10) !==
          draft.validUntil)
    ) {
      setError('Срок: ГГГГ-ММ-ДД или пустое поле.')
      return
    }
    const token = generation.current
    void run(async () => {
      const item = isTemplate
        ? await proposalsApi.saveTemplate(
            targetId.current,
            body(draft),
            operation()
          )
        : await proposalsApi.save(id, body(draft), operation())
      if (!alive.current || token !== generation.current) return
      targetId.current = item._id
      setCreation(undefined)
      const next = isTemplate
        ? fromTemplate(item as ProposalTemplate)
        : fromProposal(item as Proposal)
      baseline.current = JSON.stringify(next)
      setDraft(next)
      setMessage('Сохранено')
    }, 'Не удалось сохранить. Введённые данные сохранены на экране.')
  }
  const recoverCreation = () => {
    if ((!creation?.id && !creation?.recoverable) || busy || lock.current) return
    const token = generation.current
    void run(async () => {
      const item = await proposalsApi.recoverTemplate(operation())
      if (!alive.current || token !== generation.current) return
      const next = fromTemplate(item)
      targetId.current = item._id
      baseline.current = JSON.stringify(next)
      setDraft(next)
      setCreation(undefined)
      setMessage('Сохранено')
    }, 'Не удалось перечитать созданный шаблон. Повторите чтение.')
  }
  const cancelCreation = () => {
    if (!creation?.recoverable || creation.inflight || busy || lock.current) return
    const cancel = () => void run(async () => {
      const token = generation.current
      const item = await proposalsApi.cancelTemplate(operation())
      if (!alive.current || token !== generation.current) return
      setCreation(undefined)
      targetId.current = item?._id
      if (item) {
        const next = fromTemplate(item)
        baseline.current = JSON.stringify(next)
        setDraft(next)
        setMessage('Шаблон уже был сохранён. Открыта сохранённая версия.')
      } else setMessage('Попытка создания отменена. Можно изменить форму и сохранить заново.')
    }, 'Не удалось подтвердить отмену. Продолжите проверку отмены.')
    if (creation.cancelRequested) cancel()
    else Alert.alert('Отменить попытку создания?', 'Форма останется на экране. Если шаблон уже сохранён, откроется его сохранённая версия; она не будет удалена.', [
      { text: 'Назад', style: 'cancel' }, { text: 'Отменить попытку', onPress: cancel },
    ])
  }
  const showPreview = () => {
    if (!draft || blocked) return
    const token = generation.current
    void run(async () => {
      const data = isTemplate
        ? await proposalsApi.previewTemplate(
            targetId.current || 'new',
            body(draft, true),
            operation()
          )
        : await proposalsApi.previewProposal(id, body(draft), operation())
      if (alive.current && token === generation.current) setPreview(data)
    }, 'Предпросмотр недоступен. Изменения не сохранены.')
  }
  const patchBlock = (index: number, patch: Partial<ProposalBlock>) => {
    if (draft)
      change({
        blocks: draft.blocks.map((block, i) =>
          i === index ? { ...block, ...patch } : block
        ),
      })
  }
  const move = (index: number, delta: number) => {
    if (!draft) return
    const blocks = [...draft.blocks]
    ;[blocks[index], blocks[index + delta]] = [
      blocks[index + delta],
      blocks[index],
    ]
    change({ blocks })
  }
  const upload = (mediaKind: 'image' | 'video', logo = false) => {
    if (!draft || blocked || !editable || (!logo && draft.media.length >= 10))
      return
    const token = generation.current
    void run(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          mediaKind === 'image'
            ? ['image/png', 'image/jpeg', 'image/webp']
            : ['video/mp4'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !alive.current || token !== generation.current)
        return
      const asset = result.assets[0]
      const url = logo
        ? isTemplate
          ? await proposalsApi.uploadTemplateLogo(
              targetId.current || 'new',
              asset,
              operation()
            )
          : await proposalsApi.uploadLogo(targetId.current!, asset, operation())
        : await proposalsApi.uploadGallery(
            kind,
            targetId.current || uploadKey,
            asset,
            operation()
          )
      if (!alive.current || token !== generation.current) return
      // Mutations here affect the local draft only; cloud upload never saves a КП.
      setDraft({
        ...draft,
        ...(logo
          ? { appearance: { ...draft.appearance, logoUrl: url } }
          : {
              media: [
                ...draft.media,
                {
                  id: Crypto.randomUUID(),
                  kind: mediaKind,
                  url,
                  title: asset.name,
                  fileName: asset.name,
                  contentType: asset.mimeType || '',
                  size: asset.size || 0,
                },
              ],
            }),
      })
    }, 'Не удалось загрузить медиа. Введённые данные сохранены на экране.')
  }
  const removeTemplate = () => {
    const confirmationToken = generation.current
    if (!isTemplate || !targetId.current || blocked) return
    Alert.alert(
      'Удалить шаблон?',
      'Использованный шаблон будет архивирован. Сохранённые КП не изменятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            if (!alive.current || confirmationToken !== generation.current)
              return
            const token = generation.current
            void run(async () => {
              const result = await proposalsApi.removeTemplate(
                targetId.current!,
                operation()
              )
              if (!alive.current || token !== generation.current) return
              if (result.archived && draft) {
                const next = { ...draft, status: 'archived' }
                setDraft(next)
                baseline.current = JSON.stringify(next)
                setMessage('Шаблон архивирован')
              } else {
                setDraft(null)
                setReadError('Шаблон удалён и отсутствие подтверждено.')
              }
            }, 'Удаление не подтверждено. Повторите чтение шаблона.')
          },
        },
      ]
    )
  }
  const modernSections = Boolean(
    draft &&
    ['header', 'packagesIntro', 'closing'].every((type) =>
      draft.blocks.some((block) => block.type === type)
    )
  )
  // Keep the persisted snapshot intact. Missing optional sections are only
  // materialized after an explicit user action; legacy blocks are not removed.
  const editorBlocks = !draft
    ? []
    : modernSections
      ? ['header', 'packagesIntro', 'packages', 'packagesOutro', 'closing'].map(
          (type) =>
            draft.blocks.find((block) => block.type === type) || {
              id: type,
              type,
              enabled: false,
              contentHtml: '',
            }
        )
      : draft.blocks
  const updateSection = (
    block: ProposalBlock,
    patch: Partial<ProposalBlock>
  ) => {
    if (!draft) return
    const index = draft.blocks.findIndex((item) => item.type === block.type)
    if (index < 0) change({ blocks: [...draft.blocks, { ...block, ...patch }] })
    else patchBlock(index, patch)
  }
  const moveMedia = (index: number, delta: number) => {
    if (
      !draft ||
      blocked ||
      index + delta < 0 ||
      index + delta >= draft.media.length
    )
      return
    const media = [...draft.media]
    ;[media[index], media[index + delta]] = [media[index + delta], media[index]]
    change({ media })
  }
  const addVideoLink = () => {
    if (!draft || blocked || draft.media.length >= 10) return
    const media = normalizeProposalMedia([
      {
        id: Crypto.randomUUID(),
        kind: 'video_link',
        url: videoLink,
        title: 'Видео',
      },
    ]) as ProposalMedia[]
    if (!media.length) {
      setError(
        'Укажите корректную http(s)-ссылку на VK Video, Rutube, YouTube или Vimeo'
      )
      return
    }
    change({ media: [...draft.media, ...media] })
    setVideoLink('')
  }
  const packagesEditor = draft ? (
    <>
      <SectionTitle>Варианты предложения</SectionTitle>
      {servicesLoading ? <Notice message="Загружаем каталог услуг…" /> : null}
      {catalogError ? (
        <>
          <Notice
            tone="warning"
            message="Каталог услуг не загрузился. Снимки позиций сохранены; повторите чтение каталога."
          />
          <Button
            title="Повторить каталог"
            variant="secondary"
            onPress={() => void fetchServices()}
            disabled={busy}
          />
        </>
      ) : null}
      <ProposalPackagesEditor
        packages={draft.packages}
        services={services}
        catalogUnavailable={catalogError || servicesLoading}
        disabled={conditionsLocked || !editable || busy || Boolean(creation)}
        onChange={(packages) => change({ packages })}
        onPendingChange={setPending}
      />
    </>
  ) : null
  return (
    <Screen keyboardShouldPersistTaps="handled">
      <PageHeader
        title={
          isTemplate
            ? 'Шаблон коммерческого предложения'
            : 'Коммерческое предложение'
        }
        subtitle={
          dirty
            ? 'Есть несохранённые изменения'
            : 'Варианты, текст и медиа для клиента'
        }
      />
      {!draft ? (
        readError ? (
          <>
            <Notice tone="danger" message={readError} />
            <Button
              title="Повторить чтение"
              variant="secondary"
              onPress={() => setAttempt((a) => a + 1)}
            />
          </>
        ) : (
          <Notice message="Загружаем редактор…" />
        )
      ) : (
        <>
          {error ? <Notice tone="danger" message={error} /> : null}
          {creation ? (
            <>
              <Notice
                tone="warning"
                message={
                  creation.cancelRequested
                    ? 'Отмена ещё не подтверждена. Завершите её проверку; сохранённый шаблон не будет удалён.'
                    : creation.id
                    ? 'Создание не подтверждено чтением. Повторите точное чтение шаблона.'
                    : creation.recoverable ? 'Создание не подтверждено. Форма сохранена на устройстве. Продолжите эту попытку без создания дубля.'
                    : 'Результат создания неизвестен. Проверьте шаблоны; для этой старой попытки автоматическое восстановление недоступно.'
                }
              />
              {!creation.cancelRequested && (creation.id || creation.recoverable) ? (
                <Button
                  title={creation.id ? 'Повторить чтение созданного шаблона' : 'Продолжить создание шаблона'}
                  variant="secondary"
                  disabled={busy}
                  onPress={recoverCreation}
                />
              ) : null}
              {creation.recoverable && (!creation.id || creation.cancelRequested) ? (
                <Button title={creation.cancelRequested ? 'Завершить отмену' : 'Отменить попытку создания'}
                  variant="secondary" disabled={busy || creation.inflight} onPress={cancelCreation} />
              ) : null}
            </>
          ) : null}
          {message ? <Notice tone="success" message={message} /> : null}
          {draft.status === 'published' ? (
            <Notice message="Изменения сохранят прежнюю ссылку КП. Если изменить ещё не применённые условия, клиенту потребуется выбрать вариант заново." />
          ) : null}
          {conditionsLocked ? (
            <Notice message="Варианты программ зафиксированы. Все остальные поля, включая условия и контакты, можно редактировать. Принятый выбор и данные заказа сохранятся." />
          ) : null}
          <Surface>
            <CompactField
              label={isTemplate ? 'Название шаблона' : 'Название предложения'}
              help={getFieldHelp('proposal.title')}
              value={draft.title}
              editable={editable && !blocked}
              maxLength={isTemplate ? 160 : 200}
              onChangeText={(title) => change({ title })}
            />
            <CompactField
              label="Сообщение для отправки"
              help={getFieldHelp(
                isTemplate ? 'proposal.templateMessage' : 'proposal.message'
              )}
              value={draft.message}
              multiline
              editable={editable && !blocked}
              maxLength={4000}
              onChangeText={(message) => change({ message })}
            />
            {!isTemplate ? (
              <>
                <CompactField
                  label="Действует до (ГГГГ-ММ-ДД)"
                  help={getFieldHelp('proposal.expiresAt')}
                  value={draft.validUntil}
                  editable={editable && !blocked}
                  maxLength={10}
                  onChangeText={(validUntil) => change({ validUntil })}
                />
              </>
            ) : null}
            <SectionTitle>Оформление клиентской страницы</SectionTitle>
            <View style={styles.row}>
              {(
                [
                  ['classic', 'Классика'],
                  ['light', 'Светлое'],
                  ['blue', 'Синее'],
                  ['dark', 'Тёмное'],
                ] as const
              ).map(([theme, title]) => (
                <Button
                  key={theme}
                  title={`${draft.appearance.theme === theme ? '✓ ' : ''}${title}`}
                  variant="secondary"
                  disabled={!editable || blocked}
                  onPress={() =>
                    change({ appearance: { ...draft.appearance, theme } })
                  }
                  style={styles.flex}
                />
              ))}
            </View>
            <View style={styles.row}>
              {(['left', 'center', 'right'] as const).map((logoAlignment) => (
                <Button
                  key={logoAlignment}
                  title={`${(draft.appearance.logoAlignment || 'left') === logoAlignment ? '✓ ' : ''}Логотип: ${{ left: 'слева', center: 'по центру', right: 'справа' }[logoAlignment]}`}
                  disabled={blocked}
                  variant="secondary"
                  onPress={() =>
                    change({
                      appearance: { ...draft.appearance, logoAlignment },
                    })
                  }
                />
              ))}
            </View>
            <Button
              title="Загрузить логотип"
              variant="secondary"
              disabled={!editable || blocked}
              onPress={() => upload('image', true)}
            />
            {draft.appearance.logoUrl ? (
              <>
                <Text style={styles.muted}>Логотип загружен</Text>
                <Button
                  title="Убрать логотип"
                  variant="secondary"
                  disabled={!editable || blocked}
                  onPress={() =>
                    change({
                      appearance: { ...draft.appearance, logoUrl: '' },
                    })
                  }
                />
              </>
            ) : null}
            {isTemplate ? (
              <Button
                title={
                  draft.status === 'active'
                    ? 'Архивировать при сохранении'
                    : 'Вернуть в активные при сохранении'
                }
                variant="secondary"
                disabled={blocked}
                onPress={() =>
                  change({
                    status: draft.status === 'active' ? 'archived' : 'active',
                  })
                }
              />
            ) : null}
          </Surface>
          {!modernSections ? packagesEditor : null}
          <SectionTitle help={getFieldHelp('proposal.blocks')}>
            Блоки клиентской страницы
          </SectionTitle>
          {editorBlocks.map((block, index) => (
            <Surface key={block.id || block.type}>
              {modernSections &&
              block.enabled !== false &&
              ['header', 'closing'].includes(block.type) ? (
                <SectionTitle>{blockLabels[block.type]}</SectionTitle>
              ) : (
                <Button
                  title={`${block.enabled !== false ? '✓ ' : '○ '}${blockLabels[block.type] || 'Блок'} · ${block.enabled !== false ? 'показывается' : 'скрыт'}`}
                  variant="secondary"
                  disabled={!editable || blocked}
                  onPress={() =>
                    updateSection(block, { enabled: block.enabled === false })
                  }
                />
              )}
              {block.enabled !== false ? (
                <>
                  {!modernSections || block.type === 'packages' ? (
                    <CompactField
                      label={
                        modernSections
                          ? 'Заголовок вариантов'
                          : `Заголовок блока ${index + 1}`
                      }
                      value={block.title || ''}
                      maxLength={300}
                      editable={editable && !blocked}
                      onChangeText={(title) => updateSection(block, { title })}
                    />
                  ) : null}
                  {modernSections && block.type === 'packages'
                    ? packagesEditor
                    : null}
                  {[
                    'intro',
                    'benefits',
                    'terms',
                    'cta',
                    'header',
                    'packagesIntro',
                    'packagesOutro',
                    'closing',
                  ].includes(block.type) ? (
                    <RichTextEditor
                      kind={kind}
                      id={targetId.current || uploadKey}
                      block={block}
                      value={block.contentHtml}
                      disabled={
                        !editable ||
                        busy ||
                        pending ||
                        Boolean(creation)
                      }
                      onBusyChange={setPending}
                      operation={operation}
                      onChange={(contentHtml) =>
                        updateSection(block, { contentHtml })
                      }
                    />
                  ) : block.type === 'cover' ? (
                    <CompactField
                      label="Подзаголовок"
                      value={block.text || ''}
                      multiline
                      maxLength={8000}
                      editable={editable && !blocked}
                      onChangeText={(text) => updateSection(block, { text })}
                    />
                  ) : null}
                </>
              ) : null}
              {!modernSections ? (
                <View style={styles.row}>
                  <Button
                    title="Выше"
                    variant="secondary"
                    disabled={
                      !editable || blocked || index === 0
                    }
                    onPress={() => move(index, -1)}
                    style={styles.flex}
                  />
                  <Button
                    title="Ниже"
                    variant="secondary"
                    disabled={
                      !editable ||
                      blocked ||
                      index === draft.blocks.length - 1
                    }
                    onPress={() => move(index, 1)}
                    style={styles.flex}
                  />
                </View>
              ) : null}
            </Surface>
          ))}
          <Surface>
            <SectionTitle>Медиа предложения</SectionTitle>
            {draft.media.map((media, index) => (
              <View key={media.id} style={{ gap: 8 }}>
                <Text style={styles.text}>
                  {media.title || media.fileName || mediaLabels[media.kind]}
                </Text>
                <View style={styles.row}>
                  <Button
                    title={`Выше: ${media.title || media.fileName || mediaLabels[media.kind]}`}
                    variant="secondary"
                    disabled={blocked || index === 0}
                    onPress={() => moveMedia(index, -1)}
                  />
                  <Button
                    title={`Ниже: ${media.title || media.fileName || mediaLabels[media.kind]}`}
                    variant="secondary"
                    disabled={blocked || index === draft.media.length - 1}
                    onPress={() => moveMedia(index, 1)}
                  />
                </View>
                <Button
                  title="Удалить медиа из предложения"
                  variant="danger"
                  disabled={!editable || blocked}
                  onPress={() =>
                    Alert.alert(
                      'Убрать медиа?',
                      'Файл больше не будет показан в этом предложении.',
                      [
                        { text: 'Отмена', style: 'cancel' },
                        {
                          text: 'Убрать',
                          style: 'destructive',
                          onPress: () =>
                            change({
                              media: draft.media.filter(
                                (m) => m.id !== media.id
                              ),
                            }),
                        },
                      ]
                    )
                  }
                />
              </View>
            ))}
            <CompactField
              label="Ссылка на видео"
              value={videoLink}
              onChangeText={setVideoLink}
              maxLength={2000}
              autoCapitalize="none"
              editable={!blocked && draft.media.length < 10}
            />
            <Button
              title="Добавить видео-ссылку"
              variant="secondary"
              disabled={
                blocked || !videoLink.trim() || draft.media.length >= 10
              }
              onPress={addVideoLink}
            />
            <Text style={styles.muted}>
              До 10 файлов или ссылок. JPG, PNG, WebP до 10 МБ; MP4 до 50 МБ.
            </Text>
            <View style={styles.row}>
              <Button
                title="Добавить фото в медиа"
                variant="secondary"
                disabled={!editable || blocked || draft.media.length >= 10}
                onPress={() => upload('image')}
                style={styles.flex}
              />
              <Button
                title="Добавить видео в медиа"
                variant="secondary"
                disabled={!editable || blocked || draft.media.length >= 10}
                onPress={() => upload('video')}
                style={styles.flex}
              />
            </View>
          </Surface>
          <Button
            testID="proposal-preview"
            title="Предпросмотр для клиента"
            variant="secondary"
            disabled={blocked}
            onPress={showPreview}
          />
          <Button
            testID="proposal-save"
            title="Сохранить"
            loading={busy}
            disabled={!editable || blocked}
            onPress={save}
          />
          {isTemplate && targetId.current ? (
            <Button
              title="Удалить шаблон"
              variant="danger"
              disabled={blocked || dirty}
              onPress={removeTemplate}
            />
          ) : null}
        </>
      )}
      <Modal
        visible={Boolean(preview)}
        onRequestClose={() => setPreview(null)}
        animationType="slide"
      >
        <Screen scroll={false}>
          <Notice message="Клиентский вид текущего черновика. Предпросмотр не сохраняет изменения и не фиксирует выбор клиента." />
          <Button
            title="Закрыть предпросмотр"
            variant="secondary"
            onPress={() => setPreview(null)}
          />
          {preview ? <ProposalPreview data={preview} /> : null}
        </Screen>
      </Modal>
    </Screen>
  )
}
const createStyles = (p: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    flex: { flexGrow: 1, flexBasis: 130 },
    text: { fontFamily: typography.fontFamily, color: p.text, fontSize: 16 },
    muted: {
      fontFamily: typography.fontFamily,
      color: p.cardMuted,
      fontSize: 13,
    },
  })
