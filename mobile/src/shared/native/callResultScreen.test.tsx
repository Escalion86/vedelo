import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import CallResultScreen from '../../../app/native/call-result'
let mockPending: any = { requestId: 'a-request', phone: '79991234567', direction: 'incoming', result: 'answered', note: 'Сохранённая заметка', clientId: null, eventId: null, nextContactAt: null, nextContactTitle: '' }
const mockPost = jest.fn(), mockFinish = jest.fn()
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ number: '79990000000' }), router: { replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('../hooks/useCachedEntities', () => ({ useCachedEntities: () => ({ data: [] }) }))
jest.mock('../api/client', () => ({ api: { post: (...args: unknown[]) => mockPost(...args) } }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => 1 }))
jest.mock('../sync/syncEngine', () => ({ runSync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('./callResultStore', () => ({ readCallResult: async () => mockPending, beginCallResult: jest.fn(), finishCallResult: (...args: unknown[]) => mockFinish(...args) }))
it('does not submit automatically; retries the saved attempt after network loss and remount', async () => {
  mockPost.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ success: true, data: { requestId: 'a-request', pending: false } })
  let screen = render(<CallResultScreen />)
  await screen.findByText('Незавершённое сохранение')
  expect(mockPost).not.toHaveBeenCalled()
  await act(async () => fireEvent.press(screen.getByText('Повторить сохранённую попытку')))
  expect(mockFinish).not.toHaveBeenCalled()
  screen.unmount(); screen = render(<CallResultScreen />)
  await screen.findByText('Незавершённое сохранение')
  await act(async () => fireEvent.press(screen.getByText('Повторить сохранённую попытку')))
  await screen.findByText('Итог сохранён и доступен в PWA.')
  expect(mockPost.mock.calls.map(call => call[1])).toEqual([mockPending, mockPending])
  expect(mockFinish).toHaveBeenCalledWith('a-request')
})
