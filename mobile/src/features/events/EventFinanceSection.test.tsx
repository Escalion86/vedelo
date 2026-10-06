import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { Transaction } from '../../shared/domain/types'
import { createEventDraft, type EventDraft } from '../../shared/domain/eventForm'
import { formatEventCardMoney } from './eventCard'
import { EventFinanceSection } from './EventFinanceSection'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  _id: 't-income',
  eventId: 'local-event',
  amount: 5000,
  type: 'income',
  category: 'deposit',
  date: '2026-10-01',
  ...overrides,
})

const setup = (draft: EventDraft, props: Partial<React.ComponentProps<typeof EventFinanceSection>> = {}) => {
  const onChange = jest.fn()
  const onAddTransaction = jest.fn()
  const onOpenTransaction = jest.fn()
  const onDeleteTransaction = jest.fn()
  const onOpenDocuments = jest.fn()
  const onRetryTransactions = jest.fn()
  const screen = render(
    <ThemeProvider storage={null} forcedMode="light">
      <EventFinanceSection draft={draft} onChange={onChange} transactions={[]} eventId="local-event"
        documentsCount={0} onAddTransaction={onAddTransaction} onOpenTransaction={onOpenTransaction}
        onDeleteTransaction={onDeleteTransaction} onOpenDocuments={onOpenDocuments}
        onRetryTransactions={onRetryTransactions} {...props} />
    </ThemeProvider>
  )
  return { ...screen, onChange, onAddTransaction, onOpenTransaction, onDeleteTransaction, onOpenDocuments, onRetryTransactions }
}
const lastDraft = (spy: jest.Mock): EventDraft => spy.mock.calls[spy.mock.calls.length - 1][0]

beforeEach(() => jest.clearAllMocks())

it('Q: договорная сумма, задаток, срок, комментарий и договорность меняются только в общем draft', () => {
  const screen = setup(createEventDraft())
  expect(screen.queryByText('Ждем задаток')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Договорная сумма'), '25000')
  expect(lastDraft(screen.onChange).values.contractSum).toBe('25000')
  fireEvent.press(screen.getByText('Ждем задаток'))
  expect(lastDraft(screen.onChange).values.waitDeposit).toBe(true)

  const withDeposit = lastDraft(screen.onChange)
  screen.rerender(
    <ThemeProvider storage={null} forcedMode="light">
      <EventFinanceSection draft={withDeposit} onChange={screen.onChange} transactions={[]} eventId="local-event"
        documentsCount={0} onAddTransaction={screen.onAddTransaction} onOpenTransaction={screen.onOpenTransaction}
        onDeleteTransaction={screen.onDeleteTransaction} onOpenDocuments={screen.onOpenDocuments}
        onRetryTransactions={screen.onRetryTransactions} />
    </ThemeProvider>
  )
  fireEvent.changeText(screen.getByLabelText('Сумма задатка'), '5000')
  expect(lastDraft(screen.onChange).values.depositExpectedAmount).toBe('5000')
  fireEvent.changeText(screen.getByLabelText('Дата ожидания задатка'), '2026-10-20 12:00')
  expect(lastDraft(screen.onChange).values.depositDueAt).toBe('2026-10-20 12:00')
  fireEvent.changeText(screen.getByLabelText('Комментарий по финансам'), 'Оплата частями')
  expect(lastDraft(screen.onChange).values.financeComment).toBe('Оплата частями')
  fireEvent.press(screen.getByText('По договору'))
  expect(lastDraft(screen.onChange).values.isByContract).toBe(true)
})

it('Q: фактический задаток в транзакциях скрывает ожидание и объясняет почему', () => {
  const screen = setup(createEventDraft(), { transactions: [transaction()] })
  expect(screen.queryByText('Ждем задаток')).toBeNull()
  expect(screen.getByText('Задаток отмечен фактической транзакцией. Ожидание задатка скрыто.')).toBeTruthy()
})

it('Q: показывает только транзакции этой работы и отделяет обязательства от факта', () => {
  const screen = setup(createEventDraft(), {
    transactions: [
      transaction(),
      transaction({ _id: 't-expense', amount: 700, type: 'expense', category: 'travel' }),
      transaction({ _id: 't-obligation', amount: 30000, type: 'income', category: 'final_payment', paymentMethod: 'obligation' }),
      transaction({ _id: 't-other', eventId: 'other-event', amount: 1000, category: 'tips' }),
    ],
  })
  expect(screen.getByTestId('event-finance-fact')).toHaveTextContent(
    `Факт: поступления ${formatEventCardMoney(5000)} · расходы ${formatEventCardMoney(700)}`
  )
  expect(screen.getByTestId('event-finance-obligations')).toHaveTextContent(`Обязательства: ${formatEventCardMoney(30000)}`)
  expect(screen.getByText('Поступления')).toBeTruthy()
  expect(screen.getByText('Расходы')).toBeTruthy()
  expect(screen.getByText('Обязательства')).toBeTruthy()
  expect(screen.queryByText(formatEventCardMoney(1000))).toBeNull()
  expect(screen.getByText('Обязательство')).toBeTruthy()
  expect(screen.getByTestId('event-transaction-t-obligation-date')).toHaveTextContent(/^Плановая дата/)
  expect(screen.getByTestId('event-transaction-t-income-date')).toHaveTextContent(/^Дата/)
})

it('Q: ошибка чтения транзакций не превращается в нули и предлагает повтор', () => {
  const screen = setup(createEventDraft(), { transactionsError: true, transactions: [transaction()] })
  expect(screen.getByText('Не удалось прочитать транзакции. Факт и обязательства недоступны.')).toBeTruthy()
  expect(screen.queryByText('Поступления')).toBeNull()
  expect(screen.queryByTestId('event-finance-fact')).toBeNull()
  fireEvent.press(screen.getByText('Повторить загрузку транзакций'))
  expect(screen.onRetryTransactions).toHaveBeenCalledTimes(1)
})

it('Q: транзакцию можно добавить, открыть и удалить только после подтверждения', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  const screen = setup(createEventDraft(), { transactions: [transaction()] })
  fireEvent.press(screen.getByText('Добавить транзакцию'))
  expect(screen.onAddTransaction).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByLabelText('Редактировать транзакцию'))
  expect(screen.onOpenTransaction).toHaveBeenCalledWith('t-income')
  fireEvent.press(screen.getByLabelText('Удалить транзакцию'))
  expect(alert).toHaveBeenCalledTimes(1)
  expect(screen.onDeleteTransaction).not.toHaveBeenCalled()
  const buttons = alert.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>
  buttons.find((button) => button.style === 'cancel')?.onPress?.()
  expect(screen.onDeleteTransaction).not.toHaveBeenCalled()
  buttons.find((button) => button.style === 'destructive')?.onPress?.()
  expect(screen.onDeleteTransaction).toHaveBeenCalledWith('t-income')
  alert.mockRestore()
})

it('Q: новая работа не открывает транзакции и документы до явного сохранения', () => {
  const screen = setup(createEventDraft(), { eventId: '', documentsCount: 0 })
  expect(screen.getByText('Сначала сохраните заявку — после этого появятся связанные транзакции.')).toBeTruthy()
  expect(screen.getByText('Файлы и документы доступны после сохранения заявки.')).toBeTruthy()
  expect(screen.getByText('Документов: 0')).toBeTruthy()
  fireEvent.press(screen.getByText('Добавить транзакцию'))
  expect(screen.onAddTransaction).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Файлы и документы'))
  expect(screen.onOpenDocuments).not.toHaveBeenCalled()
})

it('Q: сохранённая работа открывает документы и показывает их число', () => {
  const screen = setup(createEventDraft(), { documentsCount: 2 })
  expect(screen.getByText('Документов: 2')).toBeTruthy()
  fireEvent.press(screen.getByText('Файлы и документы'))
  expect(screen.onOpenDocuments).toHaveBeenCalledTimes(1)
})
