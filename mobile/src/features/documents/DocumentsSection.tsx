import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../../shared/api/client'
import type { DocumentTemplate } from '../../shared/domain/types'
import { getCachedEntity } from '../../shared/storage/cache'
import { deleteEncryptedFile, encryptAndQueueFile, listEncryptedFiles, retryFileQueueNow, type EncryptedLocalFile } from '../../shared/storage/encryptedFiles'
import { runSync } from '../../shared/sync/syncEngine'
import { Button, EmptyState, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { DocumentAction, DocumentRowView } from './DocumentRow'
import { fileSize, readTemplatesResponse, requireEntity, requireLocalFile, safeDocumentError, typeLabel, validatePickedFile, type DocumentEntity } from './documentUi'
import { downloadAndShareTemplate, shareEncryptedFile } from './nativeFiles'
import { useDocumentTask } from './useDocumentTask'

export const DocumentsSection = () => {
  const [files, setFiles] = useState<EncryptedLocalFile[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [fileState, setFileState] = useState('loading')
  const [templateState, setTemplateState] = useState('loading')
  const [templateError, setTemplateError] = useState('')
  const alive = useRef(false)
  const fileRead = useRef(0)
  const templateRead = useRef(0)
  const confirming = useRef(false)
  const task = useDocumentTask('documents')
  const checkOwner = async (file: EncryptedLocalFile) => {
    if (!file.entityType && !file.entityId) return
    if (!['events', 'clients'].includes(file.entityType || '') || !file.entityId) throw new Error('FILE_OWNER_MISMATCH')
    requireEntity(await getCachedEntity<DocumentEntity>(file.entityType!, file.entityId), file.entityId)
  }
  const loadFiles = useCallback(async () => {
    const token = ++fileRead.current
    setFileState('loading')
    try { const result = await listEncryptedFiles(); if (alive.current && token === fileRead.current) { setFiles(result); setFileState('ready') } }
    catch { if (alive.current && token === fileRead.current) setFileState('error') }
  }, [])
  const loadTemplates = useCallback(async () => {
    const token = ++templateRead.current
    setTemplateState('loading'); setTemplateError('')
    try {
      const result = readTemplatesResponse(await api.get('/mobile/v1/document-templates'))
      if (alive.current && token === templateRead.current) { setTemplates(result); setTemplateState('ready') }
    } catch (cause) { if (alive.current && token === templateRead.current) { setTemplateState('error'); setTemplateError(safeDocumentError(cause, 'Не удалось загрузить шаблоны.')) } }
  }, [])
  useFocusEffect(useCallback(() => { alive.current = true; void loadFiles(); void loadTemplates(); return () => { alive.current = false; fileRead.current++; templateRead.current++ } }, [loadFiles, loadTemplates]))
  const pick = () => task.run('Выбираем и отправляем файл…', 'Не удалось добавить файл. Проверьте очередь и повторите.', async (current) => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    if (result.canceled || !current() || !alive.current) return
    const file = result.assets[0]
    const error = validatePickedFile(file)
    if (error) { task.setError(error); return }
    await encryptAndQueueFile(file)
    if (!current() || !alive.current) return
    await loadFiles()
    if (!current() || !alive.current) return
    await runSync()
    if (current() && alive.current) await loadFiles()
  })
  const retry = () => task.run('Отправляем очередь…', 'Не удалось отправить файлы. Проверьте сеть и доступ.', async (current) => {
    const pending = await listEncryptedFiles()
    if (!current() || !alive.current) return
    // Только явно показанные файлы: не запускать retry чужой/новой строки по устаревшей карточке.
    for (const file of files.filter((item) => item.status === 'failed')) {
      requireLocalFile(pending, file)
      await checkOwner(file)
      if (!current() || !alive.current) return
      await retryFileQueueNow({ id: file.id })
    }
    if (!current() || !alive.current) return
    await loadFiles()
    if (!current() || !alive.current) return
    await runSync()
    if (current() && alive.current) await loadFiles()
  })
  const share = (file: EncryptedLocalFile) => task.run('Открываем локальную копию…', 'Не удалось открыть локальную копию файла.', async (current) => {
    const fresh = requireLocalFile(await listEncryptedFiles(), file)
    await checkOwner(fresh)
    if (current() && alive.current) await shareEncryptedFile(fresh, () => current() && alive.current)
  })
  const shareTemplate = (template: DocumentTemplate) => task.run('Скачиваем шаблон…', 'Не удалось скачать или отправить шаблон.', async (current) => {
    const fresh = readTemplatesResponse(await api.get('/mobile/v1/document-templates')).find((item) => item.id === template.id)
    if (!fresh) throw new Error('MISSING_TEMPLATE')
    if (current() && alive.current) await downloadAndShareTemplate(fresh, () => current() && alive.current)
  })
  const remove = (file: EncryptedLocalFile) => {
    if (task.busy.current || confirming.current) return
    confirming.current = true
    Alert.alert('Удалить локальную копию?', `«${file.name}». ${file.status === 'synced' ? 'Файл на сервере останется.' : 'Файл будет снят с локальной очереди и не будет отправлен.'}`, [
      { text: 'Отмена', style: 'cancel', onPress: () => { confirming.current = false } },
      { text: 'Удалить', style: 'destructive', onPress: () => { confirming.current = false; void task.run('Удаляем локальную копию…', 'Не удалось удалить локальную копию.', async (current) => {
        const fresh = requireLocalFile(await listEncryptedFiles(), file)
        await checkOwner(fresh)
        if (!current() || !alive.current || fresh.status === 'uploading') throw new Error('UPLOADING')
        await deleteEncryptedFile(fresh.id)
        if (current() && alive.current) await loadFiles()
      }) } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false } })
  }
  return <>
    {task.error ? <Notice tone="danger" message={task.error} /> : null}
    {task.phase ? <Notice message={task.phase} /> : null}
    <Surface><SectionTitle>Шаблоны документов{templateState === 'ready' ? ` · ${templates.length}` : ''}</SectionTitle>
      <Notice message="DOCX-шаблоны доступны при подключении к сети. Документы работ и клиентов открываются из их карточек." />
      {templateState === 'loading' ? <Notice message="Загружаем шаблоны…" /> : templateState === 'error' ? <><Notice tone="danger" message={templateError} /><Button title="Повторить чтение шаблонов" variant="secondary" onPress={() => void loadTemplates()} disabled={Boolean(task.phase)} /></> : templates.length ? templates.map((template) => <DocumentRowView key={template.id} title={template.name} subtitle={`${typeLabel(template.type, template.customTypeName)} · ${template.fileName} ${fileSize(template.size)}`} onOpen={() => router.push(`/more/documents/template/${encodeURIComponent(template.id)}` as never)} disabled={Boolean(task.phase)}>
        <DocumentAction icon="share-variant-outline" label={`Скачать и поделиться шаблоном ${template.name}`} onPress={() => void shareTemplate(template)} disabled={Boolean(task.phase)} />
        <DocumentAction icon="pencil-outline" warning label={`Редактировать шаблон ${template.name}`} onPress={() => router.push(`/more/documents/template/${encodeURIComponent(template.id)}` as never)} disabled={Boolean(task.phase)} />
      </DocumentRowView>) : <EmptyState title="Шаблоны ещё не добавлены" />}
      <Button title="Добавить DOCX-шаблон" onPress={() => router.push('/more/documents/template/new' as never)} disabled={Boolean(task.phase) || templateState !== 'ready'} />
    </Surface>
    <Surface><SectionTitle>Локальные файлы{fileState === 'ready' ? ` · ${files.length}` : ''}</SectionTitle>
      <Notice message="Зашифрованные копии и очередь на этом устройстве. Уже отправленные файлы остаются здесь как локальные копии." />
      {fileState === 'loading' ? <Notice message="Читаем локальные файлы…" /> : fileState === 'error' ? <><Notice tone="danger" message="Не удалось прочитать локальные файлы." /><Button title="Повторить чтение файлов" onPress={() => void loadFiles()} variant="secondary" /></> : files.length ? files.map((file) => <DocumentRowView key={file.id} title={file.name} subtitle={`${fileSize(file.size)}${file.entityType ? file.entityType === 'clients' ? ' · файл клиента' : ' · файл работы' : ' · общий файл'}`} status={file.status} onOpen={() => void share(file)} disabled={Boolean(task.phase)}>
        <DocumentAction icon="delete-outline" danger label={`Удалить локальную копию ${file.name}`} onPress={() => remove(file)} disabled={Boolean(task.phase) || file.status === 'uploading'} />
      </DocumentRowView>) : <EmptyState title="Локальных файлов пока нет" />}
      <Button title="Добавить вложение до 5 МБ" onPress={() => void pick()} disabled={Boolean(task.phase) || fileState !== 'ready'} />
      {files.some((file) => ['pending', 'failed'].includes(file.status)) ? <Button title="Повторить отправку" variant="secondary" onPress={() => void retry()} disabled={Boolean(task.phase) || fileState !== 'ready'} /> : null}
    </Surface>
  </>
}
