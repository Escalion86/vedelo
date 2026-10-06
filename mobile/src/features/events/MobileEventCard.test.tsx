import React from 'react'
import { Linking } from 'react-native'
import { fireEvent, render, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { getQuickContactActions } from '../../shared/ui/QuickContacts'
import type { Client } from '../../shared/domain/types'
import { MobileEventCard } from './MobileEventCard'
import type { ListEvent } from './filters'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
const client: Client = { _id: 'local-client', firstName: 'Анна', phone: '79990000000', whatsapp: '79990000000', telegram: '@anna', vk: 'anna', email: 'a@example.test' }
const event: ListEvent = { _id: 'local-event', status: 'active', eventType: 'Очень длинное название '.repeat(10), isByContract: true, calendarImportChecked: true, address: { town: 'Красноярск' } }
const stopPropagation = jest.fn()
const press = (node: Parameters<typeof fireEvent.press>[0]) => fireEvent.press(node, { stopPropagation })
const setup = (values: Partial<ListEvent> = {}, props = {}, dark = false) => {
  const onPress = jest.fn()
  const screen = render(<ThemeProvider storage={null} forcedMode={dark ? 'dark' : 'light'}>
    <MobileEventCard event={{ ...event, ...values }} services={[]} transactions={[]} client={client} testID="card" onPress={onPress} {...props} />
  </ThemeProvider>)
  return { ...screen, onPress }
}
beforeEach(() => jest.clearAllMocks())
it.each([false, true])('three rows, 58dp date and continuous dividers in dark=%s', (dark) => {
  const screen = setup({}, {}, dark)
  const palette = dark ? darkPalette : lightPalette
  expect(screen.getByTestId('card-shell')).toHaveStyle({ minHeight: 184, borderRadius: 8, backgroundColor: palette.surface })
  expect(screen.getByTestId('card-date')).toHaveStyle({ width: 58, borderRightWidth: 1, borderColor: palette.border })
  expect(screen.getByTestId('card-footer')).toHaveStyle({ borderTopWidth: 1, minHeight: 40 })
  expect(screen.getByText(/Очень длинное название.*Услуга не указана/).props.numberOfLines).toBe(1)
  expect(screen.getAllByLabelText('По договору')).toHaveLength(1)
  expect(screen.queryByText('По договору')).toBeNull()
})
it('overflow and contacts do not open the card; local ID routes to existing editor', () => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  const screen = setup()
  press(screen.getByLabelText('Позвонить'))
  expect(Linking.openURL).toHaveBeenCalledWith('tel:79990000000')
  expect(screen.onPress).not.toHaveBeenCalled()
  press(screen.getByTestId('card-overflow'))
  expect(screen.getByTestId('card-overflow')).toHaveStyle({ width: 40, height: 40 })
  fireEvent.press(screen.getByText('Редактировать'))
  expect(router.push).toHaveBeenCalledWith('/events/edit/local-event')
  expect(screen.onPress).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('card'))
  expect(screen.onPress).toHaveBeenCalledTimes(1)
})
it('zero, one and many contact actions; additional contacts expand names, comments and actions', () => {
  expect(getQuickContactActions()).toEqual([])
  expect(getQuickContactActions({ _id: 'x' })).toEqual([])
  expect(getQuickContactActions({ _id: 'x', phone: '123', whatsappPhoneUnavailable: true, telegramPhoneUnavailable: true })).toHaveLength(1)
  expect(getQuickContactActions(client)).toHaveLength(6)
  const screen = setup({ otherContacts: [{ clientId: client._id, comment: 'Организатор на площадке' }, { clientId: 'deleted', comment: 'Старый контакт' }] }, { clientsById: new Map([[client._id, client]]) })
  press(screen.getByLabelText('Дополнительные контакты: 2'))
  expect(screen.getByText('Организатор на площадке')).toBeTruthy()
  expect(screen.getByText('Контакт недоступен')).toBeTruthy()
  expect(screen.getAllByLabelText('Telegram')).toHaveLength(2)
  expect(screen.onPress).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Открыть клиента'))
  expect(router.push).toHaveBeenCalledWith('/clients/local-client')
})
it('shows all channels in overflow, closes by outside and opens chosen channel', () => {
  const screen = setup()
  press(screen.getByLabelText('Все способы связи'))
  expect(screen.getByText('Электронная почта')).toBeTruthy()
  fireEvent.press(screen.getByText('Telegram'))
  expect(Linking.openURL).toHaveBeenCalledWith('https://t.me/anna')
  expect(screen.queryByText('Связаться с клиентом')).toBeNull()
  press(screen.getByTestId('card-overflow'))
  fireEvent.press(screen.getByTestId('quick-actions-outside', { includeHiddenElements: true }))
  expect(screen.queryByText('Редактировать')).toBeNull()
})
it.each(['draft', 'active', 'canceled', 'closed'] as const)('renders %s money semantics and missing client', (status) => {
  const screen = setup({ status }, { client: undefined })
  expect(screen.queryByText('Оплачено / договор')).toBeNull()
  if (status === 'closed') expect(screen.getByLabelText('Итог: 0 ₽')).toBeTruthy()
  else expect(screen.getAllByText('—')).toHaveLength(2)
  expect(screen.getByText('-')).toBeTruthy()
  expect(screen.queryByLabelText('Позвонить')).toBeNull()
})
it('renders import/API/obligation indicators and map action', () => {
  const screen = setup({ importedFromFile: true, clientData: { createdViaApi: true, sourceLabel: 'Tilda' } }, {
    transactions: [{ _id: 'tx', type: 'income', amount: 1000, paymentMethod: 'obligation' }],
  })
  expect(screen.getByLabelText('Импорт не проверен')).toBeTruthy()
  expect(screen.getByText('Tilda')).toBeTruthy()
  expect(screen.getByText('Обязательство')).toBeTruthy()
  press(screen.getByRole('link'))
  expect(Linking.openURL).toHaveBeenCalledWith(`https://2gis.ru/search/${encodeURIComponent('Красноярск')}`)
  expect(screen.onPress).not.toHaveBeenCalled()
})
it('syncing blocks tap, failed/conflict show explicit overlay and sync route', () => {
  const busy = setup({ syncStatus: 'syncing' })
  expect(busy.getByTestId('card-loading')).toBeTruthy()
  fireEvent.press(busy.getByTestId('card'))
  expect(busy.onPress).not.toHaveBeenCalled()
  busy.unmount()
  for (const syncStatus of ['failed', 'conflict'] as const) {
    const screen = setup({ syncStatus })
    press(screen.getByTestId('card-error'))
    expect(router.push).toHaveBeenCalledWith('/sync')
    expect(screen.onPress).not.toHaveBeenCalled()
    screen.unmount()
  }
})

describe('MobileEventCard', () => {
  it('показывает ключевые данные в иерархии PWA-карточки', () => {
    const onPress = jest.fn()
    const screen = render(
      <MobileEventCard
        event={{
          _id: 'event-1',
          status: 'active',
          eventType: 'Свадьба',
          eventDate: '2099-07-25T18:00:00+07:00',
          clientId: 'client-1',
          servicesIds: ['service-1', 'service-2'],
          contractSum: 30_000,
          waitDeposit: true,
          depositExpectedAmount: 15_000,
          depositDueAt: '2020-07-20T10:00:00+07:00',
          address: { town: 'Красноярск', street: 'Мира', house: '10' },
        }}
        client={{ _id: 'client-1', firstName: 'Анна', secondName: 'Иванова' }}
        services={[
          { _id: 'service-1', title: 'Ведение' },
          { _id: 'service-2', title: 'Аппаратура' },
        ]}
        transactions={[
          {
            _id: 'transaction-1',
            eventId: 'event-1',
            type: 'income',
            category: 'client_payment',
            amount: 10_000,
          },
        ]}
        testID="event-card"
        onPress={onPress}
      />
    )

    expect(screen.getByText('Свадьба • Ведение, Аппаратура')).toBeTruthy()
    expect(screen.getByText('Анна Иванова')).toBeTruthy()
    expect(screen.getByText('Красноярск, Мира, д.10')).toBeTruthy()
    expect(screen.getByText(/Просрочен задаток:.*15.*000 ₽/)).toBeTruthy()
    expect(screen.getByText(/10.*000 \/\s*30.*000 ₽/)).toBeTruthy()

    fireEvent.press(screen.getByTestId('event-card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

it.each([false, true])('пустые колонки сохраняют прочерки в обеих темах: dark=%s', (dark) => {
  const screen = setup({ status: 'draft', address: undefined, isByContract: false }, { client: undefined }, dark)
  expect(screen.getAllByText('—')).toHaveLength(2)
  expect(screen.getAllByText('-')).toHaveLength(2)
  expect(screen.queryByText('Без даты')).toBeNull()
  expect(screen.queryByText('Адрес не указан')).toBeNull()
  expect(screen.queryByText('0 ₽')).toBeNull()
  expect(screen.queryByText('Оплачено / договор')).toBeNull()
  expect(screen.getByLabelText('Клиент не указан')).toBeTruthy()
  expect(screen.queryByTestId('card-reminder')).toBeNull()
})
it.each([
  [0, 0, '—'], [0, 30000, '30 000 ₽'], [10000, 0, '10 000 ₽'],
  [30000, 30000, '30 000 ₽'], [10000, 30000, '10 000 / 30 000 ₽'],
])('финансы paid=%s contract=%s в одну строку', (paid, contractSum, expected) => {
  const screen = setup({ contractSum: Number(contractSum) }, { transactions: [{ _id: 'tx', eventId: event._id, amount: Number(paid), type: 'income' }] })
  expect(screen.getAllByText(String(expected)).length).toBeGreaterThan(0)
  expect(screen.queryByText('Оплачено / договор')).toBeNull()
})
it.each([false, true])('полосы draft/active/passed/closed/canceled независимы от view-chip: dark=%s', (dark) => {
  for (const [status, eventDate, marker] of [
    ['draft', undefined, '#f59e0b'], ['draft', '2099-10-09', '#f59e0b'], ['draft', '2020-10-09', '#f59e0b'],
    ['active', '2099-10-09', '#3b82f6'], ['active', '2020-10-09', '#9ca3af'],
    ['closed', '2020-10-09', '#10b981'], ['canceled', '2020-10-09', '#ef4444'],
  ] as const) {
    const screen = setup({ status, eventDate }, {}, dark)
    expect(screen.getByTestId('card-marker')).toHaveStyle({ backgroundColor: marker })
    expect(screen.queryByText('Дата прошла — уточните результат') !== null).toBe(status === 'draft' && eventDate === '2020-10-09')
    screen.unmount()
  }
})
it('адрес без ссылки, полное ФИО и компактный reminder с годом, действием и счётчиком', () => {
  const screen = setup({ address: { comment: 'У главного входа' }, additionalEvents: [
    { title: 'Связаться с клиентом', date: '2020-10-04T16:36:00' },
    { title: 'Отправить предложение', date: '2099-10-04T16:36:00' },
    { title: 'Выполнено', date: '2020-10-05T16:36:00', done: true },
    { title: 'Нет даты', date: null },
  ] }, { client: { ...client, thirdName: 'Ивановна' } })
  expect(screen.getByText('У главного входа')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByText('Анна Ивановна')).toBeTruthy()
  expect(screen.getByText('04.10.2020 16:36')).toBeTruthy()
  expect(screen.getByText('Связаться с клиентом')).toBeTruthy()
  expect(screen.getByText('+1')).toBeTruthy()
  expect(screen.getByTestId('card-reminder')).toHaveStyle({ borderWidth: 1, borderRadius: 8, alignSelf: 'flex-start', flexShrink: 1 })
})
it.each([false, true])('reminder использует временной статус темы: dark=%s', (dark) => {
  const screen = setup({ additionalEvents: [{ title: 'Позвонить', date: '2020-10-04T16:36:00' }] }, {}, dark)
  const palette = dark ? darkPalette : lightPalette
  expect(screen.getByTestId('card-reminder')).toHaveStyle({ backgroundColor: palette.status.overdue.background, borderColor: palette.status.overdue.border })
  expect(screen.getByText('Позвонить')).toHaveStyle({ color: palette.status.overdue.text })
})
it('дата — день недели и число в одной строке, месяц и время без точек', () => {
  const screen = setup({ eventDate: '2026-10-09T21:00:00' })
  expect(screen.getByText('ПТ')).toBeTruthy()
  expect(screen.getByText('09')).toBeTruthy()
  expect(screen.getByText('ОКТ')).toBeTruthy()
  expect(screen.getByText('21:00')).toBeTruthy()
  const heading = screen.getByTestId('card-date-heading')
  expect(heading).toHaveStyle({ flexDirection: 'row' })
  expect(within(heading).getByText('ПТ')).toBeTruthy()
  expect(within(heading).getByText('09')).toBeTruthy()
})
it('как PWA скрывает город по умолчанию только в подписи и сохраняет адрес карты', () => {
  const screen = setup({ address: { town: 'Красноярск', street: 'Мира', house: '10' } }, { defaultTown: ' красноярск ' })
  expect(screen.getByText('Мира, д.10')).toBeTruthy()
  press(screen.getByRole('link'))
  expect(Linking.openURL).toHaveBeenCalledWith(`https://2gis.ru/search/${encodeURIComponent('Красноярск, Мира, 10')}`)
  expect(screen.onPress).not.toHaveBeenCalled()
})
