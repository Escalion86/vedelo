import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { MobileSettings } from '../../shared/domain/types'
import { listCachedEntities, upsertEntities } from '../../shared/storage/cache'
import { MOBILE_SETTINGS_QUERY_KEY } from '../../shared/hooks/useWorkItemTerminology'

export type SettingsScope = 'lists' | 'terminology'
type Response = { success: boolean; data: MobileSettings | null }
export const mergeSettings = (current: MobileSettings | undefined, patch: MobileSettings) => ({
  ...current, ...patch, custom: { ...current?.custom, ...patch.custom },
})
export const scopedSettings = (settings: MobileSettings, scope: SettingsScope): MobileSettings => ({
  _id: settings._id,
  ...(settings.syncVersion !== undefined ? { syncVersion: settings.syncVersion } : {}),
  ...(settings.updatedAt !== undefined ? { updatedAt: settings.updatedAt } : {}),
  ...(scope === 'lists' ? {
    towns: settings.towns || [], defaultTown: settings.defaultTown || '', custom: { eventTypes: settings.custom?.eventTypes || [] },
  } : { custom: { primaryEntityTerminology: settings.custom?.primaryEntityTerminology || 'auto' } }),
})

// Последовательно объединяем UI-записи списков и терминологии: upsert заменяет весь payload.
let cacheWrites: Promise<unknown> = Promise.resolve()
export const cacheSettings = (queryClient: QueryClient, settings: MobileSettings, scope: SettingsScope) => {
  const write = cacheWrites.catch(() => undefined).then(async () => {
    const patch = scopedSettings(settings, scope)
    const cached = (await listCachedEntities<MobileSettings>('siteSettings')).find((item) => item._id === settings._id)
    const query = queryClient.getQueryData<MobileSettings>(MOBILE_SETTINGS_QUERY_KEY)
    const sameQuery = query?._id === settings._id ? query : undefined
    const existing = mergeSettings(cached, { ...sameQuery, _id: settings._id })
    const merged = mergeSettings(mergeSettings(settings, existing), patch)
    await upsertEntities('siteSettings', [merged])
    queryClient.setQueryData<MobileSettings>(MOBILE_SETTINGS_QUERY_KEY, (current) => mergeSettings(mergeSettings(merged, current?._id === settings._id ? current : { _id: settings._id }), patch))
    await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'siteSettings'] })
  })
  cacheWrites = write
  return write
}
export type SettingsConfig<T> = {
  scope: SettingsScope
  endpoint: string
  initial: (settings?: MobileSettings | null) => T
  payload: (draft: T) => Record<string, unknown>
  matches: (settings: MobileSettings, draft: T) => boolean
}

export const useSettingsEditor = <T,>(config: SettingsConfig<T>) => {
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const [draft, setDraft] = useState(() => config.initial())
  const draftRef = useRef(draft)
  const initial = useRef(draft)
  const changed = useRef(false)
  const busy = useRef(false)
  const generation = useRef(0)
  const [dirty, setDirty] = useState(false)
  const [ready, setReady] = useState(false)
  const [reading, setReading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState(false)
  const [readError, setReadError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [settings, setSettings] = useState<MobileSettings | null>(null)
  const [attempt, setAttempt] = useState(0)
  usePreventRemove(dirty || saving, ({ data }) => {
    if (busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })
  useEffect(() => {
    const request = ++generation.current
    let active = true, serverRead = false, serverFailed = false, hasCache = false
    setReading(true); setReadError(''); setOffline(false)
    const apply = (data: MobileSettings | null) => {
      setReady(true); setSettings(data)
      if (!changed.current && !busy.current) {
        const next = config.initial(data)
        initial.current = next; draftRef.current = next; setDraft(next)
      }
    }
    const cachedRead = listCachedEntities<MobileSettings>('siteSettings').then((items) => {
      if (!active || generation.current !== request || serverRead) return
      if (items[0]) { hasCache = true; apply(items[0]); if (serverFailed) setOffline(true) }
    }).catch(() => undefined)
    const server = api.get<Response>(config.endpoint).then(async (response) => {
      if (!active || generation.current !== request) return
      if (response.success !== true || (config.scope === 'lists' && response.data === null) || (response.data !== null && (!response.data || typeof response.data._id !== 'string'))) throw new Error('Некорректный ответ')
      if (config.scope === 'lists' && (!Array.isArray(response.data?.towns) || !Array.isArray(response.data?.custom?.eventTypes) || typeof response.data?.defaultTown !== 'string')) throw new Error('Некорректные списки')
      serverRead = true
      const data = response.data
      // Полный снимок нужен для resolver; подтверждённые поля кэша объединяются по области.
      apply(data)
      if (data?._id) {
        try { await cacheSettings(queryClient, data, config.scope) } catch { if (active) setReadError('Данные получены, но не удалось обновить офлайн-копию.') }
      }
    }).catch(() => {
      if (!active || generation.current !== request) return
      serverFailed = true
      setOffline(hasCache)
      setReadError('Не удалось получить настройки с сервера. Повторите загрузку.')
    })
    void Promise.all([cachedRead, server]).then(() => { if (active && generation.current === request) setReading(false) })
    return () => { active = false }
  }, [config, queryClient, attempt])
  const change = (update: T | ((current: T) => T)) => {
    if (busy.current) return
    const next = typeof update === 'function' ? (update as (current: T) => T)(draftRef.current) : update
    draftRef.current = next
    changed.current = JSON.stringify(next) !== JSON.stringify(initial.current)
    setDraft(next); setDirty(changed.current); setSuccess(''); setError('')
  }
  const save = async () => {
    if (busy.current || !ready || reading || !changed.current) return
    let payload: Record<string, unknown>
    const snapshot = draftRef.current
    try { payload = config.payload(snapshot) } catch (cause) { setError((cause as Error).message); return }
    busy.current = true; setSaving(true); setError(''); setSuccess('')
    // Предыдущее чтение не должно заменять черновик или результат сохранения.
    ++generation.current
    try {
      const written = await api.put<Response>(config.endpoint, payload)
      if (written.success !== true || !written.data?._id || (settings?._id && settings._id !== written.data._id) || !config.matches(written.data, snapshot)) throw new Error('Запись не подтверждена')
      const confirmed = await api.get<Response>(config.endpoint)
      if (confirmed.success !== true || !confirmed.data?._id || confirmed.data._id !== written.data._id || !config.matches(confirmed.data, snapshot)) throw new Error('Запись не подтверждена')
      try { await cacheSettings(queryClient, confirmed.data, config.scope) } catch {
        setError('Запись подтверждена сервером, но офлайн-копия не обновлена. Повторите сохранение при восстановлении хранилища.')
        return
      }
      setSettings(confirmed.data)
      initial.current = snapshot; changed.current = false; setDirty(false); setOffline(false); setReadError('')
      setSuccess('Изменения подтверждены сервером')
    } catch {
      setError('Не удалось подтвердить сохранение. Ввод сохранён; повторите действие при наличии сети.')
    } finally { busy.current = false; setSaving(false) }
  }
  return { draft, change, save, ready, reading, saving, dirty, offline, readError, error, success, settings,
    retry: () => { if (!busy.current) setAttempt((current) => current + 1) } }
}
