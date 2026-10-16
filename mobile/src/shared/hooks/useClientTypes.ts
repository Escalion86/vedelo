import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api/client'
import { listCachedEntities } from '../storage/cache'
import type { MobileSettings } from '../domain/types'
import { legacyClientTypes, type ClientType } from '../domain/clientTypes'
import { cacheSettings } from '../../features/settings/settingsEditor'

type Catalog = { items: ClientType[]; version: number; settingsId: string | null }
type Result = { success: boolean; data: Catalog }
const key = ['client-types']

export const useClientTypes = () => {
  const client = useQueryClient()
  const cached = useQuery({ queryKey: ['cached-entities', 'siteSettings'], queryFn: () => listCachedEntities<MobileSettings>('siteSettings') })
  const remember = async (data: Catalog) => {
    if (data.settingsId) await cacheSettings(client, {
      _id: data.settingsId, clientTypes: data.items, clientTypesVersion: data.version,
    }, 'clientTypes')
  }
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const result = await api.get<Result>('/client-types')
    if (!result.success || !Array.isArray(result.data?.items)) throw new Error('Не удалось загрузить типы')
    return result.data
  } })
  useEffect(() => {
    const data = query.data
    if (data?.settingsId) void cacheSettings(client, {
      _id: data.settingsId, clientTypes: data.items, clientTypesVersion: data.version,
    }, 'clientTypes').catch(() => undefined)
  }, [query.data, client])
  const save = async (items: ClientType[], version: number) => {
    const result = await api.put<Result>('/client-types', { items, version })
    if (!result.success) throw new Error('Не удалось сохранить типы')
    await client.cancelQueries({ queryKey: key })
    client.setQueryData(key, result.data)
    await remember(result.data)
  }
  return { ...query, save, items: query.data?.items || cached.data?.[0]?.clientTypes || legacyClientTypes }
}
