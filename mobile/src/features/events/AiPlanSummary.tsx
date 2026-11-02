import { Text } from 'react-native'
import { Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import type { AiPlan } from './aiReview'
import type { Client, Service } from '../../shared/domain/types'

const describe = (value: unknown): string => {
  if (value == null || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (Array.isArray(value)) return value.length ? value.map(describe).join('; ') : 'Нет'
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !key.startsWith('_') && !key.endsWith('Id'))
    .map(([key, item]) => `${({ title: 'Название', description: 'Описание', date: 'Срок', done: 'Выполнено', town: 'Город', street: 'Улица', house: 'Дом' } as Record<string, string>)[key] || key}: ${describe(item)}`).join(', ')
  return String(value)
}
const fieldNames: Record<string, string> = { eventType: 'Тип работы', description: 'Описание', eventDate: 'Начало', dateEnd: 'Окончание', status: 'Статус', clientId: 'Клиент', servicesIds: 'Услуги', additionalEvents: 'Следующие контакты', otherContacts: 'Дополнительные контакты', contractSum: 'Сумма договора', waitDeposit: 'Ожидается задаток', depositExpectedAmount: 'Сумма задатка', depositDueAt: 'Срок задатка', address: 'Адрес', financeComment: 'Комментарий к финансам', isByContract: 'По договору', isTransferred: 'Передано коллеге', colleagueId: 'Коллега', cancelReason: 'Причина отмены', requestCreatedAt: 'Дата заявки', calendarImportChecked: 'Проверено после импорта календаря', fileImportChecked: 'Проверено после импорта файла' }
export function AiPlanSummary({ plan, started, manualChanges, clients = [], services = [] }: { plan: AiPlan; started?: boolean; manualChanges?: Record<string, unknown>; clients?: Client[]; services?: Service[] }) {
  const { palette } = useTheme()
  const manualValue = (field: string, value: unknown) => {
    if (field === 'clientId' || field === 'colleagueId') {
      if (!value) return 'Не указан'
      const client = clients.find(item => item._id === value)
      return client ? [client.firstName, client.secondName, client.thirdName].filter(Boolean).join(' ') || 'Клиент без имени' : 'Выбранная карточка'
    }
    if (field === 'servicesIds' && Array.isArray(value)) return value.map(id => services.find(item => item._id === id)?.title || 'Недоступная услуга').join('; ') || 'Нет'
    return describe(value)
  }
  return <Surface testID="ai-plan-summary">
    <SectionTitle>Предложенные изменения</SectionTitle>
    <Notice tone="warning" message={started
      ? 'Сохранение начато. Ручные правки зафиксированы; повтор продолжит тот же план без повторного ИИ-разбора.'
      : 'Проверьте предложения и обычную форму ниже. До нажатия «Сохранить» данные CRM не изменяются.'} />
    {plan.clientPatch ? <Notice message="Изменение клиента относится ко всем его заказам." /> : null}
    {plan.steps.map((step, index) => <Surface key={index}>
      <Text style={{ color: palette.text, fontWeight: '700' }}>{({ event: 'Работа и следующие контакты', client: 'Клиент', transaction: 'Оплата' })[step.entity]}{plan.completed.includes(index) ? ' · выполнено' : ''}</Text>
      {step.description ? <Text style={{ color: palette.text }}>{step.description}</Text> : null}
      {step.changes.map(change => <Text key={change.field} style={{ color: palette.text }} selectable>{change.label}: {describe(change.before)} → {describe(change.after)}</Text>)}
    </Surface>)}
    {manualChanges && Object.keys(manualChanges).length ? <Surface><SectionTitle>Подтверждённые ручные исправления</SectionTitle>{Object.entries(manualChanges).map(([field, value]) => <Text key={field} selectable style={{ color: palette.text }}>{fieldNames[field] || 'Поле формы'}: {manualValue(field, value)}</Text>)}</Surface> : null}
    {plan.expired ? <Notice tone="warning" message="Срок неподтверждённого плана истёк. Подготовьте предложения заново." /> : null}
    {plan.conflict ? <Notice tone="warning" message={plan.error || 'Данные изменились. Проверьте уже выполненные действия.'} /> : null}
  </Surface>
}
