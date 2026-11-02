import { Text } from 'react-native'
import type { Client, Service } from '../../shared/domain/types'
import type { EventDraft } from '../../shared/domain/eventForm'
import { Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import type { AiClientForm } from './aiCreateReview'

const commonLabels: Record<string, string> = { firstName: 'Имя', secondName: 'Фамилия', thirdName: 'Отчество', phone: 'Телефон', email: 'Email', telegram: 'Telegram', telegramPhone: 'Телефон Telegram', avitoUrl: 'Avito', whatsapp: 'WhatsApp', max: 'MAX', viber: 'Viber', instagram: 'Instagram', vk: 'VK', town: 'Город', clientType: 'Тип клиента', preferredContactChannel: 'Основной канал', preferredContactChannelOther: 'Другой канал', messengerPushMuted: 'Переписка без уведомлений', comment: 'Комментарий', legalName: 'Наименование для договора', inn: 'ИНН', kpp: 'КПП', ogrn: 'ОГРН / ОГРНИП', bankName: 'Банк', bik: 'БИК', checkingAccount: 'Расчётный счёт', correspondentAccount: 'Корреспондентский счёт', legalAddress: 'Юридический адрес', eventType: 'Тип работы', description: 'Описание', eventDate: 'Начало', dateEnd: 'Окончание', status: 'Статус', clientId: 'Клиент', street: 'Улица', house: 'Дом', entrance: 'Подъезд', floor: 'Этаж', flat: 'Офис / квартира', addressComment: 'Комментарий к адресу', contractSum: 'Сумма договора', waitDeposit: 'Ожидается задаток', depositExpectedAmount: 'Сумма задатка', depositDueAt: 'Срок задатка', financeComment: 'Комментарий к финансам', isByContract: 'По договору', isTransferred: 'Передано коллеге', colleagueId: 'Коллега', calendarImportChecked: 'Импорт календаря проверен', fileImportChecked: 'Импорт файла проверен', requestCreatedAt: 'Дата заявки', cancelReason: 'Причина отмены' }
const clientName = (clients: Client[], id: unknown) => {
  const item = clients.find(client => client._id === id)
  return item ? [item.firstName, item.secondName, item.thirdName].filter(Boolean).join(' ') || 'Клиент без имени' : 'Выбранная карточка'
}
function Fields({ rows }: { rows: Array<[string, unknown]> }) {
  const { palette } = useTheme()
  return <Surface><SectionTitle>Подтверждённая форма</SectionTitle>
    <Notice message="Данные зафиксированы для повторного сохранения. После завершения их можно изменить в обычном редакторе." />
    {rows.filter(([, value]) => value !== '' && value != null).map(([label, value], index) => <Text key={index} selectable style={{ color: palette.text }}>{label}: {typeof value === 'boolean' ? value ? 'Да' : 'Нет' : String(value)}</Text>)}
  </Surface>
}
export function ConfirmedAiEvent({ draft, clients, services }: { draft: EventDraft; clients: Client[]; services: Service[] }) {
  const rows: Array<[string, unknown]> = Object.entries(draft.values).map(([key, value]) => [commonLabels[key],
    (key === 'clientId' || key === 'colleagueId') && value ? clientName(clients, value) : key === 'status'
      ? ({ draft: 'Заявка', active: 'Подтверждено', canceled: 'Отменено', closed: 'Закрыто' } as Record<string, string>)[String(value)] : value])
  for (const id of draft.serviceIds) rows.push(['Услуга', services.find(item => item._id === id)?.title || 'Выбранная услуга'])
  for (const task of draft.tasks) rows.push(['Следующий контакт', [task.title, task.dateInput, task.description, task.done ? 'Выполнено' : ''].filter(Boolean).join(' · ')])
  for (const contact of draft.otherContacts) rows.push(['Дополнительный контакт', [clientName(clients, contact.clientId), contact.comment].filter(Boolean).join(' · ')])
  return <Fields rows={rows} />
}
export function ConfirmedAiClient({ form, clientTypeLabel }: { form: AiClientForm; clientTypeLabel?: string }) {
  const channels: Record<string, string> = { phone: 'Телефон', telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'MAX', vk: 'VK', avito: 'Avito', other: 'Другое' }
  const rows: Array<[string, unknown]> = Object.entries(form.values).map(([key, value]) => [commonLabels[key] || 'Дополнительное поле', key === 'clientType' ? clientTypeLabel || value : key === 'preferredContactChannel' ? channels[String(value)] || value : value])
  for (const date of form.dates) rows.push(['Значимая дата', [date.title, date.dateInput, date.comment].filter(Boolean).join(' · ')])
  return <Fields rows={rows} />
}
