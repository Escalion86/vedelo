import { api } from '../../shared/api/client'
import type { Event, Transaction } from '../../shared/domain/types'
import { getCachedEntity } from '../../shared/storage/cache'
import { localDataEpoch, assertLocalDataEpoch } from '../../shared/storage/localEntityCoordination'
import { localEntityIdentity, assertLocalEntityIdentity } from '../../shared/storage/localEntityIds'
import { runSync } from '../../shared/sync/syncEngine'

export type DepositPayment = { amount: number; paymentMethod: 'transfer' | 'account' | 'cash' | 'barter' }
export async function receiveDeposit(eventId: string, payment: DepositPayment) {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  const event = await getCachedEntity<Event>('events', eventId)
  if (!event || !/^[a-f\d]{24}$/i.test(eventId) || (event.syncStatus && event.syncStatus !== 'synced'))
    throw new Error('Сначала синхронизируйте изменения этой записи.')
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Укажите сумму больше нуля.')
  await assertLocalEntityIdentity(identity); assertLocalDataEpoch(epoch)
  // The shared API uses one deterministic payment ID per tenant/event. A lost
  // response or a second device cannot create another deposit.
  const response = await api.post<{ success: boolean; data: Transaction; event: Event }>(`/events/${eventId}/deposit`, payment)
  await assertLocalEntityIdentity(identity); assertLocalDataEpoch(epoch)
  if (response.success !== true || response.event?._id !== eventId || response.data?.eventId !== eventId)
    throw new Error('Результат не подтверждён. Повторите запрос с той же суммой и способом оплаты.')
  // Pull through the regular conflict-aware sync, never overwrite a concurrent offline edit.
  await runSync()
  return response
}
