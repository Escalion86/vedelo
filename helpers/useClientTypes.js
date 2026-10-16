'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { queryKeys } from './queryKeys'
import { resolveClientTypes } from './clientTypes.mjs'

const key = ['client-types']
const request = async (method = 'GET', body) => {
  const response = await fetch('/api/client-types', {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.error?.message || 'Не удалось загрузить типы клиентов')
  return result.data
}

export const useClientTypes = () => {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useAtom(siteSettingsAtom)
  const query = useQuery({ queryKey: key, queryFn: () => request() })
  const save = async (items, version) => {
    const data = await request('PUT', { items, version })
    await Promise.all([
      queryClient.cancelQueries({ queryKey: key }),
      queryClient.cancelQueries({ queryKey: queryKeys.siteSettings }),
    ])
    queryClient.setQueryData(key, data)
    const merge = (current) => ({ ...current, clientTypes: data.items, clientTypesVersion: data.version })
    queryClient.setQueryData(queryKeys.siteSettings, (current) => current ? merge(current) : undefined)
    setSettings(merge)
    return data
  }
  return { ...query, save, items: query.data?.items || resolveClientTypes(settings) }
}
