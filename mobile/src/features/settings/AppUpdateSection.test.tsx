import React from 'react'
import { Linking, Platform } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { AppUpdateSection } from './AppUpdateSection'
import { checkAppUpdate, parseNativeVersionCode } from './appUpdate'

let mockChannel: string
jest.mock('expo-application', () => ({
  applicationId: 'ru.escalion.vedelo',
  nativeApplicationVersion: '1.1.4',
  nativeBuildVersion: '30',
}))
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get expoConfig() { return { extra: { androidUpdateChannel: mockChannel } } } },
}))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://vedelo.ru/api/' } }))

const openURL = jest.spyOn(Linking, 'openURL')
const fetchRelease = jest.spyOn(global, 'fetch')
const platform = Platform.OS
const packageName = 'ru.escalion.vedelo'
const apkUrl = 'https://vedelo.ru/download/vedelo.apk'
const release = { packageName, downloadUrl: apkUrl, versionCode: 31, versionName: '1.1.5' }
const response = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) }) as Response
const draw = (mode: 'light' | 'dark' = 'light') => render(
  <ThemeProvider forcedMode={mode} storage={null}><AppUpdateSection /></ThemeProvider>
)

beforeEach(() => {
  mockChannel = 'direct'
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
  fetchRelease.mockReset()
  openURL.mockReset().mockResolvedValue(undefined)
})

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
  jest.restoreAllMocks()
})

it.each(['light', 'dark'] as const)('shows a newer APK and opens it after a download press in %s', async (mode) => {
  fetchRelease.mockResolvedValue(response(release))
  const screen = draw(mode)
  expect(screen.getByText('Версия 1.1.4 · сборка 30')).toBeTruthy()
  expect(fetchRelease).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: 'Проверить обновление' }))

  await screen.findByText('Доступна версия 1.1.5.')
  expect(fetchRelease).toHaveBeenCalledWith('https://vedelo.ru/api/mobile/v1/app-update?packageName=ru.escalion.vedelo', {
    headers: { Accept: 'application/json' }, credentials: 'omit', signal: expect.anything(),
  })
  expect(openURL).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole('button', { name: 'Скачать APK' }))
  await waitFor(() => expect(openURL).toHaveBeenCalledWith(apkUrl))
})

it('recovers after a network error and distinguishes absent and current releases', async () => {
  fetchRelease.mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response(null))
    .mockResolvedValueOnce(response({ ...release, versionName: '9.9.9', versionCode: 30 }))
  const screen = draw()
  fireEvent.press(screen.getByRole('button', { name: 'Проверить обновление' }))
  fireEvent.press(await screen.findByRole('button', { name: 'Повторить проверку' }))
  await screen.findByText('Обновление пока не опубликовано.')
  fireEvent.press(screen.getByRole('button', { name: 'Проверить обновление' }))
  await screen.findByText('У вас актуальная версия.')
  expect(screen.queryByRole('button', { name: 'Скачать APK' })).toBeNull()
  expect(openURL).not.toHaveBeenCalled()
})

it('opens the official Play listing without checking for an APK', async () => {
  mockChannel = 'play'
  const screen = draw()
  expect(screen.queryByRole('button', { name: 'Проверить обновление' })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: 'Открыть Google Play' }))
  await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=ru.escalion.vedelo'))
  expect(fetchRelease).not.toHaveBeenCalled()
})

it('checks the separate EAS APK channel when installed from that build', async () => {
  mockChannel = 'eas-apk'
  fetchRelease.mockResolvedValue(response(null))
  const screen = draw()
  fireEvent.press(screen.getByRole('button', { name: 'Проверить обновление' }))
  await screen.findByText('Обновление пока не опубликовано.')
  expect(fetchRelease.mock.calls[0][0]).toBe('https://vedelo.ru/api/mobile/v1/app-update?packageName=ru.escalion.vedelo&channel=eas-apk')
})

it.each([
  { packageName: 'ru.escalion.vedelo.dev' },
  { versionCode: '31' },
  { versionCode: 31.5 },
  { versionCode: 2_100_000_001 },
  { versionName: '<b>1.1.5</b>' },
  { downloadUrl: 'http://vedelo.ru/vedelo.apk' },
  { downloadUrl: 'https://vedelo.ru.example.org/vedelo.apk' },
  { downloadUrl: 'https://vedelo.ru@example.org/vedelo.apk' },
  { downloadUrl: 'https://user@vedelo.ru/vedelo.apk' },
  { downloadUrl: 'https://vedelo.ru:8443/vedelo.apk' },
  { downloadUrl: 'https://vedelo.ru/vedelo.apk#file' },
  { downloadUrl: 'https://vedelo.ru/vedelo.apk\n' },
])('rejects malformed or untrusted release fields: %j', async (overrides) => {
  fetchRelease.mockResolvedValue(response({ ...release, ...overrides }))
  await expect(checkAppUpdate(packageName, 30, new AbortController().signal)).rejects.toThrow()
})

it('compares the numeric Android build and preserves the cloud download address exactly', async () => {
  const downloadUrl = 'https://cloud.escalion.ru/api/download?file=android&key=demo'
  fetchRelease.mockResolvedValue(response({ ...release, downloadUrl }))

  expect(parseNativeVersionCode('30')).toBe(30)
  expect(parseNativeVersionCode('1.1.4')).toBeNull()
  expect(parseNativeVersionCode('2100000001')).toBeNull()
  await expect(checkAppUpdate(packageName, 32, new AbortController().signal)).resolves.toEqual({ kind: 'current' })
  await expect(checkAppUpdate(packageName, 30, new AbortController().signal)).resolves.toEqual({
    kind: 'available', release: { versionName: '1.1.5', downloadUrl },
  })
})
