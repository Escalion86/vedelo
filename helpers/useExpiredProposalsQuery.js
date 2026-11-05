'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

export const useExpiredProposalsQuery = (enabled) => useQuery({
  queryKey: queryKeys.expiredProposals,
  queryFn: async ({ signal }) => {
    const body = await apiJson('/api/proposals/expired', { cache: 'no-store', signal })
    return body.data || []
  },
  enabled,
  staleTime: 30_000,
  refetchInterval: 30_000,
})
