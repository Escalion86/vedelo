import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { MobileSettings } from '../domain/types'
import { resolveMobileWorkItemTerminology } from '../domain/workItemTerminology'

export const MOBILE_SETTINGS_QUERY_KEY = ['mobile-site-settings'] as const

export const useWorkItemTerminology = () => {
  const query = useQuery({
    queryKey: MOBILE_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<{ success: true; data: MobileSettings }>('/mobile/v1/settings/terminology')
      return response.data
    },
  })
  return { ...resolveMobileWorkItemTerminology(query.data), settings: query.data, query }
}
