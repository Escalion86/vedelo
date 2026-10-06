import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { useAuth } from '../../shared/auth/AuthProvider'
import { sectionError, statusOf } from '../statistics/useSectionData'
import { InvalidHistoryResponse, loadCachedHistory, loadHistoryPage } from './api'
import { mergeHistoryItems } from './filter'
import type { HistoryFilters, HistoryItem } from './types'
const empty = { items: [] as HistoryItem[], cursor: null as string | null, hasMore: false, loading: true, moreLoading: false, offline: false, error: '', pageError: '', warning: '' }
export function useHistory(filters: HistoryFilters, enabled: boolean) {
  const { user } = useAuth()
  const filterKey = JSON.stringify(filters)
  const key = JSON.stringify([user?._id, user?.tenantId, filterKey, enabled])
  const life = useRef({ active: false, epoch: 0 })
  const controller = useRef<AbortController | null>(null)
  const moreLock = useRef<symbol | null>(null)
  const [state, setState] = useState({ ...empty, key: '' })
  const current = useCallback((epoch: number) => life.current.active && life.current.epoch === epoch, [])
  const reload = useCallback(async () => {
    if (!life.current.active || !enabled || !user?._id) return
    controller.current?.abort(); controller.current = new AbortController()
    const signal = controller.current.signal
    const epoch = ++life.current.epoch
    setState({ ...empty, key })
    const query: HistoryFilters = JSON.parse(filterKey)
    try {
      const network = await NetInfo.fetch().catch(() => null)
      if (!current(epoch)) return
      if (network && (!network.isConnected || network.isInternetReachable === false)) {
        const items = await loadCachedHistory(query)
        if (current(epoch)) setState({ ...empty, key, items, loading: false, offline: true })
        return
      }
      const response = await loadHistoryPage(query, null, { signal, current: () => current(epoch) })
      if (current(epoch)) setState({ ...empty, key, items: mergeHistoryItems([], response.data), cursor: response.meta.nextCursor || null, hasMore: response.meta.hasMore, loading: false, warning: 'cacheSaved' in response && !response.cacheSaved ? 'История получена с сервера, но не сохранена для офлайн-просмотра.' : '' })
    } catch (reason) {
      if (!current(epoch)) return
      const error = sectionError(reason, 'Не удалось загрузить историю. Повторите попытку.')
      if ([401, 403].includes(statusOf(reason)) || reason instanceof InvalidHistoryResponse) {
        setState({ ...empty, key, loading: false, error }); return
      }
      try {
        const items = await loadCachedHistory(query)
        if (current(epoch)) setState({ ...empty, key, items, loading: false, offline: items.length > 0, error })
      } catch {
        if (current(epoch)) setState({ ...empty, key, loading: false, error: 'Не удалось прочитать историю с сервера и из памяти. Повторите попытку.' })
      }
    }
  }, [enabled, key, filterKey, user?._id, current])
  useFocusEffect(useCallback(() => {
    life.current.active = true
    void reload()
    return () => { life.current.active = false; ++life.current.epoch; controller.current?.abort() }
  }, [reload]))
  const visible = state.key === key && enabled && Boolean(user?._id)
  const loadMore = async () => {
    const epoch = life.current.epoch
    if (!visible || !current(epoch) || state.loading || state.offline || !state.cursor || !state.hasMore || moreLock.current) return
    const lock = Symbol('history-page'); moreLock.current = lock
    setState((prev) => ({ ...prev, moreLoading: true, pageError: '' }))
    try {
      const response = await loadHistoryPage(filters, state.cursor, { current: () => current(epoch), signal: controller.current?.signal })
      if (current(epoch)) setState((prev) => ({ ...prev, items: mergeHistoryItems(prev.items, response.data), cursor: response.meta.nextCursor || null, hasMore: response.meta.hasMore, moreLoading: false, warning: 'cacheSaved' in response && !response.cacheSaved ? 'Не удалось сохранить продолжение для офлайн-просмотра.' : prev.warning }))
    } catch (reason) {
      if (current(epoch)) {
        if ([401, 403].includes(statusOf(reason))) setState({ ...empty, key, loading: false, error: sectionError(reason, 'Нет доступа к истории') })
        else setState((prev) => ({ ...prev, moreLoading: false, pageError: 'Не удалось загрузить продолжение. Повторите загрузку страницы.' }))
      }
    } finally { if (moreLock.current === lock) moreLock.current = null }
  }
  return { ...(visible ? state : empty), loading: enabled && (!visible || state.loading), reload, loadMore, navigationAllowed: visible && !state.loading && !state.offline && !state.error }
}
