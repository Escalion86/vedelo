'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

const normalizeStatisticsPayload = (payload, fallback = {}) => ({
  events: Array.isArray(payload?.data?.events)
    ? payload.data.events
    : (fallback.events ?? []),
  clients: Array.isArray(payload?.data?.clients)
    ? payload.data.clients
    : (fallback.clients ?? []),
  services: Array.isArray(payload?.data?.services)
    ? payload.data.services
    : (fallback.services ?? []),
  transactions: Array.isArray(payload?.data?.transactions)
    ? payload.data.transactions
    : (fallback.transactions ?? []),
  filters: payload?.data?.filters ?? fallback.filters ?? {},
})

export const useStatisticsQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.statistics(),
    queryFn: async () =>
      normalizeStatisticsPayload(
        await apiJson('/api/statistics', { cache: 'no-store' }),
        initialData
      ),
    initialData: initialData
      ? normalizeStatisticsPayload({ data: initialData }, initialData)
      : undefined,
  })
