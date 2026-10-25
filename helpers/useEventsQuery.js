'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import { apiJson } from '@helpers/apiClient'
import { reachGoalOnce } from '@helpers/metrikaGoals'
import { queryKeys } from '@helpers/queryKeys'
import eventsAtom from '@state/atoms/eventsAtom'
import transactionsAtom from '@state/atoms/transactionsAtom'

const normalizeEventsPayload = (payload, fallbackMeta = {}) => ({
  data: Array.isArray(payload?.data) ? payload.data : [],
  meta:
    payload?.meta && typeof payload.meta === 'object'
      ? payload.meta
      : fallbackMeta,
})

const buildEventsUrl = ({ scope, limit, before, dateFrom, dateTo } = {}) => {
  const search = new URLSearchParams()
  if (scope) search.set('scope', scope)
  if (limit) search.set('limit', String(limit))
  if (before) search.set('before', before)
  if (dateFrom) search.set('dateFrom', dateFrom)
  if (dateTo) search.set('dateTo', dateTo)
  const query = search.toString()
  return query ? `/api/events?${query}` : '/api/events'
}

const appendUniqueById = (prevItems = [], nextItems = []) => {
  const prev = Array.isArray(prevItems) ? prevItems : []
  const next = Array.isArray(nextItems) ? nextItems : []
  const prevIds = new Set(prev.map((item) => String(item?._id)))
  const uniqueNew = next.filter((item) => !prevIds.has(String(item?._id)))
  return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev
}

const replaceEventById = (items = [], event) => {
  if (!event?._id) return Array.isArray(items) ? items : []
  const list = Array.isArray(items) ? items : []
  const index = list.findIndex(
    (item) => String(item?._id) === String(event._id)
  )
  if (index === -1) return [event, ...list]
  return list.map((item, itemIndex) => (itemIndex === index ? event : item))
}

const removeEventById = (items = [], eventId) => {
  const list = Array.isArray(items) ? items : []
  return list.filter((item) => String(item?._id) !== String(eventId))
}

const setEventInQueries = (queryClient, event) => {
  if (!event?._id) return
  queryClient.setQueryData(queryKeys.event(event._id), event)
  queryClient.setQueriesData({ queryKey: ['events'] }, (prev) => {
    if (!prev || !Array.isArray(prev?.data)) return prev
    return {
      ...prev,
      data: replaceEventById(prev.data, event),
    }
  })
  void queryClient.invalidateQueries({ queryKey: ['statistics'] })
}

const deleteEventFromQueries = (queryClient, eventId) => {
  queryClient.removeQueries({ queryKey: queryKeys.event(eventId) })
  queryClient.setQueriesData({ queryKey: ['events'] }, (prev) => {
    if (!prev || !Array.isArray(prev?.data)) return prev
    return {
      ...prev,
      data: removeEventById(prev.data, eventId),
    }
  })
  void queryClient.invalidateQueries({ queryKey: ['statistics'] })
}

export const useEventsQuery = ({
  scope,
  initialData,
  initialMeta,
  dateFrom,
  dateTo,
  ...options
} = {}) =>
  useQuery({
    queryKey: queryKeys.events({ scope: scope || 'all', dateFrom, dateTo }),
    queryFn: async () =>
      normalizeEventsPayload(
        await apiJson(buildEventsUrl({ scope, dateFrom, dateTo })),
        initialMeta
      ),
    ...(Array.isArray(initialData)
      ? {
          initialData: {
            data: initialData,
            meta: initialMeta ?? {},
          },
        }
      : {}),
    ...options,
  })

export const useEventQuery = (eventId, initialData) =>
  useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: async () => {
      const payload = await apiJson(`/api/events/${eventId}`)
      return payload?.data
    },
    enabled: Boolean(eventId),
    initialData,
  })

export const useLoadMorePastEventsMutation = () => {
  const queryClient = useQueryClient()
  const setEvents = useSetAtom(eventsAtom)
  const setTransactions = useSetAtom(transactionsAtom)

  return useMutation({
    mutationFn: async ({ before, limit = 120 } = {}) => {
      const eventsPayload = normalizeEventsPayload(
        await apiJson(buildEventsUrl({ scope: 'past', limit, before }))
      )
      const eventIds = eventsPayload.data
        .map((event) => event?._id)
        .filter(Boolean)
      const transactionsPayload =
        eventIds.length > 0
          ? await apiJson(
              `/api/transactions?eventIds=${encodeURIComponent(eventIds.join(','))}`
            )
          : { data: [] }

      return {
        ...eventsPayload,
        transactions: Array.isArray(transactionsPayload?.data)
          ? transactionsPayload.data
          : [],
      }
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(queryKeys.events({ scope: 'past' }), (prev) => ({
        data: appendUniqueById(prev?.data, payload.data),
        meta: payload.meta ?? prev?.meta ?? {},
      }))
      setEvents((prev) => appendUniqueById(prev, payload.data))

      queryClient.setQueryData(queryKeys.transactionsAll, (prev) =>
        appendUniqueById(prev, payload.transactions)
      )
      setTransactions((prev) => appendUniqueById(prev, payload.transactions))
    },
  })
}

export const useEventActions = () => {
  const queryClient = useQueryClient()
  const setEvents = useSetAtom(eventsAtom)

  const { mutateAsync: saveEvent } = useMutation({
    mutationFn: async ({ item, clone } = {}) => {
      const isUpdate = Boolean(item?._id && !clone)
      if (isUpdate) {
        const payload = await apiJson(`/api/events/${item._id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        })
        return payload?.data
      }

      const clearedItem = { ...(item ?? {}) }
      delete clearedItem._id
      const payload = await apiJson('/api/events', {
        method: 'POST',
        body: JSON.stringify(clearedItem),
      })
      return payload?.data
    },
    onSuccess: (event, variables) => {
      setEventInQueries(queryClient, event)
      setEvents((prev) => replaceEventById(prev, event))
      const isCreate = !variables?.item?._id || variables?.clone
      if (!isCreate) return
      reachGoalOnce('first_crm_item_created', {
        itemType: event?.status === 'draft' ? 'request' : 'event',
      })
      if (event?.status === 'draft') {
        reachGoalOnce('first_request_created', { eventId: event._id })
      } else {
        reachGoalOnce('first_event_created', {
          eventId: event?._id,
          status: event?.status,
        })
      }
    },
  })

  const { mutateAsync: deleteEvent } = useMutation({
    mutationFn: async (eventId) => {
      await apiJson(`/api/events/${eventId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return eventId
    },
    onSuccess: (eventId) => {
      deleteEventFromQueries(queryClient, eventId)
      setEvents((prev) => removeEventById(prev, eventId))
    },
  })

  const { mutateAsync: updateEventStatus } = useMutation({
    mutationFn: async ({ eventId, status }) => {
      const payload = await apiJson(`/api/events/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      return payload?.data
    },
    onSuccess: (event) => {
      setEventInQueries(queryClient, event)
      setEvents((prev) => replaceEventById(prev, event))
    },
  })

  return useMemo(
    () => ({
      set: (item, clone) => saveEvent({ item, clone }),
      delete: (eventId) => deleteEvent(eventId),
      updateStatus: (eventId, status) => updateEventStatus({ eventId, status }),
    }),
    [deleteEvent, saveEvent, updateEventStatus]
  )
}
