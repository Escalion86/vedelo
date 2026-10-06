import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking, Share, StyleSheet, Text, View, Pressable } from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { DocumentTemplate, Event } from '../../shared/domain/types'
import { getCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { saveLocalEntity } from '../../shared/storage/mutations'
import { deleteEncryptedFile, encryptAndQueueFile, listEncryptedFiles, retryFileQueueNow, type EncryptedLocalFile } from '../../shared/storage/encryptedFiles'
import { runSync } from '../../shared/sync/syncEngine'
import { Button, CompactField, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { clientName } from '../clients/clientList'
import { DocumentAction, DocumentRowView } from './DocumentRow'
import { documentRows, fileSize, isServerEntityId, readEntityResponse, readTemplatesResponse, removeDocumentPatch, requireDocument, requireEntity, requireLocalFile, safeDocumentError, safeDocumentUrl, typeLabel, validDocumentDate, validatePickedFile, type DocumentEntity, type DocumentRow, type EntityKind } from './documentUi'
import { shareEncryptedFile } from './nativeFiles'
import { useDocumentTask } from './useDocumentTask'
import { documentDateForLocalDay } from './localDate'

export const EntityDocumentsScreen = ({ kind }: { kind: EntityKind }) => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const queryClient = useQueryClient()
  const [entity, setEntity] = useState<DocumentEntity | null>(null)
  const [files, setFiles] = useState<EncryptedLocalFile[]>([])
  const [readState, setReadState] = useState('loading')
  const [filesState, setFilesState] = useState('loading')
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [templateState, setTemplateState] = useState('loading')
  const [templateError, setTemplateError] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [documentDate, setDocumentDate] = useState(documentDateForLocalDay)
  const [message, setMessage] = useState('')
  const [generation, setGeneration] = useState<{ before: string[]; documentId?: string } | null>(null)
  const alive = useRef(false)
  const readToken = useRef(0)
  const templateToken = useRef(0)
  const confirming = useRef(false)
  const task = useDocumentTask(`${kind}:${id}`)
  const endpoint = `/mobile/v1/${kind}/${encodeURIComponent(id)}`
  useEffect(() => { if (task.phase) setMessage('') }, [task.phase])
  const loadLocal = useCallback(async () => {
    const token = ++readToken.current
    setReadState('loading'); setFilesState('loading')
    const [item, local] = await Promise.allSettled([getCachedEntity<DocumentEntity>(kind, id), listEncryptedFiles({ entityType: kind, entityId: id })])
    if (!alive.current || token !== readToken.current) return
    if (item.status === 'rejected') { setEntity(null); setReadState('error') }
    else if (!item.value) { setEntity(null); setReadState('missing') }
    else {
      try { setEntity(requireEntity(item.value, id)); setReadState('ready') }
      catch { setEntity(null); setReadState('error') }
    }
    if (local.status === 'rejected') { setFiles([]); setFilesState('error') }
    else { setFiles(local.value.filter((file) => file.entityType === kind && file.entityId === id)); setFilesState('ready') }
  }, [id, kind])
  const loadTemplates = useCallback(async () => {
    const token = ++templateToken.current
    setTemplateState('loading'); setTemplateError('')
    try {
      const result = readTemplatesResponse(await api.get('/mobile/v1/document-templates'))
      if (alive.current && token === templateToken.current) { setTemplates(result); setTemplateId((previous) => result.some((item) => item.id === previous) ? previous : result[0]?.id || ''); setTemplateState('ready') }
    } catch (cause) { if (alive.current && token === templateToken.current) { setTemplateState('error'); setTemplateError(safeDocumentError(cause, 'Не удалось загрузить шаблоны. Локальные вложения доступны отдельно.')) } }
  }, [])
  useEffect(() => { setMessage(''); setGeneration(null); setTemplateId(''); setEntity(null); setFiles([]) }, [id, kind])
  useFocusEffect(useCallback(() => {
    alive.current = true; void loadLocal(); if (kind === 'events') void loadTemplates()
    return () => { alive.current = false; readToken.current++; templateToken.current++ }
  }, [kind, loadLocal, loadTemplates]))
  const currentEntity = async () => requireEntity(await getCachedEntity<DocumentEntity>(kind, id), id)
  const freshFiles = () => listEncryptedFiles({ entityType: kind, entityId: id })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cached-entities', kind] })
  const commitRemote = async (remote: DocumentEntity, current: () => boolean) => {
    requireEntity(remote, id)
    const cached = await currentEntity()
    if (!current() || !alive.current) return
    // Не перетирать offline-правки полным ответом сервера.
    if (cached.syncStatus && cached.syncStatus !== 'synced') throw new Error('LOCAL_CHANGES_PENDING')
    const merged = { ...cached, ...remote }
    await upsertEntities(kind, [merged])
    if (!current() || !alive.current) return
    setEntity(merged); await invalidate()
  }
  const readRemote = async () => readEntityResponse(await api.get<{ success?: boolean; data?: DocumentEntity }>(endpoint), id)
  const pick = () => task.run('Выбираем и отправляем вложение…', 'Не удалось добавить файл. Проверьте локальную очередь и доступ.', async (current) => {
    const owner = await currentEntity()
    if (kind === 'clients' && !isServerEntityId(owner._id)) { task.setError('Сначала дождитесь сохранения клиента на сервере'); return }
    if (!current() || !alive.current) return
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    if (result.canceled || !current() || !alive.current) return
    const validation = validatePickedFile(result.assets[0])
    if (validation) { task.setError(validation); return }
    await currentEntity()
    if (!current() || !alive.current) return
    await encryptAndQueueFile({ ...result.assets[0], entityType: kind, entityId: owner._id, attachmentKind: 'entityDocument' })
    if (!current() || !alive.current) return
    await loadLocal()
    if (!current() || !alive.current) return
    await runSync()
    if (current() && alive.current) { await loadLocal(); await invalidate() }
  })
  const retry = () => task.run('Отправляем очередь вложений…', 'Не удалось отправить вложения. Проверьте сеть и тариф.', async (current) => {
    await currentEntity()
    const latest = await freshFiles()
    if (!current() || !alive.current) return
    for (const file of files.filter((item) => item.status === 'failed')) {
      if (!current() || !alive.current) return
      const fresh = requireLocalFile(latest, file, kind, id)
      await retryFileQueueNow({ id: fresh.id, entityType: kind, entityId: id })
    }
    await loadLocal()
    if (!current() || !alive.current) return
    await runSync()
    if (current() && alive.current) { await loadLocal(); await invalidate() }
  })
  const shareLocal = (file: EncryptedLocalFile) => task.run('Открываем локальную копию…', 'Не удалось открыть локальную копию вложения.', async (current) => {
    await currentEntity()
    const fresh = requireLocalFile(await freshFiles(), file, kind, id)
    await currentEntity()
    if (current() && alive.current) await shareEncryptedFile(fresh, () => current() && alive.current)
  })
  const open = (row: DocumentRow, share = false) => task.run(share ? 'Подготавливаем документ…' : 'Открываем документ…', 'Не удалось открыть документ. Проверьте доступ и повторите чтение.', async (current) => {
    const owner = await currentEntity()
    const document = requireDocument(owner, row)
    const latest = await freshFiles()
    const local = latest.find((item) => item.entityType === kind && item.entityId === id && item.status === 'synced' && item.remoteUrl === (document.legacyUrl || document.id))
    if (!current() || !alive.current) return
    if (local) { requireDocument(await currentEntity(), document); if (current() && alive.current) await shareEncryptedFile(requireLocalFile(latest, local, kind, id), () => current() && alive.current); return }
    let url = document.url || document.file?.url || ''
    if (document.file?.storageKey) {
      if (!isServerEntityId(owner._id)) throw new Error('LOCAL_ENTITY')
      const response = await api.post<{ success?: boolean; data?: { url?: string } }>(`${endpoint}/files/access-url`, { documentId: document.id, disposition: share ? 'attachment' : 'inline' })
      if (response?.success !== true) throw new Error('INVALID_RESPONSE')
      url = safeDocumentUrl(response.data?.url)
    }
    url = safeDocumentUrl(url)
    if (!current() || !alive.current) return
    // Повторная проверка принадлежности после сетевого запроса, перед native действием.
    requireDocument(await currentEntity(), document)
    if (!current() || !alive.current) return
    if (share) await Share.share({ title: document.title || 'Документ', message: url })
    else if (await Linking.canOpenURL(url)) { if (current() && alive.current) await Linking.openURL(url) }
    else if (current() && alive.current) await Share.share({ title: document.title || 'Документ', message: url })
  })
  const confirm = (title: string, text: string, perform: () => void) => {
    if (task.busy.current || confirming.current) return
    confirming.current = true
    Alert.alert(title, text, [
      { text: 'Отмена', style: 'cancel', onPress: () => { confirming.current = false } },
      { text: 'Удалить', style: 'destructive', onPress: () => { confirming.current = false; perform() } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false } })
  }
  const removeLocal = (file: EncryptedLocalFile) => confirm('Удалить локальную копию?', `«${file.name}». ${file.status === 'synced' ? 'Документ и файл на сервере останутся.' : 'Файл будет снят с очереди и не будет отправлен.'}`, () => { void task.run('Удаляем локальную копию…', 'Не удалось удалить локальную копию.', async (current) => {
    await currentEntity()
    const fresh = requireLocalFile(await freshFiles(), file, kind, id)
    if (!current() || !alive.current) return
    if (fresh.status === 'uploading') throw new Error('UPLOADING')
    await deleteEncryptedFile(fresh.id)
    if (current() && alive.current) await loadLocal()
  }) })
  const remove = (row: DocumentRow) => confirm(row.file?.storageKey ? 'Удалить документ и файл?' : 'Снять ссылку на документ?', `«${row.title || row.file?.name || 'Документ'}». ${row.file?.storageKey ? 'Приватный файл будет физически удалён из хранилища.' : 'Удаляется связь с этой записью. Файл по прежней ссылке останется в хранилище.'}`, () => { void task.run('Удаляем документ…', 'Не удалось подтвердить удаление документа. Повторите чтение перед следующим действием.', async (current) => {
    const owner = await currentEntity()
    const document = requireDocument(owner, row)
    if (!current() || !alive.current) return
    if (document.file?.storageKey) {
      if (!isServerEntityId(id) || (owner.syncStatus && owner.syncStatus !== 'synced')) throw new Error('LOCAL_CHANGES_PENDING')
      const response = await api.delete<{ success?: boolean; data?: { entity?: DocumentEntity } }>(`${endpoint}/files`, { documentId: document.id, deleteId: document.id })
      const updated = readEntityResponse({ success: response?.success, data: response.data?.entity }, id)
      if (!Array.isArray(updated.documents) || documentRows(updated).some((item) => item.id === document.id)) throw new Error('DELETE_NOT_CONFIRMED')
      if (!current() || !alive.current) return
      const readBack = await readRemote()
      if (!Array.isArray(readBack.documents) || documentRows(readBack).some((item) => item.id === document.id)) throw new Error('DELETE_NOT_CONFIRMED')
      await commitRemote(readBack, current)
    } else {
      const updated = await saveLocalEntity({ entityType: kind, entityId: id, values: removeDocumentPatch(owner, document) })
      requireEntity(updated as DocumentEntity, id)
      if (current() && alive.current) { setEntity(updated as DocumentEntity); await invalidate() }
    }
    if (current() && alive.current) setMessage(document.file?.storageKey ? 'Удаление документа подтверждено сервером' : 'Ссылка снята локально; изменение в очереди синхронизации')
  }) })
  const verifyGeneration = async (pending: { before: string[]; documentId?: string }, current: () => boolean) => {
    const remote = await readRemote()
    const found = remote.documents?.find((document) => pending.documentId ? document.id === pending.documentId : !pending.before.includes(document.id))
    await commitRemote(remote, current)
    if (!current() || !alive.current) return
    if (found && pending.documentId) { setGeneration(null); setMessage('Документ сформирован и прочитан с сервера') }
    else if (found) task.setError('Список обновлён. После потери ответа нельзя однозначно подтвердить создание. Проверьте новые документы перед повторным созданием.')
    else task.setError('Новый документ пока не найден. Проверьте позднее; автоматического повторного создания нет.')
  }
  const generate = () => {
    if (task.busy.current || generation || templateState !== 'ready' || readState !== 'ready') return
    if (!validDocumentDate(documentDate)) { task.setError('Введите корректную дату в формате ГГГГ-ММ-ДД'); return }
    void task.run('Формируем и проверяем документ…', 'Результат создания не подтверждён. Проверьте документы; повторный запрос может создать дубликат.', async (current) => {
      const owner = await currentEntity()
      if (kind !== 'events' || !isServerEntityId(id) || (owner as Event).status === 'draft' || (owner.syncStatus && owner.syncStatus !== 'synced')) throw new Error('GENERATION_UNAVAILABLE')
      const available = readTemplatesResponse(await api.get('/mobile/v1/document-templates'))
      if (!available.some((item) => item.id === templateId)) throw new Error('TEMPLATE_MISMATCH')
      if (!current() || !alive.current) return
      const pending = { before: (owner.documents || []).map((item) => item.id) }
      setGeneration(pending); setMessage('')
      let response: { success?: boolean; data?: { document?: DocumentRow; event?: DocumentEntity } }
      try { response = await api.post(`${endpoint}/documents/generate`, { templateId, documentDate }) }
      catch (cause) {
        const status = (cause as { status?: number })?.status
        if (status && status >= 400 && status < 500 && current() && alive.current) setGeneration(null)
        throw cause
      }
      const returned = readEntityResponse({ success: response?.success, data: response.data?.event }, id)
      const documentId = response.data?.document?.id
      if (!documentId || pending.before.includes(documentId) || !returned.documents?.some((item) => item.id === documentId)) throw new Error('INVALID_RESPONSE')
      if (!current() || !alive.current) return
      const expected = { ...pending, documentId }; setGeneration(expected)
      await verifyGeneration(expected, current)
    })
  }
  const blocked = Boolean(task.phase)
  if (readState === 'loading') return <Screen><PageHeader title="Файлы и документы" /><Notice message="Загрузка документов…" /></Screen>
  if (readState === 'error') return <Screen><PageHeader title="Файлы и документы" /><Notice tone="danger" message="Не удалось прочитать документы. Повторите чтение." /><Button title="Повторить чтение" onPress={() => void loadLocal()} /></Screen>
  if (!entity || entity._id !== id) return <Screen><PageHeader title="Файлы и документы" /><EmptyState title={kind === 'clients' ? 'Клиент не найден' : `Запись не найдена`} /><Button title="Повторить чтение" variant="secondary" onPress={() => void loadLocal()} /></Screen>
  const rows = documentRows(entity)
  const localClient = kind === 'clients' && !isServerEntityId(id)
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title="Файлы и документы" subtitle={kind === 'clients' ? clientName(entity) : (entity as Event).eventType || terms.labelCapitalized} />
    {task.error ? <Notice tone="danger" message={task.error} /> : null}
    {task.phase ? <Notice message={task.phase} /> : null}
    {message ? <Notice tone="success" message={message} /> : null}
    {localClient ? <Notice message="Сначала синхронизируйте клиента. После этого можно загружать файлы." /> : null}
    <Surface><SectionTitle>Документы · {rows.length}</SectionTitle>
      {rows.length ? rows.map((row) => <DocumentRowView key={row.id} title={row.title || row.file?.name || typeLabel(row.type, row.customTypeName)} subtitle={`${typeLabel(row.type, row.customTypeName)} · ${row.file?.name || (row.legacyUrl ? 'Прежнее вложение' : 'Ссылка на документ')} ${fileSize(row.file?.size)}`} disabled={blocked} onOpen={() => void open(row)}>
        <DocumentAction testID={`share-document-${row.id}`} icon="share-variant-outline" label={`Поделиться документом ${row.title || 'Документ'}`} onPress={() => void open(row, true)} disabled={blocked} />
        <DocumentAction testID={`remove-document-${row.id}`} icon="delete-outline" danger label={`Удалить документ ${row.title || 'Документ'}`} onPress={() => remove(row)} disabled={blocked} />
      </DocumentRowView>) : <EmptyState title="Документов пока нет" description={kind === 'events' ? 'Добавьте файл или сформируйте документ по шаблону.' : 'Добавьте файл клиента: договор, реквизиты, смету или другой материал.'} />}
      <Button testID={kind === 'clients' ? 'add-client-attachment' : 'add-event-attachment'} title="Добавить файл" onPress={() => void pick()} disabled={blocked || localClient || filesState !== 'ready'} />
      <Text style={styles.muted}>PDF, DOCX, XLSX, CSV, TXT и изображения до 5 МБ. Без сети файл шифруется и ждёт отправки.</Text>
    </Surface>
    <Surface><SectionTitle>Локальные копии и очередь{filesState === 'ready' ? ` · ${files.length}` : ''}</SectionTitle>
      {filesState === 'loading' ? <Notice message="Читаем локальные файлы…" /> : filesState === 'error' ? <><Notice tone="danger" message="Не удалось прочитать локальные файлы." /><Button title="Повторить чтение файлов" variant="secondary" onPress={() => void loadLocal()} disabled={blocked} /></> : files.length ? files.map((file) => <DocumentRowView key={file.id} title={file.name} subtitle={`${fileSize(file.size)} · локальная зашифрованная копия`} status={file.status} onOpen={() => void shareLocal(file)} disabled={blocked}>
        <DocumentAction icon="delete-outline" danger label={`Удалить локальную копию ${file.name}`} onPress={() => removeLocal(file)} disabled={blocked || file.status === 'uploading'} />
      </DocumentRowView>) : <EmptyState title="Локальных файлов пока нет" />}
      {files.some((file) => ['pending', 'failed'].includes(file.status)) ? <Button testID={`retry-${kind === 'clients' ? 'client' : 'event'}-attachments`} title="Повторить отправку" variant="secondary" onPress={() => void retry()} disabled={blocked || filesState !== 'ready'} /> : null}
    </Surface>
    {kind === 'events' ? <Surface><SectionTitle>Сформировать по шаблону</SectionTitle>
      {templateState === 'loading' ? <Notice message="Загружаем шаблоны…" /> : templateState === 'error' ? <><Notice tone="danger" message={templateError} /><Button title="Повторить чтение шаблонов" variant="secondary" onPress={() => void loadTemplates()} disabled={blocked} /></> : templates.length ? <View style={styles.options}>{templates.map((template) => <Pressable key={template.id} accessibilityRole="radio" accessibilityLabel={template.name} accessibilityState={{ selected: templateId === template.id, disabled: blocked || Boolean(generation) }} disabled={blocked || Boolean(generation)} onPress={() => setTemplateId(template.id)} style={[styles.option, templateId === template.id && styles.selected]}><Text style={styles.text}>{template.name}</Text><Text style={styles.muted}>{typeLabel(template.type, template.customTypeName)}</Text></Pressable>)}</View> : <Notice message="Сначала добавьте шаблон в разделе «Меню → Документы»." />}
      <CompactField testID="document-date" label="Дата документа" value={documentDate} onChangeText={setDocumentDate} placeholder="ГГГГ-ММ-ДД" editable={!blocked && !generation} />
      {!isServerEntityId(id) || (entity as Event).status === 'draft' || (entity.syncStatus && entity.syncStatus !== 'synced') ? <Notice tone="warning" message="Формирование доступно для сохранённой на сервере работы после подтверждения заявки и синхронизации изменений." /> : null}
      {generation ? <><Notice tone="warning" message="Проверяем результат предыдущего создания. Повторная генерация автоматически не выполняется." /><Button title="Проверить результат создания" variant="secondary" onPress={() => void task.run('Читаем результат создания…', 'Не удалось проверить результат. Повторите чтение позднее.', (current) => verifyGeneration(generation, current))} disabled={blocked} />
        <Button title="Разрешить новое создание после проверки" variant="secondary" disabled={blocked} onPress={() => {
          if (task.busy.current || confirming.current) return
          confirming.current = true
          Alert.alert('Создать ещё один документ?', 'Предыдущий запрос мог выполниться. Убедитесь, что нужного документа нет в списке. Новое создание может дать дубликат.', [
            { text: 'Отмена', style: 'cancel', onPress: () => { confirming.current = false } },
            { text: 'Разрешить новое создание', onPress: () => { confirming.current = false; if (task.isActive() && !task.busy.current && alive.current) { setGeneration(null); setMessage(''); task.setError('') } } },
          ], { cancelable: true, onDismiss: () => { confirming.current = false } })
        }} />
      </> : <Button testID="generate-document" title="Сформировать и прикрепить DOCX" onPress={generate} disabled={blocked || templateState !== 'ready' || !templateId || !isServerEntityId(id) || (entity as Event).status === 'draft' || Boolean(entity.syncStatus && entity.syncStatus !== 'synced')} />}
    </Surface> : null}
    <Button title="Повторить чтение" variant="secondary" onPress={() => { setMessage(''); void loadLocal() }} disabled={blocked} />
  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, text: { color: palette.text, fontSize: 14 }, options: { gap: 8 }, option: { minHeight: 40, padding: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, borderRadius: 4 }, selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
})
