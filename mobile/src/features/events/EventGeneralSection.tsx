import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Client, Service } from '../../shared/domain/types'
import { type EventDraft, type EventFormValues } from '../../shared/domain/eventForm'
import { Button, CompactField as Field, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { getEventCardClientName } from './eventCard'

export const EventGeneralSection = ({ draft, onChange, services, clients, eventTypes, towns, showTransfer, genitive }: {
  draft: EventDraft; onChange: (draft: EventDraft) => void; services: Service[]; clients: Client[]
  eventTypes: string[]; towns: string[]; showTransfer: boolean; genitive: string
}) => {
  const styles = useThemeStyles(createStyles)
  const v = draft.values
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    onChange({ ...draft, values: { ...v, [key]: value } })
  const field = (key: keyof EventFormValues, label: string, placeholder?: string) =>
    <Field label={label} value={String(v[key])} onChangeText={(text) => set(key, text)} placeholder={placeholder} />
  return <View style={styles.section}>
    <Surface>
      <Field testID="event-type" label={`Тип ${genitive}`} value={v.eventType} onChangeText={(text) => set('eventType', text)} />
      <View style={styles.options}>{eventTypes.map((type) => <GeneralChoice key={type} label={type} selected={v.eventType === type} onPress={() => set('eventType', type)} />)}</View>
      <SectionTitle>Услуги</SectionTitle>
      {services.length ? <View style={styles.options}>{services.map((service) => <GeneralChoice key={service._id}
        label={service.title || 'Услуга'} selected={draft.serviceIds.includes(service._id)}
        onPress={() => onChange({ ...draft, serviceIds: draft.serviceIds.includes(service._id)
          ? draft.serviceIds.filter((id) => id !== service._id) : [...draft.serviceIds, service._id] })} />)}</View>
        : <Text style={styles.muted}>Нет доступных услуг. Добавьте их в разделе «Меню».</Text>}
    </Surface>
    <Surface>
      <SectionTitle>Даты</SectionTitle>
      <Text style={styles.muted}>Местное время устройства. Формат: ГГГГ-ММ-ДД ЧЧ:ММ. Дата без времени означает 00:00.</Text>
      {field('eventDate', 'Начало', '2026-10-15 18:00')}
      {field('dateEnd', 'Окончание', '2026-10-15 22:00')}
      {v.status === 'draft' && v.eventDate ? <Button title="Дата пока неизвестна" variant="secondary" onPress={() => onChange({ ...draft, values: { ...v, eventDate: '', dateEnd: '' } })} /> : null}
    </Surface>
    <Surface>
      <SectionTitle>Локация</SectionTitle>
      {field('town', 'Город')}
      <View style={styles.options}>{towns.map((town) => <GeneralChoice key={town} label={town} selected={v.town === town} onPress={() => set('town', town)} />)}</View>
      {field('street', 'Улица')}{field('house', 'Дом')}{field('entrance', 'Подъезд')}
      {field('floor', 'Этаж')}{field('flat', 'Офис / квартира')}
      <Field label="Комментарий к адресу" value={v.addressComment} multiline onChangeText={(text) => set('addressComment', text)} />
    </Surface>
    <Surface>
      <Field label="Описание" value={v.description} multiline onChangeText={(text) => set('description', text)} />
      {showTransfer ? <>
        <GeneralChoice label="Передано коллеге" selected={v.isTransferred} onPress={() => set('isTransferred', !v.isTransferred)} />
        {v.isTransferred ? <>
          <SectionTitle>Коллега</SectionTitle>
          <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options}>
            {clients.map((client) => <GeneralChoice key={client._id} label={getEventCardClientName(client)} selected={v.colleagueId === client._id} onPress={() => set('colleagueId', client._id)} />)}
          </ScrollView>
          {!clients.length ? <Text style={styles.muted}>Сначала добавьте коллегу в список клиентов.</Text> : null}
        </> : null}
      </> : null}
      {draft.source?.importedFromFile ? <GeneralChoice label="Импорт из файла проверен" selected={v.fileImportChecked} onPress={() => set('fileImportChecked', !v.fileImportChecked)} />
        : draft.source && !draft.source.calendarImportChecked ? <GeneralChoice label="Проверка импорта завершена" selected={v.calendarImportChecked} onPress={() => set('calendarImportChecked', !v.calendarImportChecked)} /> : null}
      {field('requestCreatedAt', 'Дата заявки', '2026-10-01 12:00')}
      {v.status === 'canceled' ? field('cancelReason', 'Причина отмены') : null}
      <SectionTitle>Статус</SectionTitle>
      <View style={styles.options}>{([['draft', 'Заявка'], ['active', 'Подтверждено'], ['closed', 'Закрыто'], ['canceled', 'Отменено']] as const)
        .map(([value, label]) => <GeneralChoice key={value} label={label} selected={v.status === value} onPress={() => set('status', value)} />)}</View>
    </Surface>
  </View>
}
export const GeneralChoice = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && styles.pressed]}>
    <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
  </Pressable>
}
const createStyles = (p: Palette) => StyleSheet.create({
  section: { gap: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: p.border, justifyContent: 'center' },
  selected: { backgroundColor: p.primary, borderColor: p.primary }, text: { color: p.text, fontSize: 14 },
  selectedText: { color: p.onPrimary }, pressed: { opacity: 0.82 }, muted: { color: p.cardMuted, fontSize: 13, lineHeight: 19 },
})
