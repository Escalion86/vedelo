import { useState, type ReactNode } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, CompactField as Field, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import type { Client, Service } from '../../shared/domain/types'
import type { EventDraft } from '../../shared/domain/eventForm'
import { EventGeneralSection } from './EventGeneralSection'
import { EventContactsSection, type EventContactsSectionProps } from './EventContactsSection'
import { EventFinanceSection, type EventFinanceSectionProps } from './EventFinanceSection'
import { CompactEventSection } from './CompactEventSection'
import { EventAiHighlight } from './EventAiHighlight'
import { clientSummary, compactFieldGroups, transferSummary, type CompactSectionId } from './compactEventFormHelpers'

export type CompactEventFormProps = {
  draft: EventDraft; onChange: (draft: EventDraft) => void; clients: Client[]; services: Service[]
  eventTypes: string[]; towns: string[]; showTransfer: boolean; genitive: string
  aiFields: ReadonlySet<string>; onManualEdit: (keys: string[]) => void
  openSections: ReadonlySet<CompactSectionId>; onToggle: (id: CompactSectionId) => void
  invalid?: { section: CompactSectionId; message: string }
  contacts: Pick<EventContactsSectionProps, 'onCreateClient' | 'onOpenClient'>
  finance: Omit<EventFinanceSectionProps, 'draft' | 'onChange' | 'group' | 'aiFields' | 'onManualEdit'>
  /** Будущие модули включаются родителем только после появления реального файла и проверки доступа. */
  proposalsSection?: ReactNode; clientReviewSection?: ReactNode
}
export function CompactEventForm(props: CompactEventFormProps) {
  const { draft, clients, services, aiFields, onManualEdit } = props
  const styles = useThemeStyles(createStyles)
  const [serviceSelection, setServiceSelection] = useState<EventDraft | null>(null)
  const [selectionEdits, setSelectionEdits] = useState<Set<string>>(() => new Set())
  const common = { draft, onChange: props.onChange, aiFields, onManualEdit }
  const general = { ...common, services, clients, eventTypes: props.eventTypes, towns: props.towns, showTransfer: props.showTransfer, genitive: props.genitive }
  const v = draft.values
  const section = (id: CompactSectionId, title: string, summary: string, body: ReactNode, help?: string) => <CompactEventSection
    key={id} id={id} title={title} summary={summary} help={help} open={props.openSections.has(id)} onToggle={() => props.onToggle(id)}
    error={props.invalid?.section === id ? props.invalid.message : undefined} ai={compactFieldGroups[id].some(key => aiFields.has(key))}>{body}</CompactEventSection>
  const names = draft.serviceIds.map(id => services.find(service => service._id === id)?.title || 'Услуга').join(', ')
  const statusLabel = { draft: 'Заявка', active: 'Подтверждено', closed: 'Закрыто', canceled: 'Отменено' }[v.status]
  return <View style={styles.form}>
    {section('client', 'Клиент и прочие контакты', clientSummary(draft, clients), <>
      <EventContactsSection {...common} {...props.contacts} clients={clients} group="contacts" />
      <EventDescription {...common} />
    </>, getFieldHelp('event.client'))}
    {section('services', `Услуги и тип ${props.genitive}`, [v.eventType, names].filter(Boolean).join(' · ') || 'Не выбрано', <>
      <EventType {...general} />
      <Button title="Выбрать услуги" variant="secondary" onPress={() => { setSelectionEdits(new Set()); setServiceSelection({ ...draft, values: { ...v }, serviceIds: [...draft.serviceIds] }) }} />
    </>, getFieldHelp('event.services'))}
    {section('dates', 'Дата и время', v.eventDate ? [v.eventDate, v.dateEnd].filter(Boolean).join(' — ') : 'Дата пока неизвестна', <EventGeneralSection {...general} group="dates" />, getFieldHelp('event.dates'))}
    {section('location', 'Место проведения', [v.town, v.street, v.house, v.addressComment].filter(Boolean).join(', ') || 'Не указано', <EventGeneralSection {...general} group="location" />)}
    {section('finance', 'Финансы', [`${Number(v.contractSum || 0).toLocaleString('ru-RU')} ₽`, v.waitDeposit ? `Ждём задаток${v.depositExpectedAmount ? `: ${v.depositExpectedAmount} ₽` : ''}` : '', v.isByContract ? 'По договору' : ''].filter(Boolean).join(' · '), <EventFinanceSection {...common} {...props.finance} group="finance" />, getFieldHelp('event.contractSum'))}
    {section('tasks', 'Задачи/События', draft.tasks.filter(task => !task.done).length ? `Ожидают выполнения: ${draft.tasks.filter(task => !task.done).length}` : 'Нет невыполненных задач', <EventContactsSection {...common} {...props.contacts} clients={clients} group="tasks" />, getFieldHelp('event.tasks'))}
    {section('documents', 'Файлы и документы', `Документов: ${props.finance.documentsCount}`, <EventFinanceSection {...common} {...props.finance} group="documents" />)}
    {props.proposalsSection}
    {props.clientReviewSection}
    {section('details', 'Другие детали', transferSummary(draft, clients) || 'Дата заявки, передача коллеге', <EventGeneralSection {...general} group="details" />, getFieldHelp('event.transfer'))}
    {section('status', `Статус: ${statusLabel}`, 'Изменить', <EventGeneralSection {...general} group="status" />, getFieldHelp('event.status'))}
    {serviceSelection ? <Modal visible animationType="none" onRequestClose={() => setServiceSelection(null)}>
      <SafeAreaView testID="event-service-picker" style={styles.modal}><Screen keyboardShouldPersistTaps="handled">
        <SectionTitle>{`Выбор услуг и типа ${props.genitive}`}</SectionTitle>
        <EventGeneralSection {...general} draft={serviceSelection} aiFields={undefined} onManualEdit={keys => setSelectionEdits(current => new Set([...current, ...keys]))} group="services" onChange={setServiceSelection} />
        <Button title="Применить услуги" onPress={() => {
          onManualEdit([...selectionEdits])
          props.onChange({ ...draft, serviceIds: serviceSelection.serviceIds, values: { ...v, eventType: serviceSelection.values.eventType } })
          setServiceSelection(null)
        }} />
        <Button title="Отмена выбора услуг" variant="secondary" onPress={() => setServiceSelection(null)} />
      </Screen></SafeAreaView>
    </Modal> : null}
  </View>
}
// Те же контролы и тот же draft в обеих компоновках; описание относится к клиентскому запросу.
function EventType({ draft, onChange, aiFields, onManualEdit, genitive }: Pick<CompactEventFormProps, 'draft' | 'onChange' | 'aiFields' | 'onManualEdit' | 'genitive'>) {
  return <EventAiHighlight active={aiFields.has('eventType')} field="eventType"><Field testID="event-type" label={`Тип ${genitive}`} help={getFieldHelp('event.type')} value={draft.values.eventType} onChangeText={eventType => {
    onManualEdit(['eventType']); onChange({ ...draft, values: { ...draft.values, eventType } })
  }} /></EventAiHighlight>
}
function EventDescription({ draft, onChange, aiFields, onManualEdit }: Pick<CompactEventFormProps, 'draft' | 'onChange' | 'aiFields' | 'onManualEdit'>) {
  return <Surface><EventAiHighlight active={aiFields.has('description')} field="description"><Field label="Описание" multiline help={getFieldHelp('event.description')} value={draft.values.description} onChangeText={description => {
    onManualEdit(['description']); onChange({ ...draft, values: { ...draft.values, description } })
  }} /></EventAiHighlight></Surface>
}
const createStyles = (p: Palette) => StyleSheet.create({ form: { gap: 8 }, modal: { flex: 1, backgroundColor: p.canvas } })
