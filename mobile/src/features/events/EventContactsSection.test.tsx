import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { Client } from '../../shared/domain/types'
import { createEventDraft, type EventDraft } from '../../shared/domain/eventForm'
import { EventContactsSection } from './EventContactsSection'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))

const clients: Client[] = [
  { _id: 'client-a', firstName: 'Анна', secondName: 'Петрова', phone: '79990000000', telegram: '@anna' },
  { _id: 'client-b', firstName: 'Борис', phone: '79995550000' },
  { _id: 'client-c', firstName: 'Вера', phone: '79992223344' },
]

const setup = (draft: EventDraft = createEventDraft()) => {
  const onChange = jest.fn()
  const onCreateClient = jest.fn()
  const onOpenClient = jest.fn()
  const screen = render(
    <ThemeProvider storage={null} forcedMode="light">
      <EventContactsSection draft={draft} onChange={onChange} clients={clients}
        onCreateClient={onCreateClient} onOpenClient={onOpenClient} />
    </ThemeProvider>
  )
  return { ...screen, onChange, onCreateClient, onOpenClient }
}
const lastDraft = (spy: jest.Mock): EventDraft => spy.mock.calls[spy.mock.calls.length - 1][0]

beforeEach(() => jest.clearAllMocks())

it('P: поиск основного клиента по имени/телефону выбирает клиента без служебных полей', () => {
  const screen = setup()
  expect(screen.getByText('Основной клиент')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-main-client-search'), 'петрова')
  expect(screen.getByTestId('event-main-client-option-client-a')).toBeTruthy()
  expect(screen.queryByTestId('event-main-client-option-client-b')).toBeNull()
  fireEvent.press(screen.getByTestId('event-main-client-option-client-a'))
  const next = lastDraft(screen.onChange)
  expect(next.values.clientId).toBe('client-a')
  expect(Object.keys(next.values)).not.toContain('tenantId')
  fireEvent.changeText(screen.getByTestId('event-main-client-search'), '7999555')
  fireEvent.press(screen.getByTestId('event-main-client-option-client-b'))
  expect(lastDraft(screen.onChange).values.clientId).toBe('client-b')
})

it('P: выбранный клиент показывает быстрые контакты, карандаш и очистку выбора', () => {
  const draft = createEventDraft()
  draft.values.clientId = 'client-a'
  const screen = setup(draft)
  expect(screen.getByText('Анна Петрова')).toBeTruthy()
  expect(screen.getByLabelText('Позвонить')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Редактировать клиента'))
  expect(screen.onOpenClient).toHaveBeenCalledWith('client-a')
  fireEvent.press(screen.getByText('Очистить выбор'))
  expect(lastDraft(screen.onChange).values.clientId).toBe('')
})

it('P: пустой основной клиент предлагает создать нового через клиентский редактор', () => {
  const screen = setup()
  fireEvent.press(screen.getByText('Новый клиент'))
  expect(screen.onCreateClient).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByTestId('event-main-client-option-client-c'))
  expect(lastDraft(screen.onChange).values.clientId).toBe('client-c')
})

it('P: дополнительные контакты не дублируют основной и друг друга, комментарий сохраняется', () => {
  const draft = createEventDraft()
  draft.values.clientId = 'client-a'
  draft.otherContacts = [{ localKey: 'contact-0', clientId: 'client-b', comment: '' }]
  const screen = setup(draft)
  fireEvent.press(screen.getByText('Добавить контакт'))
  const added = lastDraft(screen.onChange)
  expect(added.otherContacts).toHaveLength(2)
  expect(added.otherContacts[1]).toMatchObject({ clientId: '', comment: '' })

  const withTwo = lastDraft(screen.onChange)
  screen.rerender(
    <ThemeProvider storage={null} forcedMode="light">
      <EventContactsSection draft={withTwo} onChange={screen.onChange} clients={clients}
        onCreateClient={screen.onCreateClient} onOpenClient={screen.onOpenClient} />
    </ThemeProvider>
  )
  fireEvent.changeText(screen.getByTestId('event-other-contact-1-search'), '')
  expect(screen.queryByTestId('event-other-contact-1-option-client-a')).toBeNull()
  expect(screen.queryByTestId('event-other-contact-1-option-client-b')).toBeNull()
  expect(screen.getByTestId('event-other-contact-1-option-client-c')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-other-contact-0-comment'), 'Организатор')
  expect(lastDraft(screen.onChange).otherContacts[0].comment).toBe('Организатор')
  fireEvent.press(screen.getByTestId('event-other-contact-0-remove'))
  const remaining = lastDraft(screen.onChange).otherContacts
  expect(remaining).toHaveLength(1)
  expect(remaining[0].clientId).toBe('')
})

it('P: задача помечается выполненной и снимается с сохранением doneAt', () => {
  const draft = createEventDraft()
  draft.tasks = [
    { localKey: 'task-0', title: 'Позвонить', description: '', dateInput: '2026-10-10 12:00', done: false, doneAt: null },
    { localKey: 'task-1', title: 'Отправить счёт', description: 'По почте', dateInput: '', done: true, doneAt: '2026-10-01T10:00:00.000Z' },
  ]
  const screen = setup(draft)
  expect(screen.getByDisplayValue('Позвонить')).toBeTruthy()
  expect(screen.queryByDisplayValue('Отправить счёт')).toBeNull()
  fireEvent.press(screen.getByTestId('event-task-0-done'))
  const done = lastDraft(screen.onChange).tasks[0]
  expect(done.done).toBe(true)
  expect(typeof done.doneAt).toBe('string')

  const toggled = lastDraft(screen.onChange)
  screen.rerender(
    <ThemeProvider storage={null} forcedMode="light">
      <EventContactsSection draft={toggled} onChange={screen.onChange} clients={clients}
        onCreateClient={screen.onCreateClient} onOpenClient={screen.onOpenClient} />
    </ThemeProvider>
  )
  fireEvent.press(screen.getByText('Показывать выполненные'))
  expect(screen.getByDisplayValue('Отправить счёт')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-task-1-done'))
  const undone = lastDraft(screen.onChange).tasks[1]
  expect(undone).toMatchObject({ done: false, doneAt: null })
})

it('P: добавление задачи создаёт черновик, все выполненные скрыты по умолчанию', () => {
  const draft = createEventDraft()
  const screen = setup(draft)
  fireEvent.press(screen.getByText('Добавить задачу/событие'))
  const added = lastDraft(screen.onChange)
  expect(added.tasks).toHaveLength(1)
  expect(added.tasks[0]).toMatchObject({ title: '', description: '', dateInput: '', done: false, doneAt: null })
  screen.rerender(
    <ThemeProvider storage={null} forcedMode="light">
      <EventContactsSection draft={added} onChange={screen.onChange} clients={clients}
        onCreateClient={screen.onCreateClient} onOpenClient={screen.onOpenClient} />
    </ThemeProvider>
  )
  fireEvent.changeText(screen.getByLabelText('Что сделать'), 'Уточнить адрес')
  expect(lastDraft(screen.onChange).tasks[0].title).toBe('Уточнить адрес')
})

it('P: фильтр выполненных показывает состояние и подсказку при пустой выдаче', () => {
  const draft = createEventDraft()
  draft.tasks = [{ localKey: 'task-0', title: 'Готово', description: '', dateInput: '', done: true, doneAt: '2026-10-01T10:00:00.000Z' }]
  const screen = setup(draft)
  expect(screen.getByText('Нет событий для выбранного фильтра')).toBeTruthy()
  fireEvent.press(screen.getByText('Показывать выполненные'))
  expect(screen.getByDisplayValue('Готово')).toBeTruthy()
})

it('P: удаление сохранённой задачи требует подтверждения, новая удаляется сразу', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  const draft = createEventDraft()
  draft.tasks = [
    { _id: 'server-task', localKey: 'task-0', title: 'Сохранённая', description: '', dateInput: '', done: false, doneAt: null },
    { localKey: 'task-1', title: 'Черновик', description: '', dateInput: '', done: false, doneAt: null },
  ]
  const screen = setup(draft)
  fireEvent.press(screen.getByTestId('event-task-1-remove'))
  expect(alert).not.toHaveBeenCalled()
  expect(lastDraft(screen.onChange).tasks.map((task) => task.localKey)).toEqual(['task-0'])
  const afterDraftRemoval = lastDraft(screen.onChange)
  screen.rerender(
    <ThemeProvider storage={null} forcedMode="light">
      <EventContactsSection draft={afterDraftRemoval} onChange={screen.onChange} clients={clients}
        onCreateClient={screen.onCreateClient} onOpenClient={screen.onOpenClient} />
    </ThemeProvider>
  )
  fireEvent.press(screen.getByTestId('event-task-0-remove'))
  expect(alert).toHaveBeenCalledTimes(1)
  const buttons = alert.mock.calls[0][2] as Array<{ text: string; style?: string; onPress?: () => void }>
  const cancel = buttons.find((button) => button.style === 'cancel')
  cancel?.onPress?.()
  expect(lastDraft(screen.onChange).tasks.map((task) => task.localKey)).toEqual(['task-0'])
  buttons.find((button) => button.style === 'destructive')?.onPress?.()
  expect(lastDraft(screen.onChange).tasks).toHaveLength(0)
  alert.mockRestore()
})
