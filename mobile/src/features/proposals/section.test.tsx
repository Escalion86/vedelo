jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'test-user', tenantId: 'test-tenant' } }) }))
import React from 'react'
import { Alert, Share } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
const mockList = jest.fn(),
  mockTemplates = jest.fn(),
  mockCreate = jest.fn(),
  mockAction = jest.fn(),
  mockRemove = jest.fn(),
  mockGet = jest.fn(),
  mockRenew = jest.fn(),
  mockPush = jest.fn(),
  mockReadEvent = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: any[]) => mockPush(...a) },
  useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]),
}))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock(
  './api',
  () => ({
    proposalsApi: {
      restoreCreate: async () => null,
      readEvent: (...a: any[]) => mockReadEvent(...a),
      list: (...a: any[]) => mockList(...a),
      templates: () => mockTemplates(),
      create: (...a: any[]) => mockCreate(...a),
      action: (...a: any[]) => mockAction(...a),
      remove: (...a: any[]) => mockRemove(...a),
      get: (...a: any[]) => mockGet(...a),
      renew: (...a: any[]) => mockRenew(...a),
    },
  })
)
let subject: any = {}
try {
  subject = require('./EventProposalsSection')
} catch (error) {
  if (
    !String((error as { message?: string })?.message).includes(
      "Cannot find module './EventProposalsSection'"
    )
  )
    throw error
}
const chosen = {
  _id: 'p',
  eventId: 'e',
  title: 'Принятое КП',
  version: 1,
  status: 'expired',
  packages: [],
  selectedPackageId: 'main',
  selectedAt: '2026-10-01',
  appliedAt: '2026-10-02',
  appliedPackageId: 'main',
  appliedSelectionAt: '2026-10-01',
}
function draw(props: any = {}) {
  expect(subject.EventProposalsSection).toBeDefined()
  const Component = subject.EventProposalsSection
  return render(<Component eventId="e" {...props} />)
}
beforeEach(() => {
  jest.clearAllMocks()
  mockReadEvent.mockReset().mockResolvedValue({ _id: 'e', status: 'active' })
  mockList.mockResolvedValue([chosen])
  mockTemplates.mockResolvedValue([
    { _id: 't', name: 'Шаблон', status: 'active' },
  ])
  mockCreate.mockResolvedValue({ _id: 'new', eventId: 'e', status: 'draft' })
})
it('accepted/applied visible after expiry and selected revoke disabled', async () => {
  const screen = draw()
  await screen.findByText('Принятое КП')
  expect(screen.getByText('Принято клиентом · применено')).toBeTruthy()
  expect(
    screen.getByTestId('proposal-revoke-p').props.accessibilityState.disabled
  ).toBe(true)
})
it('opens the renewal calendar before any write, keeps the date on error and retries explicitly', async () => {
  const screen = draw()
  fireEvent.press(await screen.findByText('Продлить срок'))
  expect(screen.getByText('Продлить срок КП')).toBeTruthy()
  expect(mockRenew).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Отмена'))
  expect(mockRenew).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Продлить срок'))
  mockRenew.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ...chosen, status: 'published', validUntil: '2099-01-01' })
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Продлить' })))
  await screen.findByText('Не удалось подтвердить продление. Проверьте сеть и повторите.')
  const confirm = screen.getByRole('button', { name: 'Продлить' })
  expect(confirm.props.accessibilityState.disabled).toBe(false)
  await act(async () => fireEvent.press(confirm))
  expect(mockRenew).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(screen.queryByText('Продлить срок КП')).toBeNull())
  expect(mockRenew.mock.calls[1].slice(0, 3)).toEqual(mockRenew.mock.calls[0].slice(0, 3))
  expect(screen.getByText('Принято клиентом · применено')).toBeTruthy()
})
it('save as template opens an unsaved editor without creating a template or proposal', async () => {
  const screen = draw()
  await screen.findByText('Принятое КП')
  fireEvent.press(screen.getByText('Сохранить как шаблон'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/more/proposal-templates/[id]', params: { id: 'new', sourceProposalId: 'p' } })
  expect(mockCreate).not.toHaveBeenCalled()
  expect(mockAction).not.toHaveBeenCalled()
})
it('published editing preserves the proposal ID, and interrupted application can be completed', async () => {
  mockList.mockResolvedValue([{ ...chosen, status: 'published', applyOperation: { state: 'event_updated' }, applicationPending: true }])
  const screen = draw()
  await screen.findByText('Применение не завершено')
  expect(screen.queryByText('Принято клиентом · применено')).toBeNull()
  expect(screen.getByTestId('proposal-apply-p').props.accessibilityState.disabled).toBe(false)
  expect(screen.getByText('Завершить применение')).toBeTruthy()
  fireEvent.press(screen.getByTestId('proposal-edit-p'))
  expect(mockPush).toHaveBeenCalledWith('/events/e/proposals/p')
  expect(mockCreate).not.toHaveBeenCalled()
})
it('create from template delegates POST and opens independent editor', async () => {
  const screen = draw()
  await screen.findByText('Принятое КП')
  fireEvent.press(screen.getByTestId('proposal-create'))
  fireEvent.press(screen.getByText('Шаблон'))
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith('e', { templateId: 't' }, expect.objectContaining({ expectedIdentity: expect.any(String), signal: expect.anything() }))
  )
  expect(mockPush).toHaveBeenCalledWith('/events/e/proposals/new')
})
it('network list failure distinct from empty with explicit retry', async () => {
  mockList.mockRejectedValueOnce(Error('network'))
  const screen = draw()
  await screen.findByText('Не удалось загрузить предложения.')
  expect(screen.queryByText('Предложений пока нет')).toBeNull()
  fireEvent.press(screen.getByText('Повторить загрузку КП'))
  await screen.findByText('Принятое КП')
})
it('selected delete confirms preservation and reread event returned to parent', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const onApplied = jest.fn()
  mockRemove.mockResolvedValue({
    items: [],
    event: {
      _id: 'e',
      contractSum: 500,
      servicesIds: ['s'],
      agreedProposal: { packageId: 'main' },
    },
  })
  const screen = draw({ onApplied })
  await screen.findByText('Принятое КП')
  fireEvent.press(screen.getByTestId('proposal-delete-p'))
  expect(mockRemove).not.toHaveBeenCalled()
  expect(spy.mock.calls[0][1]).toMatch(/услуги и сумма.*сохранятся/i)
  await act(async () =>
    spy.mock.calls[0][2]!.find((b) => b.style === 'destructive')!.onPress!()
  )
  await waitFor(() =>
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ contractSum: 500 })
    )
  )
  spy.mockRestore()
})
it('share cancelled does not mark sent or mutate proposal', async () => {
  mockList.mockResolvedValue([{ ...chosen, status: 'published' }])
  mockGet.mockResolvedValue({
    ...chosen,
    status: 'published',
    renderedMessage: 'Сообщение со ссылкой',
  })
  const spy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.dismissedAction })
  const screen = draw()
  await screen.findByText('Принятое КП')
  fireEvent.press(screen.getByTestId('proposal-share-p'))
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith({ message: 'Сообщение со ссылкой' })
  )
  expect(mockAction).not.toHaveBeenCalled()
  spy.mockRestore()
})
it('closed event cannot apply selection', async () => {
  const screen = draw({ eventStatus: 'closed' })
  await screen.findByText('Принятое КП')
  expect(
    screen.getByTestId('proposal-apply-p').props.accessibilityState.disabled
  ).toBe(true)
})
it('late read for previous event cannot replace current list', async () => {
  let finish!: (value: any) => void
  mockList.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const screen = draw()
  const Component = subject.EventProposalsSection
  mockList.mockResolvedValueOnce([
    { ...chosen, _id: 'q', eventId: 'other', title: 'Точное КП' },
  ])
  screen.rerender(<Component eventId="other" />)
  await screen.findByText('Точное КП')
  await act(async () => finish([chosen]))
  expect(screen.queryByText('Принятое КП')).toBeNull()
})

it('fresh server status closes apply even when the parent has not supplied status', async () => {
  mockReadEvent.mockResolvedValueOnce({ _id: 'e', status: 'closed' })
  mockList.mockResolvedValueOnce([{ ...chosen, appliedAt: null }])
  const screen = draw()
  await screen.findByText('Принятое КП')
  expect(
    screen.getByTestId('proposal-apply-p').props.accessibilityState.disabled
  ).toBe(true)
  expect(mockReadEvent).toHaveBeenCalledWith('e', expect.objectContaining({ expectedIdentity: expect.any(String), signal: expect.anything() }))
})
it('server status delivery history uses only the latest result of each media item', async () => {
  mockList.mockResolvedValueOnce([
    {
      ...chosen,
      status: 'published',
      delivery: [
        { mediaId: 'm', type: 'image', status: 'failed' },
        { mediaId: 'm', type: 'image', status: 'sent' },
      ],
    },
  ])
  const screen = draw()
  await screen.findByText('Принятое КП')
  expect(screen.queryByText('Повторить недоставленное в Telegram')).toBeNull()
})
