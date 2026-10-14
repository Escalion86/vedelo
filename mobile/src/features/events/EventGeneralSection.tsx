import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Client, Service } from '../../shared/domain/types'
import { type EventDraft, type EventFormValues } from '../../shared/domain/eventForm'
import { Button, CompactField as Field, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { FieldHelp } from '../../shared/ui/FieldHelp'
import { EventAiHighlight } from './EventAiHighlight'
import { getEventCardClientName } from './eventCard'

export const EventGeneralSection = ({ draft, onChange, services, clients, eventTypes, towns, showTransfer, genitive, group, aiFields, onManualEdit }: {
  draft: EventDraft; onChange: (draft: EventDraft) => void; services: Service[]; clients: Client[]
  eventTypes: string[]; towns: string[]; showTransfer: boolean; genitive: string
  group?: 'services' | 'dates' | 'location' | 'details' | 'status'; aiFields?: ReadonlySet<string>; onManualEdit?: (keys: string[]) => void
}) => {
  const styles = useThemeStyles(createStyles)
  const v = draft.values
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
    onManualEdit?.([key]); onChange({ ...draft, values: { ...v, [key]: value } })
  }
  const has = (name: NonNullable<typeof group>) => !group || group === name
  const highlight = (key: string, child: ReactNode) => <EventAiHighlight field={key} active={aiFields?.has(key)}>{child}</EventAiHighlight>
  const field = (key: keyof EventFormValues, label: string, placeholder?: string) =>
    highlight(key, <Field label={label} help={key === 'requestCreatedAt' ? getFieldHelp('event.requestDate') : undefined}
      value={String(v[key])} onChangeText={(text) => set(key, text)} placeholder={placeholder} />)
  return <View style={styles.section}>
    {has('services') ? <Surface>
      {highlight('eventType', <Field testID="event-type" help={getFieldHelp('event.type')} label={`Тип ${genitive}`} value={v.eventType} onChangeText={(text) => set('eventType', text)} />)}
      <View style={styles.options}>{eventTypes.map((type) => <GeneralChoice key={type} label={type} selected={v.eventType === type} onPress={() => set('eventType', type)} />)}</View>
      <EventAiHighlight field="servicesIds" active={aiFields?.has('servicesIds')}><SectionTitle help={getFieldHelp('event.services')}>Услуги</SectionTitle>
      {services.length ? <View style={styles.options}>{services.map((service) => <GeneralChoice key={service._id}
        label={service.title || 'Услуга'} selected={draft.serviceIds.includes(service._id)}
        onPress={() => { onManualEdit?.(['servicesIds']); onChange({ ...draft, serviceIds: draft.serviceIds.includes(service._id)
          ? draft.serviceIds.filter((id) => id !== service._id) : [...draft.serviceIds, service._id] }) }} />)}</View>
        : <Text style={styles.muted}>Нет доступных услуг. Добавьте их в разделе «Меню».</Text>}</EventAiHighlight>
    </Surface> : null}
    {has('dates') ? <Surface>
      {!group ? <SectionTitle help={getFieldHelp('event.dates')}>Даты</SectionTitle> : null}
      <Text style={styles.muted}>Местное время устройства. Формат: ГГГГ-ММ-ДД ЧЧ:ММ. Дата без времени означает 00:00.</Text>
      {field('eventDate', 'Начало', '2026-10-15 18:00')}
      {field('dateEnd', 'Окончание', '2026-10-15 22:00')}
      {v.status === 'draft' && v.eventDate ? <Button title="Дата пока неизвестна" variant="secondary" onPress={() => { onManualEdit?.(['eventDate', 'dateEnd']); onChange({ ...draft, values: { ...v, eventDate: '', dateEnd: '' } }) }} /> : null}
    </Surface> : null}
    {has('location') ? <Surface>
      {!group ? <SectionTitle>Локация</SectionTitle> : null}
      {field('town', 'Город')}
      <View style={styles.options}>{towns.map((town) => <GeneralChoice key={town} label={town} selected={v.town === town} onPress={() => set('town', town)} />)}</View>
      {field('street', 'Улица')}{field('house', 'Дом')}{field('entrance', 'Подъезд')}
      {field('floor', 'Этаж')}{field('flat', 'Офис / квартира')}
      {highlight('addressComment', <Field label="Комментарий к адресу" help={getFieldHelp('address.comment')} value={v.addressComment} multiline onChangeText={(text) => set('addressComment', text)} />)}
    </Surface> : null}
    {has('details') ? <Surface>
      {!group ? highlight('description', <Field label="Описание" help={getFieldHelp('event.description')} value={v.description} multiline onChangeText={(text) => set('description', text)} />) : null}
      {showTransfer ? <>
        <GeneralChoice label="Передано коллеге" help={getFieldHelp('event.transfer')} selected={v.isTransferred} onPress={() => set('isTransferred', !v.isTransferred)} />
        {v.isTransferred ? <>
          <SectionTitle>Коллега</SectionTitle>
          <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options}>
            {clients.map((client) => <GeneralChoice key={client._id} label={getEventCardClientName(client)} selected={v.colleagueId === client._id} onPress={() => set('colleagueId', client._id)} />)}
          </ScrollView>
          {!clients.length ? <Text style={styles.muted}>Сначала добавьте коллегу в список клиентов.</Text> : null}
        </> : null}
      </> : null}
      {draft.source?.importedFromFile ? <GeneralChoice label="Импорт из файла проверен" help={getFieldHelp('event.importChecked')} selected={v.fileImportChecked} onPress={() => set('fileImportChecked', !v.fileImportChecked)} />
        : draft.source && !draft.source.calendarImportChecked ? <GeneralChoice label="Проверка импорта завершена" help={getFieldHelp('event.importChecked')} selected={v.calendarImportChecked} onPress={() => set('calendarImportChecked', !v.calendarImportChecked)} /> : null}
      {field('requestCreatedAt', 'Дата заявки', '2026-10-01 12:00')}
    </Surface> : null}
    {has('status') ? <Surface>
      {v.status === 'canceled' ? field('cancelReason', 'Причина отмены') : null}
      <SectionTitle help={getFieldHelp('event.status')}>Статус</SectionTitle>
      <View style={styles.options}>{([['draft', 'Заявка'], ['active', 'Подтверждено'], ['closed', 'Закрыто'], ['canceled', 'Отменено']] as const)
        .map(([value, label]) => <GeneralChoice key={value} label={label} selected={v.status === value} onPress={() => set('status', value)} />)}</View>
    </Surface> : null}
  </View>
}
export const GeneralChoice = ({ label, help, selected, onPress }: { label: string; help?: string; selected: boolean; onPress: () => void }) => {
  const styles = useThemeStyles(createStyles)
  const choice = <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && styles.pressed]}>
    <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
  </Pressable>
  return help ? <View style={styles.options}>{choice}<FieldHelp label={label} text={help} /></View> : choice
}
const createStyles = (p: Palette) => StyleSheet.create({
  section: { gap: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { maxWidth: '100%', flexShrink: 1, minHeight: 44, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: p.border, justifyContent: 'center' },
  selected: { backgroundColor: p.primary, borderColor: p.primary }, text: { fontFamily: typography.fontFamily, color: p.text, fontSize: 14, flexShrink: 1 },
  selectedText: { color: p.onPrimary }, pressed: { opacity: 0.82 }, muted: { color: p.cardMuted, fontSize: 13, lineHeight: 19 },
})
