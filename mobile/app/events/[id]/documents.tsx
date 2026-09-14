import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../../src/shared/api/client'
import type { DocumentTemplate, Event } from '../../../src/shared/domain/types'
import {
  getCachedEntity,
  upsertEntities,
} from '../../../src/shared/storage/cache'
import { saveLocalEntity } from '../../../src/shared/storage/mutations'
import {
  decryptToTemporaryFile,
  deleteEncryptedFile,
  deleteTemporaryDecryptedFile,
  encryptAndQueueFile,
  listEncryptedFiles,
  retryFileQueueNow,
  type EncryptedLocalFile,
} from '../../../src/shared/storage/encryptedFiles'
import { runSync } from '../../../src/shared/sync/syncEngine'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Screen,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../../src/shared/ui/components'
import { colors, radius, spacing } from '../../../src/shared/ui/theme'

const typeLabel: Record<DocumentTemplate['type'], string> = {
  contract: 'Договор',
  act: 'Акт',
  invoice: 'Счёт',
  receipt: 'Чек',
  other: 'Документ',
}

export default function EventDocumentsScreen() {
  const terms = useWorkItemTerminology()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [event, setEvent] = useState<Event | null>(null)
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [localFiles, setLocalFiles] = useState<EncryptedLocalFile[]>([])
  const [templateId, setTemplateId] = useState('')
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadLocal = useCallback(async () => {
    if (!id) return
    const [cachedEvent, queuedFiles] = await Promise.all([
      getCachedEntity<Event>('events', id),
      listEncryptedFiles({ entityType: 'events', entityId: id }),
    ])
    setEvent(cachedEvent)
    setLocalFiles(queuedFiles)
  }, [id])

  useEffect(() => {
    void loadLocal()
    api
      .get<{ success: true; data: DocumentTemplate[] }>(
        '/mobile/v1/document-templates'
      )
      .then((response) => {
        setTemplates(response.data)
        setTemplateId((current) => current || response.data[0]?.id || '')
      })
      .catch(() => {
        // Local attachments remain available without network access.
      })
  }, [loadLocal])
  useFocusEffect(
    useCallback(() => {
      void loadLocal()
    }, [loadLocal])
  )

  const pickAttachment = async () => {
    if (!event) return
    setError('')
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      await encryptAndQueueFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        entityType: 'events',
        entityId: event._id,
        attachmentKind: 'entityDocument',
      })
      await loadLocal()
      setLoading(true)
      await runSync()
      await loadLocal()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось добавить вложение'
      )
    } finally {
      setLoading(false)
    }
  }

  const retryAttachments = async () => {
    setLoading(true)
    setError('')
    try {
      await retryFileQueueNow({ entityType: 'events', entityId: id })
      await runSync()
      await loadLocal()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось отправить вложения'
      )
    } finally {
      setLoading(false)
    }
  }

  const shareLocalFile = async (file: EncryptedLocalFile) => {
    let uri = ''
    try {
      uri = await decryptToTemporaryFile(file)
      await Sharing.shareAsync(uri, {
        mimeType: file.mimeType,
        dialogTitle: file.name,
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось открыть вложение'
      )
    } finally {
      if (uri) await deleteTemporaryDecryptedFile(uri).catch(() => undefined)
    }
  }

  const removeQueuedFile = (file: EncryptedLocalFile) =>
    Alert.alert(
      'Удалить локальное вложение?',
      file.status === 'synced'
        ? `Локальная зашифрованная копия будет удалена. Файл останется в ${terms.prepositional}.`
        : 'Файл не будет отправлен на сервер.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await deleteEncryptedFile(file.id)
            await loadLocal()
          },
        },
      ]
    )

  const removeUploadedFile = (url: string) =>
    Alert.alert(
      `Убрать вложение из ${terms.genitive}?`,
      'Файл в облачном хранилище не будет удалён автоматически.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: async () => {
            if (!event) return
            const updated = await saveLocalEntity({
              entityType: 'events',
              entityId: event._id,
              values: {
                documentFiles: (event.documentFiles || []).filter(
                  (file) => file.url !== url
                ),
              },
            })
            const local = localFiles.find((file) => file.remoteUrl === url)
            if (local) await deleteEncryptedFile(local.id)
            setEvent(updated as Event)
            await loadLocal()
            await queryClient.invalidateQueries({
              queryKey: ['cached-entities', 'events'],
            })
          },
        },
      ]
    )

  const generate = async () => {
    if (!templateId) {
      setError('Сначала добавьте или выберите DOCX-шаблон')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await api.post<{
        success: true
        data: { event: Event }
      }>(`/mobile/v1/events/${id}/documents/generate`, {
        templateId,
        documentDate,
      })
      setEvent(response.data.event)
      await upsertEntities('events', [response.data.event])
      await queryClient.invalidateQueries({
        queryKey: ['cached-entities', 'events'],
      })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось сформировать документ'
      )
    } finally {
      setLoading(false)
    }
  }

  const remove = (documentId: string) =>
    Alert.alert(
      `Убрать документ из ${terms.genitive}?`,
      'Файл в облачном хранилище не будет удалён автоматически.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: async () => {
            if (!event) return
            const document = event.documents?.find(
              (item) => item.id === documentId
            )
            const updated = document?.file?.storageKey
              ? (
                  await api.delete<{
                    success: true
                    data: { entity: Event }
                  }>(`/mobile/v1/events/${event._id}/files`, {
                    documentId,
                    deleteId: documentId,
                  })
                ).data.entity
              : ((await saveLocalEntity({
                  entityType: 'events',
                  entityId: event._id,
                  values: {
                    documents: (event.documents || []).filter(
                      (item) => item.id !== documentId
                    ),
                  },
                })) as Event)
            await upsertEntities('events', [updated])
            const local = localFiles.find(
              (file) => file.remoteUrl === documentId
            )
            if (local) await deleteEncryptedFile(local.id)
            setEvent(updated as Event)
            await queryClient.invalidateQueries({
              queryKey: ['cached-entities', 'events'],
            })
          },
        },
      ]
    )

  const openDocument = async (
    url: string,
    title: string,
    documentId?: string,
    storageKey?: string
  ) => {
    if (storageKey && documentId) {
      const response = await api.post<{
        success: true
        data: { url: string }
      }>(`/mobile/v1/events/${id}/files/access-url`, {
        documentId,
        disposition: 'inline',
      })
      url = response.data.url
    }
    if (!url) return
    const supported = await Linking.canOpenURL(url)
    if (supported) await Linking.openURL(url)
    else await Share.share({ title, message: url })
  }

  const shareDocument = async (
    document: NonNullable<Event['documents']>[number]
  ) => {
    const local = localFiles.find((file) => file.remoteUrl === document.id)
    if (local) {
      await shareLocalFile(local)
      return
    }
    let url = document.url || document.file?.url || ''
    if (document.file?.storageKey) {
      const response = await api.post<{
        success: true
        data: { url: string }
      }>(`/mobile/v1/events/${id}/files/access-url`, {
        documentId: document.id,
        disposition: 'attachment',
      })
      url = response.data.url
    }
    if (url) {
      await Share.share({ title: document.title || 'Документ', message: url })
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Файлы и документы"
        subtitle={event?.eventType || 'Договоры, акты и вложения'}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <Surface>
        <SectionTitle>Сформировать по шаблону</SectionTitle>
        {templates.length ? (
          <View style={styles.options}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => setTemplateId(template.id)}
                style={[
                  styles.option,
                  templateId === template.id && styles.optionActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    templateId === template.id && styles.optionTextActive,
                  ]}
                >
                  {template.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>
            Сначала добавьте шаблон в разделе «Ещё → Документы».
          </Text>
        )}
        <Field
          testID="document-date"
          label="Дата документа"
          value={documentDate}
          onChangeText={setDocumentDate}
          placeholder="2026-07-15"
        />
        <Button
          testID="generate-document"
          title="Сформировать и прикрепить DOCX"
          onPress={generate}
          loading={loading}
          disabled={!templates.length || event?.status === 'draft'}
        />
        {event?.status === 'draft' ? (
          <Text style={styles.warning}>
            Формирование договора и акта доступно после подтверждения заявки, а
            произвольные файлы можно добавить уже сейчас.
          </Text>
        ) : null}
      </Surface>
      <Surface>
        <SectionTitle>Файлы и изображения</SectionTitle>
        <Text style={styles.muted}>
          До 5 МБ. В авиарежиме файл шифруется и ждёт восстановления сети.
        </Text>
        <Button
          testID="add-event-attachment"
          title="Добавить вложение"
          variant="secondary"
          onPress={pickAttachment}
          loading={loading}
        />
        {localFiles
          .filter((file) => file.status !== 'synced')
          .map((file) => (
            <View key={file.id} style={styles.row}>
              <MaterialCommunityIcons
                name="file-clock-outline"
                size={23}
                color={
                  file.status === 'failed' ? colors.danger : colors.warning
                }
              />
              <Pressable
                style={styles.grow}
                onPress={() => void shareLocalFile(file)}
              >
                <Text style={styles.title}>{file.name}</Text>
                <Text style={styles.muted}>
                  {Math.max(1, Math.round(file.size / 1024))} КБ
                </Text>
                {file.lastError ? (
                  <Text style={styles.errorText}>{file.lastError}</Text>
                ) : null}
              </Pressable>
              <StatusChip
                label={
                  file.status === 'failed'
                    ? 'Ошибка'
                    : file.status === 'uploading'
                      ? 'Отправляется'
                      : 'Ожидает отправки'
                }
                tone={file.status === 'failed' ? 'danger' : 'warning'}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить ${file.name}`}
                hitSlop={10}
                onPress={() => removeQueuedFile(file)}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={23}
                  color={colors.danger}
                />
              </Pressable>
            </View>
          ))}
        {localFiles.some((file) => file.status === 'failed') ? (
          <Button
            testID="retry-event-attachments"
            title="Повторить отправку"
            variant="secondary"
            onPress={retryAttachments}
            loading={loading}
          />
        ) : null}
        {event?.documentFiles?.map((file) => {
          const encrypted = localFiles.find(
            (item) => item.remoteUrl === file.url
          )
          return (
            <View key={file.url} style={styles.row}>
              <MaterialCommunityIcons
                name={
                  file.type?.startsWith('image/')
                    ? 'image-outline'
                    : 'paperclip'
                }
                size={23}
                color={colors.primary}
              />
              <Pressable
                style={styles.grow}
                onPress={() =>
                  encrypted
                    ? void shareLocalFile(encrypted)
                    : void openDocument(file.url, file.name || 'Вложение')
                }
              >
                <Text style={styles.title}>{file.name || 'Вложение'}</Text>
                <Text style={styles.muted}>
                  {file.size
                    ? `${Math.max(1, Math.round(file.size / 1024))} КБ`
                    : `Файл ${terms.genitive}`}
                  {encrypted ? ' · доступен без сети' : ''}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${file.name || 'вложение'}`}
                hitSlop={10}
                onPress={() => removeUploadedFile(file.url)}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={23}
                  color={colors.danger}
                />
              </Pressable>
            </View>
          )
        })}
      </Surface>
      <SectionTitle>Сформированные документы</SectionTitle>
      {event?.documents?.length ? (
        event.documents.map((document) => {
          const url = document.url || document.file?.url || ''
          return (
            <Surface key={document.id}>
              <View
                testID={`generated-document-${document.id}`}
                style={styles.row}
              >
                <View style={styles.icon}>
                  <MaterialCommunityIcons
                    name="file-document-outline"
                    size={23}
                    color={colors.primary}
                  />
                </View>
                <Pressable
                  style={styles.grow}
                  onPress={() =>
                    openDocument(
                      url,
                      document.title || 'Документ',
                      document.id,
                      document.file?.storageKey
                    )
                  }
                >
                  <Text style={styles.title}>
                    {document.title || typeLabel[document.type]}
                  </Text>
                  <Text style={styles.muted}>
                    {document.file?.name || url || 'Документ'}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`share-document-${document.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Поделиться документом ${document.title || typeLabel[document.type]}`}
                  hitSlop={10}
                  onPress={() => void shareDocument(document)}
                  disabled={!url && !document.file?.storageKey}
                >
                  <MaterialCommunityIcons
                    name="share-variant-outline"
                    size={22}
                    color={colors.primary}
                  />
                </Pressable>
                <Pressable
                  testID={`remove-document-${document.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Убрать документ ${document.title || typeLabel[document.type]}`}
                  hitSlop={10}
                  onPress={() => remove(document.id)}
                >
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={23}
                    color={colors.danger}
                  />
                </Pressable>
              </View>
            </Surface>
          )
        })
      ) : (
        <EmptyState
          title="Документов пока нет"
          description="Сформируйте DOCX по шаблону или добавьте файл выше."
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
})
