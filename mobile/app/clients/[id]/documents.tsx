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
import type { Client } from '../../../src/shared/domain/types'
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
import {
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Screen,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../../src/shared/ui/components'
import { colors, spacing } from '../../../src/shared/ui/theme'

export default function ClientDocumentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [client, setClient] = useState<Client | null>(null)
  const [localFiles, setLocalFiles] = useState<EncryptedLocalFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadLocal = useCallback(async () => {
    if (!id) return
    const [cachedClient, queuedFiles] = await Promise.all([
      getCachedEntity<Client>('clients', id),
      listEncryptedFiles({ entityType: 'clients', entityId: id }),
    ])
    setClient(cachedClient)
    setLocalFiles(queuedFiles)
  }, [id])

  useEffect(() => {
    void loadLocal()
  }, [loadLocal])
  useFocusEffect(useCallback(() => void loadLocal(), [loadLocal]))

  const refreshQueries = () =>
    queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })

  const pickAttachment = async () => {
    if (!client || client._id.startsWith('local-')) {
      setError('Сначала дождитесь сохранения клиента на сервере')
      return
    }
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
        entityType: 'clients',
        entityId: client._id,
        attachmentKind: 'entityDocument',
      })
      await loadLocal()
      setLoading(true)
      await runSync()
      await loadLocal()
      await refreshQueries()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось добавить файл'
      )
    } finally {
      setLoading(false)
    }
  }

  const retryAttachments = async () => {
    setLoading(true)
    setError('')
    try {
      await retryFileQueueNow({ entityType: 'clients', entityId: id })
      await runSync()
      await loadLocal()
      await refreshQueries()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось отправить файлы'
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
        reason instanceof Error ? reason.message : 'Не удалось открыть файл'
      )
    } finally {
      if (uri) await deleteTemporaryDecryptedFile(uri).catch(() => undefined)
    }
  }

  const openDocument = async (
    document: NonNullable<Client['documents']>[number]
  ) => {
    let url = document.url || document.file?.url || ''
    if (document.file?.storageKey) {
      const response = await api.post<{ success: true; data: { url: string } }>(
        `/mobile/v1/clients/${id}/files/access-url`,
        { documentId: document.id, disposition: 'inline' }
      )
      url = response.data.url
    }
    if (!url) return
    const supported = await Linking.canOpenURL(url)
    if (supported) await Linking.openURL(url)
    else await Share.share({ title: document.title, message: url })
  }

  const removeQueuedFile = (file: EncryptedLocalFile) =>
    Alert.alert(
      'Удалить локальный файл?',
      'Файл не будет отправлен на сервер.',
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

  const removeDocument = (document: NonNullable<Client['documents']>[number]) =>
    Alert.alert(
      'Удалить документ клиента?',
      'Файл будет удалён из хранилища.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (!client) return
            try {
              const updated = document.file?.storageKey
                ? (
                    await api.delete<{
                      success: true
                      data: { entity: Client }
                    }>(`/mobile/v1/clients/${client._id}/files`, {
                      documentId: document.id,
                      deleteId: document.id,
                    })
                  ).data.entity
                : ((await saveLocalEntity({
                    entityType: 'clients',
                    entityId: client._id,
                    values: {
                      documents: (client.documents || []).filter(
                        (item) => item.id !== document.id
                      ),
                    },
                  })) as Client)
              await upsertEntities('clients', [updated])
              const local = localFiles.find(
                (file) => file.remoteUrl === document.id
              )
              if (local) await deleteEncryptedFile(local.id)
              setClient(updated)
              await refreshQueries()
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'Не удалось удалить документ'
              )
            }
          },
        },
      ]
    )

  return (
    <Screen>
      <PageHeader
        title="Файлы и документы"
        subtitle={
          [client?.firstName, client?.secondName].filter(Boolean).join(' ') ||
          'Клиент'
        }
      />
      {error ? <ErrorNotice message={error} /> : null}
      <Surface>
        <SectionTitle>Добавить файл</SectionTitle>
        <Text style={styles.muted}>
          PDF, DOCX, XLSX, CSV, TXT и изображения до 5 МБ. Без сети файл
          шифруется и ждёт отправки.
        </Text>
        <Button
          testID="add-client-attachment"
          title="Добавить файл"
          onPress={pickAttachment}
          loading={loading}
          disabled={!client || client._id.startsWith('local-')}
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
                  <Text style={styles.error}>{file.lastError}</Text>
                ) : null}
              </Pressable>
              <StatusChip
                label={file.status === 'failed' ? 'Ошибка' : 'Ожидает отправки'}
                tone={file.status === 'failed' ? 'danger' : 'warning'}
              />
              <Pressable hitSlop={10} onPress={() => removeQueuedFile(file)}>
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
            title="Повторить отправку"
            variant="secondary"
            onPress={retryAttachments}
            loading={loading}
          />
        ) : null}
      </Surface>
      <SectionTitle>Документы · {client?.documents?.length || 0}</SectionTitle>
      {client?.documents?.length ? (
        client.documents.map((document) => {
          const local = localFiles.find(
            (file) => file.remoteUrl === document.id
          )
          return (
            <Surface key={document.id}>
              <View style={styles.row}>
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={24}
                  color={colors.primary}
                />
                <Pressable
                  style={styles.grow}
                  onPress={() =>
                    local
                      ? void shareLocalFile(local)
                      : void openDocument(document)
                  }
                >
                  <Text style={styles.title}>
                    {document.title || document.file?.name || 'Документ'}
                  </Text>
                  <Text style={styles.muted}>
                    {document.file?.name || document.url || 'Файл'}
                    {local ? ' · доступен без сети' : ''}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={() => removeDocument(document)}
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
          description="Добавьте общий файл клиента: договор, реквизиты, смету или другой материал."
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
})
