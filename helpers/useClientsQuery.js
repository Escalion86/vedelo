'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'
import clientsAtom from '@state/atoms/clientsAtom'
import eventsAtom from '@state/atoms/eventsAtom'
import transactionsAtom from '@state/atoms/transactionsAtom'

const normalizeListPayload = (payload) =>
  Array.isArray(payload?.data) ? payload.data : []

const upsertById = (items = [], nextItem) => {
  if (!nextItem?._id) return Array.isArray(items) ? items : []
  const list = Array.isArray(items) ? items : []
  const exists = list.some((item) => String(item?._id) === String(nextItem._id))
  if (!exists) return [...list, nextItem]
  return list.map((item) =>
    String(item?._id) === String(nextItem._id) ? nextItem : item
  )
}

const removeById = (items = [], itemId) => {
  const list = Array.isArray(items) ? items : []
  return list.filter((item) => String(item?._id) !== String(itemId))
}

const mergeUniqueById = (prevItems = [], nextItems = []) => {
  const list = Array.isArray(prevItems) ? prevItems : []
  const next = Array.isArray(nextItems) ? nextItems : []
  return next.reduce((acc, item) => upsertById(acc, item), list)
}

const setClientInQueries = (queryClient, client) => {
  if (!client?._id) return
  queryClient.setQueryData(queryKeys.client(client._id), client)
  queryClient.setQueriesData({ queryKey: ['clients'] }, (prev) => {
    if (!Array.isArray(prev)) return prev
    return upsertById(prev, client)
  })
}

const deleteClientFromQueries = (queryClient, clientId) => {
  queryClient.removeQueries({ queryKey: queryKeys.client(clientId) })
  queryClient.setQueriesData({ queryKey: ['clients'] }, (prev) => {
    if (!Array.isArray(prev)) return prev
    return removeById(prev, clientId)
  })
}

export const useClientsQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.clients(),
    queryFn: async ({ signal }) => {
      const payload = await apiJson('/api/clients', { signal })
      if (!Array.isArray(payload?.data) || payload?.success === false) {
        throw new Error('Не удалось загрузить клиентов')
      }
      return payload.data
    },
    retry: 1,
    refetchOnReconnect: true,
    ...(Array.isArray(initialData) ? { initialData } : {}),
  })

export const useClientQuery = (clientId, initialData) =>
  useQuery({
    queryKey: queryKeys.client(clientId),
    queryFn: async () => {
      const payload = await apiJson(`/api/clients/${clientId}`)
      return payload?.data
    },
    enabled: Boolean(clientId),
    initialData,
  })

export const useClientRelationsQuery = (clientId) => {
  const queryClient = useQueryClient()
  const setEvents = useSetAtom(eventsAtom)
  const setTransactions = useSetAtom(transactionsAtom)

  return useQuery({
    queryKey: queryKeys.clientRelations(clientId),
    queryFn: async () => {
      const [eventsPayload, transactionsPayload] = await Promise.all([
        apiJson(`/api/events?clientId=${encodeURIComponent(clientId)}`),
        apiJson(`/api/transactions?clientId=${encodeURIComponent(clientId)}`),
      ])

      const relations = {
        events: normalizeListPayload(eventsPayload),
        transactions: normalizeListPayload(transactionsPayload),
      }

      queryClient.setQueryData(queryKeys.events({ clientId }), {
        data: relations.events,
        meta: eventsPayload?.meta ?? {
          scope: 'client',
          totalCount: relations.events.length,
        },
      })
      queryClient.setQueryData(
        queryKeys.transactions({ clientId }),
        relations.transactions
      )
      setEvents((prev) => mergeUniqueById(prev, relations.events))
      setTransactions((prev) => mergeUniqueById(prev, relations.transactions))

      return relations
    },
    enabled: Boolean(clientId),
  })
}

export const useClientActions = () => {
  const queryClient = useQueryClient()
  const setClients = useSetAtom(clientsAtom)

  const { mutateAsync: saveClient } = useMutation({
    mutationFn: async ({ item, clone } = {}) => {
      const isUpdate = Boolean(item?._id && !clone)
      if (isUpdate) {
        const payload = await apiJson(`/api/clients/${item._id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        })
        return payload?.data
      }

      const clearedItem = { ...(item ?? {}) }
      delete clearedItem._id
      const payload = await apiJson('/api/clients', {
        method: 'POST',
        body: JSON.stringify(clearedItem),
      })
      return payload?.data
    },
    onSuccess: (client) => {
      setClientInQueries(queryClient, client)
      setClients((prev) => upsertById(prev, client))
    },
  })

  const { mutateAsync: deleteClient } = useMutation({
    mutationFn: async (clientId) => {
      await apiJson(`/api/clients/${clientId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return clientId
    },
    onSuccess: (clientId) => {
      deleteClientFromQueries(queryClient, clientId)
      setClients((prev) => removeById(prev, clientId))
    },
  })

  return useMemo(
    () => ({
      set: (item, clone) => saveClient({ item, clone }),
      delete: (clientId) => deleteClient(clientId),
    }),
    [deleteClient, saveClient]
  )
}
