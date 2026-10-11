import { useEffect, useRef, useState } from 'react'
import { Image, StyleSheet, Text } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { File } from 'expo-file-system'
import { api } from '../../shared/api/client'
import { Button, ErrorNotice, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { useAiDraftAccess } from './useAiDraftAccess'
import type { VoiceDraftFields } from './voiceDraft'

export type PhotoDraftFields = VoiceDraftFields & {
  servicesIds?: unknown; isByContract?: unknown; financeComment?: unknown
  address?: (NonNullable<VoiceDraftFields['address']> & { comment?: unknown }) | null
}
type PhotoResponse = { fields?: PhotoDraftFields; sourceText?: string; aiWarnings?: string[]; error?: string }
type Props = { onApply: (fields: PhotoDraftFields) => void | Promise<void> }
type Photo = { uri: string; mime: string }
const MAX_BYTES = 5 * 1024 * 1024

export function PhotoDraftSection(props: Props) {
  const access = useAiDraftAccess()
  if (!access.isDeveloper) return <ErrorNotice message="Создание из фотографии временно доступно только разработчику. Заполните форму вручную." />
  if (access.loading) return <Surface><SectionTitle>Проверяем доступ к ИИ…</SectionTitle></Surface>
  if (!access.allowAi) return <ErrorNotice message={access.error || 'Фото-черновик доступен только в тарифе с ИИ. Заполните форму вручную.'} />
  return <PhotoEditor {...props} access={access} />
}
function PhotoEditor({ onApply, access }: Props & { access: ReturnType<typeof useAiDraftAccess> }) {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [result, setResult] = useState<PhotoResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const choose = async (camera: boolean) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) throw new Error(camera ? 'Разрешите доступ к камере, чтобы снять заметку. Можно выбрать готовое фото.' : 'Разрешите доступ к фотографиям или сделайте снимок камерой.')
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 }
      const selection = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
      if (selection.canceled || !mounted.current) return
      const asset = selection.assets[0]
      if (!asset?.uri) throw new Error('Не удалось прочитать фото. Выберите другой файл.')
      const mime = asset.mimeType || (/\.png$/i.test(asset.uri) ? 'image/png' : /\.webp$/i.test(asset.uri) ? 'image/webp' : 'image/jpeg')
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Выберите JPEG, PNG или WebP до 5 МБ.')
      const file = new File(asset.uri)
      if (!file.exists || file.size <= 0) throw new Error('Файл повреждён. Выберите другое фото.')
      if ((asset.fileSize || 0) > MAX_BYTES || file.size > MAX_BYTES) throw new Error('Фото слишком большое. Максимум 5 МБ.')
      setPhoto({ uri: asset.uri, mime }); setResult(null)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Не удалось выбрать фото') }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const recognize = async () => {
    if (locked.current || !photo) return
    locked.current = true; setBusy(true); setError('')
    try {
      await access.assertAvailable()
      const file = new File(photo.uri)
      if (!file.exists || file.size <= 0) throw new Error('Файл повреждён. Выберите другое фото.')
      if (file.size > MAX_BYTES) throw new Error('Фото слишком большое. Максимум 5 МБ.')
      const base64 = await file.base64()
      if (!base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('Не удалось прочитать фото до 5 МБ.')
      // Платный POST никогда не повторяется автоматически после refresh/401.
      const response = await api.post<PhotoResponse>('/mobile/v1/events/ai-photo-draft', { image: `data:${photo.mime};base64,${base64}` }, { skipRefresh: true })
      if (!response.fields || !response.sourceText || response.error) throw new Error(response.error || 'На фото нет читаемого текста. Переснимите заметку.')
      if (mounted.current) setResult(response)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Не удалось распознать. Выберите другое фото.') }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const apply = async () => {
    if (!result?.fields || locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await onApply(result.fields); if (mounted.current) { setResult(null); setPhoto(null) } }
    catch { if (mounted.current) setError('Не удалось перенести черновик. Проверьте подключение и повторите применение без нового распознавания.') }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return <Surface>
    <SectionTitle>Фото заметки для {terms.genitive}</SectionTitle>
    <Text style={styles.text}>JPEG, PNG или WebP, до 5 МБ и 20 мегапикселей. Фото отправится настроенному ИИ только после «Распознать и заполнить». Две операции: распознавание фото и заполнение полей, с обычной тарификацией ИИ. Контакт из заметки может создать клиента.</Text>
    <Button title="Выбрать изображение" variant="secondary" onPress={() => void choose(false)} disabled={busy} />
    <Button title="Снять фотографию" variant="secondary" onPress={() => void choose(true)} disabled={busy} />
    {photo ? <><Image testID="photo-preview" accessibilityLabel="Предпросмотр выбранной заметки" source={{ uri: photo.uri }} resizeMode="contain" style={styles.image} onError={() => { setPhoto(null); setResult(null); setError('Файл повреждён. Выберите другое фото.') }} />
      <Button title="Убрать фото" variant="secondary" onPress={() => { setPhoto(null); setResult(null); setError('') }} disabled={busy} /></> : null}
    {!access.online ? <ErrorNotice message="Для распознавания нужен интернет. Форму можно заполнить вручную." /> : null}
    {!result ? <Button title="Распознать и заполнить" loading={busy} onPress={() => void recognize()} disabled={!photo || !access.online} /> : null}
    {result ? <><SectionTitle>Распознанный текст</SectionTitle><Text selectable style={styles.text}>{result.sourceText}</Text>
      <Notice tone="warning" message="Проверьте имена, телефоны, даты и суммы по оригиналу. Работа сохранится только кнопкой «Сохранить» в обычной форме." />
      {result.aiWarnings?.map((warning, index) => <Notice key={index} tone="warning" message={warning} />)}
      <Button title="Применить к форме" onPress={() => void apply()} loading={busy} disabled={!access.online} /></> : null}
    {error ? <ErrorNotice message={error} /> : null}
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({ text: { color: palette.cardTitle, fontSize: 13, lineHeight: 20 }, image: { width: '100%', height: 220, borderRadius: 10 } })
