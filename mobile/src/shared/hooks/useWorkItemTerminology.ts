import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { MobileSettings } from '../domain/types'
import { resolveMobileWorkItemTerminology } from '../domain/workItemTerminology'
import { listCachedEntities } from '../storage/cache'

export const MOBILE_SETTINGS_QUERY_KEY = ['mobile-site-settings'] as const

export const readMobileTerminologySettings = async () => {
  const response = await api.get<{ success: true; data: MobileSettings | null }>('/mobile/v1/settings/terminology')
  return response.data
}

export const useWorkItemTerminology = () => {
  const query = useQuery({
    queryKey: MOBILE_SETTINGS_QUERY_KEY,
    queryFn: readMobileTerminologySettings,
  })
  const hasTerminology = query.data?.custom?.primaryEntityTerminology !== undefined || query.data?.custom?.onboardingActivityPreset !== undefined
  const cached = useQuery({
    queryKey: ['cached-entities', 'siteSettings'],
    queryFn: () => listCachedEntities<MobileSettings>('siteSettings'),
    enabled: !hasTerminology,
  })
  const settings = hasTerminology ? query.data : cached.data?.[0] || query.data
  return { ...resolveMobileWorkItemTerminology(settings), settings, query }
}
