'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

const buildUrl = (filters) => {
  const search = new URLSearchParams()
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  return `/api/billing/operations?${search.toString()}`
}

export const usePaymentOperationsQuery = (filters) =>
  useQuery({
    queryKey: queryKeys.paymentOperations(filters),
    queryFn: () => apiJson(buildUrl(filters)),
    staleTime: 0,
    refetchOnMount: 'always',
  })

export const useMissingPaymentReceiptsCountQuery = (enabled) =>
  useQuery({
    queryKey: queryKeys.missingPaymentReceiptsCount,
    queryFn: () => apiJson('/api/billing/receipts/pending-count'),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
