'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'
import { sendSupportMessage } from '@helpers/supportTicketRequest.mjs'

const toQueryString = (params = {}) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value))
  })
  return query.toString()
}

export const useSupportTicketsQuery = (filters = {}) =>
  useInfiniteQuery({
    queryKey: queryKeys.supportTickets(filters),
    queryFn: ({ pageParam }) => {
      const query = toQueryString({ ...filters, cursor: pageParam, limit: 30 })
      return apiJson(`/api/support-tickets?${query}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.meta?.hasMore ? lastPage.meta.nextCursor : undefined,
    staleTime: 15_000,
  })

export const useSupportTicketQuery = (ticketId) =>
  useInfiniteQuery({
    queryKey: queryKeys.supportTicket(ticketId),
    queryFn: ({ pageParam }) => {
      const query = toQueryString({ cursor: pageParam })
      return apiJson(`/api/support-tickets/${ticketId}?${query}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.meta?.hasMore ? lastPage.meta.nextCursor : undefined,
    enabled: Boolean(ticketId),
    staleTime: 0,
  })

export const useSupportSummaryQuery = () =>
  useQuery({
    queryKey: queryKeys.supportSummary,
    queryFn: () => apiJson('/api/support-tickets/summary'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })

export const useSupportTicketMutations = () => {
  const queryClient = useQueryClient()
  const refresh = async (ticketId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['supportTickets'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.supportSummary }),
      ticketId ? queryClient.invalidateQueries({ queryKey: queryKeys.supportTicket(ticketId) }) : Promise.resolve(),
    ])
  }
  const createMutation = useMutation({
    mutationFn: (formData) => sendSupportMessage('/api/support-tickets', formData),
    onSuccess: (result) => refresh(result?.data?.ticket?.id),
  })
  const replyMutation = useMutation({
    mutationFn: ({ ticketId, formData }) => sendSupportMessage(`/api/support-tickets/${ticketId}/messages`, formData),
    onSuccess: (result) => refresh(result?.data?.ticket?.id),
  })
  const statusMutation = useMutation({
    mutationFn: ({ ticketId, status }) => apiJson(`/api/support-tickets/${ticketId}`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),
    onSuccess: (result) => refresh(result?.data?.id),
  })
  const readMutation = useMutation({
    mutationFn: (ticketId) => apiJson(`/api/support-tickets/${ticketId}/read`, { method: 'POST' }),
    onSuccess: (result) => refresh(result?.data?.id),
  })
  return { createMutation, replyMutation, statusMutation, readMutation }
}
