'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

export const useEventProposalsQuery = (eventId, { enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.eventProposals(eventId),
    queryFn: async ({ signal }) => {
      const body = await apiJson(`/api/events/${eventId}/proposals`, {
        cache: 'no-store',
        signal,
      })
      return Array.isArray(body?.data) ? body.data : []
    },
    enabled: Boolean(eventId) && enabled,
    staleTime: 0,
    refetchInterval: 30_000,
  })

export const cacheEventProposal = async (queryClient, eventId, proposal) => {
  const queryKey = queryKeys.eventProposals(eventId)
  // Запросы, начатые до записи, могут вернуть прежний статус, даже если кэш ещё пуст.
  await Promise.all([
    queryClient.cancelQueries({ queryKey }),
    queryClient.cancelQueries({ queryKey: queryKeys.proposalStatuses }),
    queryClient.cancelQueries({ queryKey: queryKeys.expiredProposals }),
  ])
  queryClient.setQueryData(queryKey, (current = []) => {
    const exists = current.some((item) => item._id === proposal._id)
    return exists
      ? current.map((item) => (item._id === proposal._id ? proposal : item))
      : [proposal, ...current]
  })
  void queryClient.invalidateQueries({ queryKey: queryKeys.proposalStatuses })
  void queryClient.invalidateQueries({ queryKey: queryKeys.expiredProposals })
}
