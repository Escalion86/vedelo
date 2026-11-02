import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { PromoCodeRedeem } from './PromoCodeRedeem'
const mockPost = jest.fn(), mockRefresh = jest.fn(), mockInvalidate = jest.fn()
let mockEpoch = 1
jest.mock('../../shared/api/client', () => ({ api: { post: (...args: unknown[]) => mockPost(...args) } }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ refreshUser: mockRefresh }) }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
beforeEach(() => { jest.clearAllMocks(); mockEpoch = 1; mockRefresh.mockResolvedValue(undefined); mockInvalidate.mockResolvedValue(undefined) })
it('lost response can retry the same code and shows the server receipt without claiming another credit', async () => {
  mockPost.mockRejectedValueOnce(Error('network')).mockResolvedValueOnce({ success: true, data: { alreadyUsed: true, amount: 500 } })
  const screen = render(<PromoCodeRedeem />)
  fireEvent.changeText(screen.getByLabelText('Введите промокод'), ' BONUS ')
  await act(async () => fireEvent.press(screen.getByText('Активировать промокод')))
  expect(screen.getByText(/Результат не подтверждён/)).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByText('Активировать промокод')))
  await screen.findByText('Этот промокод уже использован. Повторного начисления нет.')
  expect(mockPost.mock.calls.map(call => call[1])).toEqual([{ code: 'BONUS' }, { code: 'BONUS' }])
  expect(mockRefresh).toHaveBeenCalledTimes(2)
})
it('double press submits once; a result from a previous account is discarded', async () => {
  let finish!: (value: unknown) => void
  mockPost.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const screen = render(<PromoCodeRedeem />)
  fireEvent.changeText(screen.getByLabelText('Введите промокод'), 'BONUS')
  fireEvent.press(screen.getByText('Активировать промокод')); fireEvent.press(screen.getByText('Активировать промокод'))
  expect(mockPost).toHaveBeenCalledTimes(1)
  mockEpoch++
  await act(async () => finish({ success: true, data: { amount: 500 } }))
  expect(screen.queryByText('Промокод активирован.')).toBeNull()
  expect(mockRefresh).not.toHaveBeenCalled()
})
