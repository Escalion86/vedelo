'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

export const useProposalStatusesQuery = (enabled) => useQuery({
  queryKey: queryKeys.proposalStatuses,
  queryFn: async ({ signal }) => {
    const body = await apiJson('/api/proposals/statuses', { cache: 'no-store', signal })
    return body.data || {}
  },
  enabled,
  staleTime: 30_000,
  refetchInterval: 30_000,
})
