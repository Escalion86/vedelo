'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'

export const useClientReviews = (filters = {}) => {
  const search = new URLSearchParams(
    Object.entries(filters).filter(
      ([, value]) => value !== '' && value !== undefined
    )
  ).toString()
  return useQuery({
    queryKey: ['clientReviews', search],
    queryFn: async ({ signal }) =>
      (
        await apiJson(`/api/client-reviews?${search}`, {
          signal,
          cache: 'no-store',
        })
      ).data,
    refetchInterval: 30000,
  })
}
export const useReviewAction = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }) =>
      (
        await apiJson(`/api/client-reviews${id ? `/${id}` : ''}`, {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        })
      ).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ['clientReviews'] }),
  })
}
