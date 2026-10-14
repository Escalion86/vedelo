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
const blockLabels: Record<string, string> = {
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
  message: string
  validUntil: string
  appearance: { theme: 'classic' | 'light' | 'blue' | 'dark'; logoUrl: string }
}
const fromTemplate = (item: ProposalTemplate): Draft => ({
  title: item.name,
  status: item.status,
  blocks: item.blocks,
  media: item.media,
  packages: item.defaults.packages,
  servicesIds: item.defaults.servicesIds,
  message: item.messageTemplate,
  validUntil: '',
  appearance: { theme: 'classic', logoUrl: '' },
})
const fromProposal = (item: Proposal): Draft => ({
  title: item.title,
  status: item.status,
  blocks: item.blocksSnapshot,
  media: item.mediaSnapshot,
  packages: item.packages,
  servicesIds: [],
  message: item.messageText,
  validUntil: item.validUntil ? item.validUntil.slice(0, 10) : '',
  appearance: item.appearance || { theme: 'classic', logoUrl: '' },
})
export type ProposalEditorScreenProps = {
  kind: 'template' | 'proposal'
  id: string
  eventId?: string
  initialPreview?: boolean
}
export function ProposalEditorScreen(props: ProposalEditorScreenProps) {
  const identity = useProposalIdentity()
  return identity ? (
    <IdentityEditor
      key={`${identity}:${props.kind}:${props.id}:${props.eventId || ''}`}
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
    editable = isTemplate || draft?.status === 'draft',
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
  const body = (value: Draft): Record<string, unknown> =>
    isTemplate
      ? {
          name: value.title,
          status: value.status,
          blocks: value.blocks,
          media: value.media,
          messageTemplate: value.message,
          defaults: {
            packages: value.packages,
            servicesIds: value.servicesIds,
          },
        }
      : {
          title: value.title,
          blocks: value.blocks,
          media: value.media,
          packages: value.packages,
          messageText: value.message,
          validUntil: value.validUntil || null,
          appearance: value.appearance,
        }
  const change = (patch: Partial<Draft>) => {
    if (!draft || lock.current || !editable) return
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
          const item =
            id === 'new'
              ? {
                  _id: 'new',
                  name: '',
                  status: 'active' as const,
                  ...(await proposalsApi.templateDefaults(operation())),
                }
              : await proposalsApi.template(id, operation())
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
              ? await proposalsApi.previewTemplate(id, body(next), operation())
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
  }, [kind, id, eventId, attempt])
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
        setError(failure)
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
    if (!creation?.id || busy || lock.current) return
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
  const showPreview = () => {
    if (!draft || blocked) return
    const token = generation.current
    void run(async () => {
      const data = isTemplate
        ? await proposalsApi.previewTemplate(
            targetId.current || 'new',
            body(draft),
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
    if (!draft || blocked || !editable) return
    const token = generation.current
    void run(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          mediaKind === 'image'
            ? [
                'image/png',
                'image/jpeg',
                'image/webp',
                ...(!logo ? ['image/gif'] : []),
              ]
            : ['video/mp4', 'video/webm'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !alive.current || token !== generation.current)
        return
      const asset = result.assets[0]
      const url = logo
        ? await proposalsApi.uploadLogo(id, asset, operation())
        : await proposalsApi.uploadMedia(
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
                  creation.id
                    ? 'Создание не подтверждено чтением. Повторите точное чтение шаблона.'
                    : 'Результат создания неизвестен. Новое создание заблокировано: ответ сервера потерян. Проверьте шаблоны; автоматическое восстановление недоступно.'
                }
              />
              {creation.id ? (
                <Button
                  title="Повторить чтение созданного шаблона"
                  variant="secondary"
                  disabled={busy}
                  onPress={recoverCreation}
                />
              ) : null}
            </>
          ) : null}
          {message ? <Notice tone="success" message={message} /> : null}
          {!editable ? (
            <Notice message="Опубликованный снимок доступен для просмотра. Чтобы изменить его, создайте новую версию в списке КП." />
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
          <SectionTitle>Варианты предложения</SectionTitle>
          {servicesLoading ? (
            <Notice message="Загружаем каталог услуг…" />
          ) : null}
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
            disabled={!editable || busy || Boolean(creation)}
            onChange={(packages) => change({ packages })}
            onPendingChange={setPending}
          />
          <SectionTitle help={getFieldHelp('proposal.blocks')}>
            Блоки клиентской страницы
          </SectionTitle>
          {draft.blocks.map((block, index) => (
            <Surface key={block.id || block.type}>
              <Button
                title={`${block.enabled !== false ? '✓ ' : '○ '}${blockLabels[block.type] || 'Блок'} · ${block.enabled !== false ? 'показывается' : 'скрыт'}`}
                variant="secondary"
                disabled={!editable || blocked}
                onPress={() =>
                  patchBlock(index, { enabled: block.enabled === false })
                }
              />
              <CompactField
                label={`Заголовок блока ${index + 1}`}
                value={block.title || ''}
                maxLength={300}
                editable={editable && !blocked}
                onChangeText={(title) => patchBlock(index, { title })}
              />
              {['intro', 'benefits', 'terms', 'cta'].includes(block.type) ? (
                <RichTextEditor
                  kind={kind}
                  id={targetId.current || uploadKey}
                  block={block}
                  value={block.contentHtml}
                  disabled={!editable || busy || pending || Boolean(creation)}
                  onBusyChange={setPending}
                  operation={operation}
                  onChange={(contentHtml) => patchBlock(index, { contentHtml })}
                />
              ) : block.type === 'cover' ? (
                <CompactField
                  label="Подзаголовок"
                  value={block.text || ''}
                  multiline
                  maxLength={8000}
                  editable={editable && !blocked}
                  onChangeText={(text) => patchBlock(index, { text })}
                />
              ) : null}
              <View style={styles.row}>
                <Button
                  title="Выше"
                  variant="secondary"
                  disabled={!editable || blocked || index === 0}
                  onPress={() => move(index, -1)}
                  style={styles.flex}
                />
                <Button
                  title="Ниже"
                  variant="secondary"
                  disabled={
                    !editable || blocked || index === draft.blocks.length - 1
                  }
                  onPress={() => move(index, 1)}
                  style={styles.flex}
                />
              </View>
            </Surface>
          ))}
          <Surface>
            <SectionTitle>Медиа предложения</SectionTitle>
            {draft.media.map((media) => (
              <View key={media.id} style={{ gap: 8 }}>
                <Text style={styles.text}>
                  {media.title || media.fileName || mediaLabels[media.kind]}
                </Text>
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
