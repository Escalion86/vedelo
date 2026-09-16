'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

const buildUrl = ({ category = 'all', limit = 30, userId = '' }, cursor) => {
  const search = new URLSearchParams({
    category,
    limit: String(limit),
  })
  if (userId) search.set('userId', String(userId))
  if (cursor) search.set('cursor', cursor)
  return `/api/billing/history?${search.toString()}`
}

export const usePaymentHistoryQuery = (filters = {}, options = {}) =>
  useInfiniteQuery({
    queryKey: queryKeys.paymentHistory(filters),
    queryFn: ({ pageParam }) => apiJson(buildUrl(filters, pageParam)),
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage?.meta?.hasMore ? lastPage.meta.nextCursor : undefined,
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  })
