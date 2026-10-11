import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { createEventDraft } from '../../shared/domain/eventForm'
import { EventGeneralSection } from './EventGeneralSection'
import { EventContactsSection } from './EventContactsSection'
import { EventFinanceSection } from './EventFinanceSection'
import { FinanceRelationPicker } from '../finance/FinanceRelationPicker'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon', FontAwesome5: 'Icon' }))

describe.each(['light', 'dark'] as const)('Подсказки настоящего редактора: %s', (mode) => {
  it('справка не меняет общий черновик, статусы, выбор клиента или финансовые действия', () => {
    const draft = createEventDraft()
    draft.values.contractSum = '25000'
    draft.values.waitDeposit = true
    draft.values.depositExpectedAmount = '5000'
    draft.values.isTransferred = true
    draft.source = { importedFromFile: true } as any
    draft.otherContacts = [{ localKey: 'contact', clientId: 'client', comment: 'Организатор' }]
    draft.tasks = [{ localKey: 'task', title: 'Позвонить', date: '', done: false } as any]
    const before = JSON.stringify(draft)
    const action = jest.fn()
    const screen = render(<ThemeProvider forcedMode={mode} storage={null}>
      <EventGeneralSection draft={draft} onChange={action} services={[]} clients={[]} eventTypes={[]} towns={[]} showTransfer genitive="заказа" />
      <EventContactsSection draft={draft} onChange={action} clients={[]} onCreateClient={action} onOpenClient={action} />
      <EventFinanceSection draft={draft} onChange={action} transactions={[]} eventId="local-event" documentsCount={0}
        onAddTransaction={action} onOpenTransaction={action} onDeleteTransaction={action} onOpenDocuments={action} onRetryTransactions={action} />
    </ThemeProvider>)
    const checks = [
      ['Описание', 'event.description'], ['Услуги', 'event.services'], ['Статус', 'event.status'],
      ['Передано коллеге', 'event.transfer'], ['Импорт из файла проверен', 'event.importChecked'],
      ['Клиент', 'event.client'], ['Дополнительные контакты', 'event.otherContacts'],
      ['Кем является', 'event.contactRole'], ['Задачи/События', 'event.tasks'], ['Сделано', 'event.taskDone'],
      ['Договорная сумма', 'event.contractSum'], ['Ждем задаток', 'event.waitDeposit'],
      ['Сумма задатка', 'event.depositAmount'], ['Дата ожидания задатка', 'event.depositDueAt'], ['По договору', 'event.byContract'],
    ] as const
    for (const [label, key] of checks) {
      fireEvent.press(screen.getByRole('button', { name: `Подсказка: ${label}` }))
      expect(screen.getByText(getFieldHelp(key))).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Закрыть подсказку' }))
      expect(screen.queryByText(getFieldHelp(key))).toBeNull()
    }
    expect(screen.getByTestId('event-contract-sum').props.value).toBe('25000')
    expect(action).not.toHaveBeenCalled()
    expect(JSON.stringify(draft)).toBe(before)
  })
  it('справка о связи транзакции не открывает выбор и не выполняет изменение', () => {
    const change = jest.fn()
    const screen = render(<ThemeProvider forcedMode={mode} storage={null}>
      <FinanceRelationPicker testID="relation" label="Работа" help={getFieldHelp('transaction.event')}
        value="one" options={[{ id: 'one', title: 'Выбранная работа' }]} onChange={change} />
    </ThemeProvider>)
    fireEvent.press(screen.getByRole('button', { name: 'Подсказка: Работа' }))
    expect(screen.getByText(getFieldHelp('transaction.event'))).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Закрыть подсказку' }))
    expect(screen.getByTestId('relation').props.accessibilityState.expanded).toBe(false)
    expect(change).not.toHaveBeenCalled()
  })
})
