import { QueryClient } from '@tanstack/react-query'
import { cacheSettings } from './settingsEditor'

const mockList = jest.fn(async () => [])
const mockUpsert = jest.fn(async (..._args: unknown[]) => undefined)
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: () => mockList(), upsertEntities: (...args: unknown[]) => mockUpsert(...args) }))
jest.mock('../../shared/api/client', () => ({ api: {} }))
jest.mock('expo-router', () => ({ useNavigation: jest.fn() }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ MOBILE_SETTINGS_QUERY_KEY: ['mobile-site-settings'] }))

it('первое чтение настроек сохраняет метаданные авторежима в пустом кеше', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  await cacheSettings(client, {
    _id: 'site-a', timeZone: 'Asia/Krasnoyarsk', towns: ['Красноярск'],
    custom: { primaryEntityTerminology: 'auto', onboardingActivityPreset: 'events', eventTypes: ['Свадьба'] },
  }, 'terminology')
  expect(mockUpsert).toHaveBeenCalledWith('siteSettings', [expect.objectContaining({
    _id: 'site-a', timeZone: 'Asia/Krasnoyarsk',
    custom: expect.objectContaining({ primaryEntityTerminology: 'auto', onboardingActivityPreset: 'events' }),
  })])
  expect(client.getQueryData(['mobile-site-settings'])).toMatchObject({
    custom: { primaryEntityTerminology: 'auto', onboardingActivityPreset: 'events' },
  })
  client.clear()
})
