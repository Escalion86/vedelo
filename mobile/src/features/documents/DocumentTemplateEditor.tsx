import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../../shared/api/client'
import type { DocumentTemplate } from '../../shared/domain/types'
import { Button, CompactField, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { DOCX_MIME, documentTypes, readTemplatesResponse, safeDocumentError, validatePickedFile, type PickedFile } from './documentUi'
import { useDocumentTask } from './useDocumentTask'

type Values = { name: string; type: DocumentTemplate['type']; customTypeName: string; fileName: string }
const empty: Values = { name: '', type: 'contract', customTypeName: '', fileName: '' }
export default function DocumentTemplateEditor() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const navigation = useNavigation()
  const styles = useThemeStyles(createStyles)
  const [values, setValues] = useState<Values>(empty)
  const [file, setFile] = useState<PickedFile | null>(null)
  const initial = useRef<Values>(empty)
  const [state, setState] = useState('loading')
  const [readError, setReadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [done, setDone] = useState(false)
  const confirming = useRef(false)
  const task = useDocumentTask(id)
  const [verification, setVerification] = useState<DocumentTemplate | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  usePreventRemove((dirty || Boolean(task.phase)) && !done, ({ data }) => {
    if (task.busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => { if (task.isActive() && !task.busy.current) navigation.dispatch(data.action) } },
    ])
  })
  useEffect(() => { if (done) router.back() }, [done])
  useEffect(() => {
    let active = true
    setState('loading'); setReadError(''); setDone(false); setDirty(false); setFile(null); setVerification(null); setDeletePending(false)
    const read = async () => {
      try {
        const template = isNew ? null : readTemplatesResponse(await api.get('/mobile/v1/document-templates')).find((item) => item.id === id)
        if (!active) return
        if (!isNew && !template) { setState('missing'); return }
        const next: Values = template ? { name: template.name, type: template.type, customTypeName: template.customTypeName || '', fileName: template.fileName } : { ...empty }
        initial.current = next; setValues(next); setState('ready')
      } catch (cause) { if (active) { setState('error'); setReadError(safeDocumentError(cause, 'Не удалось загрузить шаблон.')) } }
    }
    void read()
    return () => { active = false }
  }, [id, isNew, attempt])
  const blocked = Boolean(task.phase) || Boolean(verification) || deletePending || done
  const change = (patch: Partial<Values>) => {
    if (task.busy.current || blocked || state !== 'ready') return
    const next = { ...values, ...patch }
    setValues(next); setDirty(Boolean(file) || JSON.stringify(next) !== JSON.stringify(initial.current)); task.setError('')
  }
  const pick = () => task.run('Выбираем DOCX…', 'Не удалось выбрать DOCX-файл.', async (current) => {
    const result = await DocumentPicker.getDocumentAsync({ type: [DOCX_MIME], copyToCacheDirectory: true, multiple: false })
    if (result.canceled || !current()) return
    const asset = result.assets[0]
    const validation = validatePickedFile(asset, true)
    if (validation) { task.setError(validation); return }
    setFile(asset); setValues((old) => ({ ...old, fileName: asset.name, name: old.name.trim() ? old.name : asset.name.replace(/\.docx$/i, '') })); setDirty(true)
  })
  const verifySave = async (expected: DocumentTemplate, current: () => boolean) => {
    const templates = readTemplatesResponse(await api.get('/mobile/v1/document-templates'))
    const found = templates.find((item) => item.id === expected.id)
    if (!found || found.name !== expected.name || found.type !== expected.type || (found.customTypeName || '') !== (expected.customTypeName || '') || found.fileName !== expected.fileName || (expected.updatedAt && found.updatedAt !== expected.updatedAt)) throw new Error('READ_BACK_MISMATCH')
    if (current()) { setDirty(false); setDone(true) }
  }
  const save = () => {
    if (blocked || task.busy.current || state !== 'ready') return
    if (!values.name.trim()) { task.setError('Введите название шаблона'); return }
    if (values.name.trim().length > 160) { task.setError('Название шаблона — не более 160 символов'); return }
    if (values.type === 'other' && values.customTypeName.trim().length > 120) { task.setError('Название типа — не более 120 символов'); return }
    if (isNew && !file) { task.setError('Выберите DOCX-файл'); return }
    if (file) { const validation = validatePickedFile(file, true); if (validation) { task.setError(validation); return } }
    void task.run('Сохраняем и проверяем шаблон…', 'Не удалось подтвердить сохранение. Ввод сохранён; проверьте список перед повторной загрузкой.', async (current) => {
      if (!isNew && !readTemplatesResponse(await api.get('/mobile/v1/document-templates')).some((item) => item.id === id)) throw new Error('MISSING_TEMPLATE')
      if (!current()) return
      const form = new FormData()
      if (!isNew) form.append('id', id)
      form.append('name', values.name.trim()); form.append('type', values.type)
      form.append('customTypeName', values.type === 'other' ? values.customTypeName.trim() : '')
      if (file) form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || DOCX_MIME } as unknown as Blob)
      const response = await api.upload<{ success?: boolean; data?: DocumentTemplate }>('/mobile/v1/document-templates', form)
      if (!current()) return
      const expected = readTemplatesResponse({ success: response?.success, data: response?.data ? [response.data] : undefined })[0]
      if ((!isNew && expected.id !== id) || expected.name !== values.name.trim() || expected.type !== values.type || (expected.customTypeName || '') !== (values.type === 'other' ? values.customTypeName.trim() : '') || expected.fileName !== (file?.name || values.fileName)) throw new Error('INVALID_RESPONSE')
      setVerification(expected)
      await verifySave(expected, current)
    })
  }
  const verifyDelete = async (current: () => boolean) => {
    const templates = readTemplatesResponse(await api.get('/mobile/v1/document-templates'))
    if (templates.some((item) => item.id === id)) throw new Error('DELETE_NOT_CONFIRMED')
    if (current()) { setDirty(false); setDone(true) }
  }
  const remove = () => {
    if (task.busy.current || confirming.current || blocked || state !== 'ready') return
    confirming.current = true
    Alert.alert('Удалить шаблон?', `«${initial.current.name}». Существующие сформированные документы не изменятся.`, [
      { text: 'Отмена', style: 'cancel', onPress: () => { confirming.current = false } },
      { text: 'Удалить', style: 'destructive', onPress: () => { confirming.current = false; void task.run('Удаляем и проверяем шаблон…', 'Не удалось подтвердить удаление шаблона. Повторите проверку.', async (current) => {
        if (!readTemplatesResponse(await api.get('/mobile/v1/document-templates')).some((item) => item.id === id)) throw new Error('MISSING_TEMPLATE')
        if (!current()) return
        const response = await api.delete<{ success?: boolean; data?: { id?: string } }>('/mobile/v1/document-templates', { id })
        if (!current()) return
        setDeletePending(true)
        if (response?.success !== true || response.data?.id !== id) throw new Error('INVALID_RESPONSE')
        await verifyDelete(current)
      }) } },
    ], { cancelable: true, onDismiss: () => { confirming.current = false } })
  }
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={isNew ? 'Новый DOCX-шаблон' : 'Редактирование шаблона'} subtitle="DOCX до 5 МБ · переменные в фигурных скобках" />
    {state === 'loading' ? <Notice message="Загружаем шаблон…" /> : state === 'error' || state === 'missing' ? <>
      {state === 'missing' ? <EmptyState title="Шаблон не найден" /> : <Notice tone="danger" message={readError} />}
      <Button title="Повторить чтение" onPress={() => setAttempt((value) => value + 1)} variant="secondary" />
    </> : <>
      <Surface>
        <CompactField testID="template-name" label="Название шаблона *" value={values.name} onChangeText={(name) => change({ name })} editable={!blocked} maxLength={160} />
        <SectionTitle>Тип документа</SectionTitle><View style={styles.options}>{documentTypes.map(([type, label]) => <Pressable key={type} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: values.type === type, disabled: blocked }} disabled={blocked} onPress={() => change({ type })} style={[styles.option, values.type === type && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
        {values.type === 'other' ? <CompactField label="Название типа" value={values.customTypeName} onChangeText={(customTypeName) => change({ customTypeName })} maxLength={120} editable={!blocked} /> : null}
        <SectionTitle>DOCX-файл</SectionTitle><Text style={styles.text}>{values.fileName || 'Файл не выбран'}</Text>
        <Button testID="pick-template-file" title={values.fileName ? 'Заменить DOCX-файл' : 'Выбрать DOCX-файл'} variant="secondary" onPress={() => void pick()} disabled={blocked} />
        {task.error ? <Notice tone="danger" message={task.error} /> : null}
        {task.phase ? <Notice message={task.phase} /> : null}
        {verification ? <Button title="Проверить сохранение" variant="secondary" onPress={() => void task.run('Проверяем сохранение…', 'Сохранение пока не подтверждено. Повторите проверку.', (current) => verifySave(verification, current))} disabled={Boolean(task.phase)} /> : deletePending ? <Button title="Проверить удаление" variant="secondary" onPress={() => void task.run('Проверяем удаление…', 'Удаление пока не подтверждено. Повторите проверку.', verifyDelete)} disabled={Boolean(task.phase)} /> : <Button testID="save-template" title="Сохранить шаблон" onPress={save} disabled={blocked || (!isNew && !dirty)} />}
      </Surface>
      {!isNew ? <Button testID="delete-template" title="Удалить шаблон" variant="danger" onPress={remove} disabled={blocked} /> : null}
    </>}
  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { minHeight: 40, padding: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: palette.surface }, selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected }, text: { color: palette.text, fontSize: 14, flexShrink: 1 },
})
