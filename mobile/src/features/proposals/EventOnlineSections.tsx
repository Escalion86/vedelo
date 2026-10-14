import { useCallback, useEffect, useRef } from 'react'
import { View } from 'react-native'
import { spacing } from '../../shared/ui/theme'
import { useNetInfo } from '@react-native-community/netinfo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../shared/auth/AuthProvider'
import { api } from '../../shared/api/client'
import type { Event } from '../../shared/domain/types'
import { publishEntityReadback } from '../../shared/storage/cache'
import { Button, Notice } from '../../shared/ui/components'
import type { MobileBilling } from '../billing/types'
import { EventClientReviewSection } from '../reviews/EventClientReviewSection'
import { EventProposalsSection } from './EventProposalsSection'
import type { AppliedEvent } from './api'

// Only the saved detail screen hosts server mutations, never an unsaved editor.
export function EventOnlineSections({ event }: { event: Event & { isDemo?: boolean } }) {
  const network = useNetInfo()
  if (event.isDemo) return null
  if (event._id.startsWith('local-') || (event.syncStatus && event.syncStatus !== 'synced'))
    return <Notice message="КП и отзывы доступны после синхронизации работы" />
  if (!network.isConnected || network.isInternetReachable === false)
    return <Notice message="Подключитесь к сети, чтобы открыть КП и отзывы" />
  return <AuthenticatedSections event={event} />
}
function AuthenticatedSections({ event }: { event: Event }) {
  const { user } = useAuth()
  return user ? <UserSections key={`${user._id}:${user.tenantId}:${event._id}`} event={event} /> : null
}
function UserSections({ event }: { event: Event }) {
  const { user } = useAuth()
  const cache = useQueryClient()
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const access = useQuery({
    queryKey: ['native-event-proposals-access', user?._id, user?.tenantId],
    queryFn: async ({ signal }) => {
      const response = await api.get<{ success: boolean; data: MobileBilling }>('/mobile/v1/billing', { signal })
      if (!response.success || !response.data) throw new Error('INVALID_BILLING')
      return response.data.currentTariff
    },
    retry: false,
  })
  const applied = useCallback(async (fresh: AppliedEvent) => {
    if (!alive.current) return
    if (fresh._id !== event._id) throw new Error('EVENT_MISMATCH')
    // The exact proposal read returns only changed public fields. Keep documents,
    // contacts, reminders and every other cached field from the saved entity.
    await publishEntityReadback<Event>('events', fresh, () => alive.current, (merged) => {
      cache.setQueryData<Event[]>(['cached-entities', 'events'], (items) =>
        items?.map((item) => item._id === merged._id ? merged : item))
    })
    if (!alive.current) return
    await cache.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
  }, [cache, event._id])
  const tariff = access.data
  const canPropose = tariff?.allowProposals ?? tariff?.allowDocuments ?? false
  return <View testID="android-e-saved-work-proposals-reviews" style={{ gap: spacing.lg }}>
    {access.isPending ? <Notice message="Проверяем доступ к КП…" /> : access.isError ? <>
      <Notice tone="danger" message="Не удалось проверить доступ к КП" />
      <Button title="Повторить проверку доступа к КП" onPress={() => void access.refetch()} />
    </> : canPropose ? <EventProposalsSection eventId={event._id} eventStatus={event.status} onApplied={applied} />
      : <Notice message="Коммерческие предложения доступны на тарифе с КП" />}
    <EventClientReviewSection event={event} />
  </View>
}
