import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { YandexLinkSection } from './YandexLinkSection'
import { api } from '../../shared/api/client'
import { beginYandex, linkYandex } from '../../shared/auth/yandex'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn() } }))
jest.mock('../../shared/auth/yandex', () => ({ beginYandex: jest.fn(), linkYandex: jest.fn() }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
const proof = { code: 'c'.repeat(43), verifier: 'v'.repeat(64), epoch: 0 }
beforeEach(() => {
  jest.resetAllMocks()
  ;(api.get as jest.Mock).mockResolvedValue({ data: { allowYandexAuth: true } })
  ;(beginYandex as jest.Mock).mockResolvedValue(proof)
  ;(linkYandex as jest.Mock).mockResolvedValue({ linked: true })
})
it.each(['light', 'dark'] as const)('%s: explicit link awaits confirmation and profile readback', async (mode) => {
  const onLinked = jest.fn().mockResolvedValue(undefined)
  const screen = render(<ThemeProvider forcedMode={mode} storage={null}><YandexLinkSection linked={false} disabled={false} onLinked={onLinked} /></ThemeProvider>)
  expect(beginYandex).not.toHaveBeenCalled()
  const button = await screen.findByText('Подключить Яндекс ID')
  fireEvent.press(button); fireEvent.press(button)
  await waitFor(() => expect(onLinked).toHaveBeenCalledTimes(1))
  expect(beginYandex).toHaveBeenCalledTimes(1); expect(beginYandex).toHaveBeenCalledWith(true)
  expect(linkYandex).toHaveBeenCalledWith(proof)
})
it('a wrong phone error preserves the profile and does not announce a link', async () => {
  ;(linkYandex as jest.Mock).mockRejectedValue(new Error('Номер телефона не совпадает'))
  const onLinked = jest.fn(), screen = render(<YandexLinkSection linked={false} disabled={false} onLinked={onLinked} />)
  fireEvent.press(await screen.findByText('Подключить Яндекс ID'))
  await screen.findByText('Номер телефона не совпадает')
  expect(onLinked).not.toHaveBeenCalled()
})
it('an unmounted account cannot complete an old browser flow', async () => {
  let finish: (value: unknown) => void = () => undefined
  ;(beginYandex as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const onLinked = jest.fn(), screen = render(<YandexLinkSection linked={false} disabled={false} onLinked={onLinked} />)
  fireEvent.press(await screen.findByText('Подключить Яндекс ID')); screen.unmount()
  await act(async () => finish(proof))
  expect(linkYandex).not.toHaveBeenCalled(); expect(onLinked).not.toHaveBeenCalled()
})
