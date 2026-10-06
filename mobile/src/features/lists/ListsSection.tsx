import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useSettingsEditor, type SettingsConfig } from '../settings/settingsEditor'

export const normalizeList = (items: string[]) => {
  const seen = new Set<string>()
  return items.map((item) => item.trim().slice(0, 100)).filter((item) => {
    const key = item.toLocaleLowerCase('ru')
    if (!item || seen.has(key)) return false
    seen.add(key); return true
  }).slice(0, 100).sort((a, b) => a.localeCompare(b, 'ru'))
}
type ListsDraft = { towns: string[]; defaultTown: string; eventTypes: string[]; townDraft: string; eventTypeDraft: string }
export const listsConfig: SettingsConfig<ListsDraft> = {
  scope: 'lists', endpoint: '/mobile/v1/lists',
  initial: (settings) => ({ towns: normalizeList(settings?.towns || []), defaultTown: settings?.defaultTown || '', eventTypes: normalizeList(settings?.custom?.eventTypes || []), townDraft: '', eventTypeDraft: '' }),
  payload: (draft) => {
    if (draft.townDraft.trim() || draft.eventTypeDraft.trim()) throw new Error('Добавьте введённый город или тип в список перед сохранением.')
    return { towns: normalizeList(draft.towns), defaultTown: draft.towns.includes(draft.defaultTown) ? draft.defaultTown : '', eventTypes: normalizeList(draft.eventTypes) }
  },
  matches: (settings, draft) => Array.isArray(settings.towns) && Array.isArray(settings.custom?.eventTypes) && typeof settings.defaultTown === 'string'
    && JSON.stringify(normalizeList(settings.towns || [])) === JSON.stringify(normalizeList(draft.towns))
    && (settings.defaultTown || '') === draft.defaultTown
    && JSON.stringify(normalizeList(settings.custom?.eventTypes || [])) === JSON.stringify(normalizeList(draft.eventTypes)),
}
export const ListsSection = () => {
  const editor = useSettingsEditor(listsConfig)
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = resolveMobileWorkItemTerminology(editor.settings)
  const { towns, defaultTown, eventTypes, townDraft, eventTypeDraft } = editor.draft
  const disabled = editor.saving || !editor.ready
  const add = (town: boolean) => {
    const value = (town ? townDraft : eventTypeDraft).trim().slice(0, 100)
    if (!value || disabled) return
    const items = town ? towns : eventTypes
    const duplicate = items.find((item) => item.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru'))
    if (items.length >= 100 && !duplicate) { Alert.alert('Список заполнен', 'Можно сохранить не более 100 элементов.'); return }
    editor.change((current) => town ? { ...current, towns: normalizeList([...items, value]), defaultTown: current.defaultTown || duplicate || value, townDraft: '' }
      : { ...current, eventTypes: normalizeList([...items, value]), eventTypeDraft: '' })
  }
  const remove = (value: string, town: boolean) => {
    if (disabled) return
    Alert.alert(town ? 'Удалить город?' : 'Удалить тип?', `«${value}»${town && defaultTown === value ? '. Город по умолчанию будет снят' : ''}. Изменение применится после сохранения списков.`, [
      { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => editor.change((current) => town
        ? { ...current, towns: current.towns.filter((item) => item !== value), defaultTown: current.defaultTown === value ? '' : current.defaultTown }
        : { ...current, eventTypes: current.eventTypes.filter((item) => item !== value) }) },
    ])
  }
  const removeButton = (value: string, town: boolean) => <Pressable accessibilityRole="button" accessibilityLabel={`Удалить ${town ? 'город' : 'тип'} ${value}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => remove(value, town)} style={({ pressed }) => [styles.icon, pressed && styles.pressed, disabled && styles.disabled]}><MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.notice.danger.text} /></Pressable>
  return <>
    {editor.reading ? <Notice message="Загружаем списки…" /> : null}
    {editor.readError ? <><Notice tone="warning" message={editor.readError} /><Button title="Повторить загрузку" variant="secondary" onPress={editor.retry} disabled={editor.saving || editor.reading} /></> : null}
    {editor.offline ? <Notice message="Показана последняя офлайн-копия. Для сохранения требуется сеть." /> : null}
    <Surface>
      <SectionTitle>Города</SectionTitle>
      {editor.ready ? <Text style={styles.muted}>По умолчанию: {defaultTown || 'Не выбран'}. Элементов: {towns.length}</Text> : null}
      <Text style={styles.muted}>Город подставляется при создании {terms.genitive}.</Text>
      {editor.ready && !towns.length ? <Text style={styles.muted}>Городов пока нет</Text> : null}
      {towns.map((town) => <View key={town} style={styles.row}>
        <Pressable accessibilityRole="radio" accessibilityLabel={`Город по умолчанию: ${town}`} accessibilityState={{ selected: defaultTown === town, disabled }} disabled={disabled} style={styles.grow} onPress={() => editor.change((current) => ({ ...current, defaultTown: town }))}>
          <Text style={styles.title}>{town}</Text>{defaultTown === town ? <Text style={styles.selected}>По умолчанию</Text> : null}
        </Pressable>{removeButton(town, true)}
      </View>)}
      <CompactField label="Новый город" value={townDraft} onChangeText={(value) => editor.change((current) => ({ ...current, townDraft: value }))} editable={!disabled} maxLength={100} />
      <Button title="Добавить город" variant="secondary" onPress={() => add(true)} disabled={disabled || !townDraft.trim()} />
    </Surface>
    <Surface>
      <SectionTitle>Типы {terms.pluralGenitive}</SectionTitle>
      {editor.ready ? <Text style={styles.muted}>Элементов: {eventTypes.length}</Text> : null}
      {editor.ready && !eventTypes.length ? <Text style={styles.muted}>Типов пока нет</Text> : null}
      {eventTypes.map((value) => <View key={value} style={styles.row}><Text style={[styles.title, styles.grow]}>{value}</Text>{removeButton(value, false)}</View>)}
      <CompactField label="Новый тип" value={eventTypeDraft} onChangeText={(value) => editor.change((current) => ({ ...current, eventTypeDraft: value }))} editable={!disabled} maxLength={100} />
      <Button title="Добавить тип" variant="secondary" onPress={() => add(false)} disabled={disabled || !eventTypeDraft.trim()} />
    </Surface>
    {editor.error ? <Notice tone="danger" message={editor.error} /> : null}
    {editor.success ? <Notice tone="success" message={editor.success} /> : null}
    <Button title="Сохранить списки" onPress={() => void editor.save()} loading={editor.saving} disabled={!editor.ready || editor.reading || !editor.dirty} />
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  muted: { color: palette.cardMuted, fontSize: 13, lineHeight: 18 }, title: { color: palette.text, fontSize: 14, fontWeight: '600' }, selected: { color: palette.primary, fontSize: 12 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.65 }, pressed: { opacity: 0.82 },
})
