import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { api } from '../api/client'
import { listCachedEntities } from '../storage/cache'
import { MOBILE_SETTINGS_QUERY_KEY, useWorkItemTerminology } from './useWorkItemTerminology'

jest.mock('../api/client', () => ({ api: { get: jest.fn() } }))
jest.mock('../storage/cache', () => ({ listCachedEntities: jest.fn() }))

it('в офлайн-сеансе использует сохранённую сферу, после соединения — свежие настройки сервера', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const cachedSettings = { _id: 'settings', custom: { onboardingActivityPreset: 'repair_home', primaryEntityTerminology: 'auto' } }
  jest.mocked(listCachedEntities).mockResolvedValue([cachedSettings])
  jest.mocked(api.get).mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(useWorkItemTerminology, { wrapper })
  await waitFor(() => expect(result.current.mode).toBe('orders'))
  expect(listCachedEntities).toHaveBeenCalledWith('siteSettings')

  jest.mocked(api.get).mockResolvedValueOnce({ success: true, data: { _id: 'settings', custom: { onboardingActivityPreset: 'repair_home', primaryEntityTerminology: 'events' } } })
  await act(() => queryClient.invalidateQueries({ queryKey: MOBILE_SETTINGS_QUERY_KEY }))
  await waitFor(() => expect(result.current.mode).toBe('events'))
})
