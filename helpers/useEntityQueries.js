'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'
import { moveServicesFromGroupToUngrouped } from '@helpers/serviceGroups'

// ============ SERVICES ============

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

export const useServicesQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.services(),
    queryFn: async () => normalizeListPayload(await apiJson('/api/services')),
    ...(Array.isArray(initialData) ? { initialData } : {}),
  })

export const useServiceQuery = (serviceId, initialData) =>
  useQuery({
    queryKey: queryKeys.service(serviceId),
    queryFn: async () => {
      const payload = await apiJson(`/api/services/${serviceId}`)
      return payload?.data
    },
    enabled: Boolean(serviceId),
    initialData,
  })

export const useServiceActions = () => {
  const queryClient = useQueryClient()

  const { mutateAsync: saveService } = useMutation({
    mutationFn: async ({ item, clone } = {}) => {
      const isUpdate = Boolean(item?._id && !clone)
      if (isUpdate) {
        const payload = await apiJson(`/api/services/${item._id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        })
        return payload?.data
      }
      const clearedItem = { ...(item ?? {}) }
      delete clearedItem._id
      const payload = await apiJson('/api/services', {
        method: 'POST',
        body: JSON.stringify(clearedItem),
      })
      return payload?.data
    },
    onSuccess: (service) => {
      if (!service?._id) return
      queryClient.setQueryData(queryKeys.service(service._id), service)
      queryClient.setQueriesData({ queryKey: ['services'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return upsertById(prev, service)
      })
    },
  })

  const { mutateAsync: deleteService } = useMutation({
    mutationFn: async (serviceId) => {
      await apiJson(`/api/services/${serviceId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return serviceId
    },
    onSuccess: (serviceId) => {
      queryClient.removeQueries({ queryKey: queryKeys.service(serviceId) })
      queryClient.setQueriesData({ queryKey: ['services'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return removeById(prev, serviceId)
      })
    },
  })

  return useMemo(
    () => ({
      set: (item, clone) => saveService({ item, clone }),
      delete: (serviceId) => deleteService(serviceId),
    }),
    [deleteService, saveService]
  )
}

// ============ SERVICE GROUPS ============

export const useServiceGroupsQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.serviceGroups(),
    queryFn: async () =>
      normalizeListPayload(await apiJson('/api/service-groups')),
    ...(Array.isArray(initialData) ? { initialData } : {}),
  })

export const useServiceGroupActions = () => {
  const queryClient = useQueryClient()

  const { mutateAsync: deleteServiceGroup } = useMutation({
    mutationFn: async (serviceGroupId) => {
      await apiJson(`/api/service-groups/${serviceGroupId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return serviceGroupId
    },
    onSuccess: (serviceGroupId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.serviceGroup(serviceGroupId),
      })
      queryClient.setQueriesData({ queryKey: ['serviceGroups'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return removeById(prev, serviceGroupId)
      })
      queryClient.setQueriesData({ queryKey: ['services'] }, (prev) =>
        moveServicesFromGroupToUngrouped(prev, serviceGroupId)
      )
      queryClient.setQueriesData({ queryKey: ['service'] }, (prev) =>
        prev && String(prev?.groupId || '') === String(serviceGroupId)
          ? { ...prev, groupId: null }
          : prev
      )
    },
  })

  return useMemo(
    () => ({
      delete: (serviceGroupId) => deleteServiceGroup(serviceGroupId),
    }),
    [deleteServiceGroup]
  )
}

// ============ USERS ============

export const useUsersQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.users(),
    queryFn: async () => normalizeListPayload(await apiJson('/api/users')),
    ...(Array.isArray(initialData) ? { initialData } : {}),
  })

export const useUserQuery = (userId, initialData) =>
  useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: async () => {
      const payload = await apiJson(`/api/users/${userId}`)
      return payload?.data
    },
    enabled: Boolean(userId),
    initialData,
  })

export const useUserActions = () => {
  const queryClient = useQueryClient()

  const { mutateAsync: saveUser } = useMutation({
    mutationFn: async ({ item, clone } = {}) => {
      const isUpdate = Boolean(item?._id && !clone)
      if (isUpdate) {
        const payload = await apiJson(`/api/users/${item._id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        })
        return payload?.data
      }
      const clearedItem = { ...(item ?? {}) }
      delete clearedItem._id
      const payload = await apiJson('/api/users', {
        method: 'POST',
        body: JSON.stringify(clearedItem),
      })
      return payload?.data
    },
    onSuccess: (user) => {
      if (!user?._id) return
      queryClient.setQueryData(queryKeys.user(user._id), user)
      queryClient.setQueriesData({ queryKey: ['users'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return upsertById(prev, user)
      })
    },
  })

  const { mutateAsync: deleteUser } = useMutation({
    mutationFn: async (userId) => {
      await apiJson(`/api/users/${userId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return userId
    },
    onSuccess: (userId) => {
      queryClient.removeQueries({ queryKey: queryKeys.user(userId) })
      queryClient.setQueriesData({ queryKey: ['users'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return removeById(prev, userId)
      })
    },
  })

  return {
    set: (item, clone) => saveUser({ item, clone }),
    delete: (userId) => deleteUser(userId),
  }
}

// ============ TARIFFS ============

export const useTariffsQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.tariffs(),
    queryFn: async () => normalizeListPayload(await apiJson('/api/tariffs')),
    ...(Array.isArray(initialData) ? { initialData } : {}),
  })

export const useTariffQuery = (tariffId, initialData) =>
  useQuery({
    queryKey: queryKeys.tariff(tariffId),
    queryFn: async () => {
      const payload = await apiJson(`/api/tariffs/${tariffId}`)
      return payload?.data
    },
    enabled: Boolean(tariffId),
    initialData,
  })

export const useTariffActions = () => {
  const queryClient = useQueryClient()

  const { mutateAsync: saveTariff } = useMutation({
    mutationFn: async ({ item, clone } = {}) => {
      const isUpdate = Boolean(item?._id && !clone)
      if (isUpdate) {
        const payload = await apiJson(`/api/tariffs/${item._id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        })
        return payload?.data
      }
      const clearedItem = { ...(item ?? {}) }
      delete clearedItem._id
      const payload = await apiJson('/api/tariffs', {
        method: 'POST',
        body: JSON.stringify(clearedItem),
      })
      return payload?.data
    },
    onSuccess: (tariff) => {
      if (!tariff?._id) return
      queryClient.setQueryData(queryKeys.tariff(tariff._id), tariff)
      queryClient.setQueriesData({ queryKey: ['tariffs'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return upsertById(prev, tariff)
      })
    },
  })

  const { mutateAsync: deleteTariff } = useMutation({
    mutationFn: async (tariffId) => {
      await apiJson(`/api/tariffs/${tariffId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      return tariffId
    },
    onSuccess: (tariffId) => {
      queryClient.removeQueries({ queryKey: queryKeys.tariff(tariffId) })
      queryClient.setQueriesData({ queryKey: ['tariffs'] }, (prev) => {
        if (!Array.isArray(prev)) return prev
        return removeById(prev, tariffId)
      })
    },
  })

  return {
    set: (item, clone) => saveTariff({ item, clone }),
    delete: (tariffId) => deleteTariff(tariffId),
  }
}

// ============ SITE SETTINGS ============

const defaultSiteSettings = {
  email: null,
  phone: null,
  whatsapp: null,
  viber: null,
  telegram: null,
  instagram: null,
  vk: null,
  towns: [],
  defaultTown: '',
  timeZone: 'Asia/Krasnoyarsk',
  storeCalendarResponse: false,
  custom: { cancelReasons: [] },
}

export const useSiteSettingsQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.siteSettings,
    queryFn: async () => {
      const payload = await apiJson('/api/site')
      return payload?.data ?? defaultSiteSettings
    },
    ...(initialData !== undefined
      ? { initialData: initialData ?? defaultSiteSettings }
      : {}),
  })

// ============ LOGGED USER ============

export const useLoggedUserQuery = (initialData) =>
  useQuery({
    queryKey: queryKeys.loggedUser,
    queryFn: async () => {
      const payload = await apiJson('/api/auth/session')
      return payload?.user ?? payload?.data ?? null
    },
    ...(initialData !== undefined ? { initialData: initialData ?? null } : {}),
    staleTime: 30000,
  })
