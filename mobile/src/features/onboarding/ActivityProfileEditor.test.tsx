import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { api } from '../../shared/api/client'
import { MOBILE_SETTINGS_QUERY_KEY } from '../../shared/hooks/useWorkItemTerminology'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { cacheSettings } from '../settings/settingsEditor'
import { ActivityProfileSettings, RequiredActivityProfile } from './ActivityProfileEditor'
import type { ActivityProfile } from './activityProfile'

jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn(), patch: jest.fn() } }))
jest.mock('../settings/settingsEditor', () => ({ cacheSettings: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))

const presets = [
  { key: 'events', title: 'Мероприятия и сцена', description: 'Выступления', starterServices: [] },
  { key: 'other', title: 'Другое', description: 'Своя сфера', starterServices: [] },
]
const profile: ActivityProfile = { required: true, canEdit: true, preset: '', otherDescription: '', completed: true, terminology: 'auto' }
const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })

beforeEach(() => { jest.resetAllMocks() })

it('показывает обязательный вопрос владельцу, требует описание и оставляет выбор при ошибке', async () => {
  const queryClient = createQueryClient()
  queryClient.setQueryData(MOBILE_SETTINGS_QUERY_KEY, { _id: 'settings', custom: { primaryEntityTerminology: 'auto' } })
  const onSaved = jest.fn()
  const saved = { ...profile, required: false, preset: 'other', terminology: 'orders', otherDescription: 'Уход за животными' }
  const readback = { _id: 'settings', syncVersion: 2, custom: { onboardingActivityPreset: 'other', primaryEntityTerminology: 'orders' } }
  jest.mocked(api.get).mockResolvedValue({ success: true, data: readback })
  jest.mocked(api.patch).mockRejectedValueOnce(new Error('Сеть')).mockResolvedValueOnce({ success: true, data: saved })
  const screen = render(<QueryClientProvider client={queryClient}><ThemeProvider storage={null} forcedMode="dark"><RequiredActivityProfile profile={profile} presets={presets} onSaved={onSaved} /></ThemeProvider></QueryClientProvider>)
  const save = () => fireEvent.press(screen.getByTestId('activity-profile-continue'))
  expect(screen.getByText(/Это поможет предложить подходящие договоры/)).toBeTruthy()
  save(); expect(screen.getByText('Выберите вид деятельности.')).toBeTruthy()
  fireEvent.press(screen.getByTestId('activity-preset-other'))
  save(); expect(screen.getByText('Коротко опишите, чем вы занимаетесь.')).toBeTruthy()
  expect(api.patch).not.toHaveBeenCalled()
  const field = screen.getByTestId('activity-other-description')
  fireEvent.changeText(field, '  Уход   за животными  ')
  save()
  await screen.findByText('Не удалось сохранить вид деятельности. Проверьте подключение и повторите.')
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByTestId('activity-other-description').props.value).toBe('  Уход   за животными  ')
  save()
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  await waitFor(() => expect(cacheSettings).toHaveBeenCalledWith(queryClient, readback, 'terminology'))
  expect(api.patch).toHaveBeenLastCalledWith('/activity-profile', { preset: 'other', otherDescription: 'Уход за животными', terminology: 'orders' })
  expect(queryClient.getQueryData(MOBILE_SETTINGS_QUERY_KEY)).toMatchObject({ custom: { onboardingActivityPreset: 'other', primaryEntityTerminology: 'orders' } })
})

it('показывает сохранённую сферу в настройках и изменяет её без перезаписи явной терминологии', async () => {
  const queryClient = createQueryClient()
  const current = { ...profile, required: false, preset: 'events', terminology: 'events' }
  jest.mocked(api.get).mockImplementation(async (path) => ({ success: true, data: path === '/activity-profile' ? current : { presets } }) as never)
  jest.mocked(api.patch).mockResolvedValue({ success: true, data: { ...current, preset: 'other', otherDescription: 'Уход за растениями' } })
  const screen = render(<QueryClientProvider client={queryClient}><ThemeProvider storage={null} forcedMode="light"><ActivityProfileSettings /></ThemeProvider></QueryClientProvider>)
  expect((await screen.findByTestId('activity-preset-events')).props.accessibilityState.checked).toBe(true)
  fireEvent.press(screen.getByTestId('activity-preset-other'))
  fireEvent.changeText(screen.getByTestId('activity-other-description'), 'Уход за растениями')
  fireEvent.press(screen.getByTestId('activity-profile-save'))
  await screen.findByText('Вид деятельности сохранён.')
  expect(api.patch).toHaveBeenCalledWith('/activity-profile', { preset: 'other', otherDescription: 'Уход за растениями' })
})
