// Isolated, synthetic visual data. Never uses auth, production APIs or device storage.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Linking, Alert } from 'react-native'
import { darkPalette, lightPalette } from '../../mobile/src/shared/ui/theme'
import { ThemeProvider } from '../../mobile/src/shared/ui/ThemeProvider'
import { QuickContacts } from '../../mobile/src/shared/ui/QuickContacts'
import { MobileEventCard } from '../../mobile/src/features/events/MobileEventCard'
import { MobileClientCard } from '../../mobile/src/features/clients/MobileClientCard'
import AttentionScreen from '../../mobile/src/features/attention/AttentionScreen'
import { clientSummary } from '../../mobile/src/features/clients/clientList'
import WebContacts from '../../components/ContactsIconsButtons'

window.qa = { routes: [], links: [], alerts: [], clipboard: [], mutations: [], opens: 0, deletes: 0, invalidations: [], scopes: [] }
Linking.openURL = async url => { window.qa.links.push(url) }
Alert.alert = (...args) => { window.qa.alerts.push(args.map(x => typeof x === 'string' ? x : x?.map?.(b => b.text))) }
window.open = url => { window.qa.links.push(url); return null }
const params = new URLSearchParams(location.search)
const mode = params.get('theme') || 'light'
const surface = params.get('surface') || 'cards'
const date = (days, hours = 18) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hours, 0, 0, 0); return d.toISOString() }
const base = { firstName: 'Александра-Екатерина', secondName: 'Тестовая-Длинная-Фамилия', thirdName: 'Константиновна', phone: '70000000001' }
const clients = [
  { ...base, _id: 'trial', preferredContactChannel: 'telegram' },
  { ...base, _id: 'confirmed', whatsapp: '70000000002', viber: '70000000003', telegram: 'qa_synthetic', max: 'https://max.ru/u/qa-synthetic', instagram: 'qa_synthetic', vk: 'qa_synthetic', email: 'synthetic@example.invalid', preferredContactChannel: 'max' },
  { ...base, _id: 'maxphone', max: '70000000004', whatsappPhoneUnavailable: true, telegramPhoneUnavailable: true, preferredContactChannel: 'phone' },
  { ...base, _id: 'other', firstName: 'Дополнительный синтетический контакт', phone: '70000000005' },
]
clients[0].significantDates = [{ _id: 'date-1', title: 'Тестовая значимая дата', date: date(0), comment: 'Только синтетические данные' }]
const eventBase = { clientId: 'confirmed', status: 'active', contractSum: 125000, eventType: 'Очень длинное название тестовой работы для проверки узкой карточки', calendarImportChecked: true, address: { town: 'Тестовый город', street: 'Очень длинная тестовая улица', house: '123' }, servicesIds: [], otherContacts: [{ clientId: 'other', comment: 'Допконтакт с длинным комментарием для проверки переноса' }], clientData: { createdViaApi: true, sourceLabel: 'Cigam' } }
const events = [
  { ...eventBase, _id: 'future', eventDate: date(1), additionalEvents: [
    { _id: 'overdue', title: 'Просроченный тестовый контакт', description: 'Подробный длинный комментарий для проверки переноса текста в карточке задачи.', date: date(-1) },
    { _id: 'today', title: 'Сегодня — тестовый контакт', date: date(0) },
    { _id: 'tomorrow', title: 'Завтра — тестовый контакт', date: date(1) },
    { _id: 'done', title: 'Выполненная тестовая задача', date: date(0), done: true, doneAt: date(0, 11) },
  ] },
  { ...eventBase, _id: 'past-request', status: 'draft', eventDate: date(-2), additionalEvents: [] },
  { ...eventBase, _id: 'without-step', status: 'draft', eventDate: null, additionalEvents: [] },
  { ...eventBase, _id: 'past-active', eventDate: date(-2), additionalEvents: [] },
]
window.qaData = { clients: surface === 'empty' ? [] : clients, events: surface === 'empty' ? [] : events, services: [], transactions: [] }
window.qaFixture = { clients, events }
function App() {
  const [revision, rerender] = React.useState(0)
  React.useEffect(() => {
    window.qaRerender = () => rerender(x => x + 1)
    return () => { delete window.qaRerender }
  }, [])
  return <ThemeProvider forcedMode={mode} storage={null}>
    <main className={surface === 'web' ? 'cabinet-canvas' : undefined} data-qa-surface={surface} data-revision={revision} style={{ width: '100%', minHeight: '100vh', ...(surface !== 'web' ? { backgroundColor: (mode === 'dark' ? darkPalette : lightPalette).canvas } : {}), ...(surface === 'attention' || surface === 'empty' ? { display: 'flex', flexDirection: 'column', height: '100vh' } : {}) }}>
      {surface === 'contacts' ? clients.slice(0, 3).map(client => <section key={client._id} data-qa={`contacts-${client._id}`} style={{ padding: 8 }}><QuickContacts client={client} maxVisible={8} /></section>) : null}
      {surface === 'web' ? clients.slice(0, 3).map(client => <section key={client._id} data-qa={`web-${client._id}`} style={{ padding: 8 }}><WebContacts user={client} compactButtons forceWhatsApp forceTelegram forceMax /></section>) : null}
      {surface === 'cards' ? <>
        <MobileEventCard event={events[0]} client={clients[1]} clientsById={new Map(clients.map(c => [c._id, c]))} services={[]} transactions={[]} testID="event-main" onPress={() => window.qa.opens++} />
        <MobileEventCard event={events[1]} client={clients[0]} services={[]} transactions={[]} testID="event-past" onPress={() => window.qa.opens++} />
        <MobileEventCard event={{ ...events[0], _id: 'busy', syncStatus: 'syncing' }} client={clients[0]} services={[]} transactions={[]} testID="event-busy" onPress={() => window.qa.opens++} />
        {clients.slice(0, 3).map(client => <MobileClientCard key={client._id} client={client} summary={clientSummary(client._id, events)} onDelete={() => window.qa.deletes++} />)}
      </> : null}
      {surface === 'attention' || surface === 'empty' ? <AttentionScreen /> : null}
    </main>
  </ThemeProvider>
}
document.body.classList.toggle('theme-dark', mode === 'dark')
createRoot(document.getElementById('root')).render(<App />)
