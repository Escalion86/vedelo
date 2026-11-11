import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { api } from '../../shared/api/client'
import type { Event } from '../../shared/domain/types'
import type { EventDraft } from '../../shared/domain/eventForm'
import { getCachedEntity, listCachedEntities, publishEntityReadback, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalEntityIdentity, localEntityIdentity } from '../../shared/storage/localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'
import { getOutboxOperation } from '../../shared/storage/outbox'
import { saveLocalEntity } from '../../shared/storage/mutations'
import { runSync } from '../../shared/sync/syncEngine'
import { sameOperationPayload } from '../../shared/storage/operationIdentity'

const objectId = z.string().regex(/^[a-f0-9]{24}$/i)
export const aiPlanSchema = z.object({
  planId: objectId, eventId: objectId, eventTitle: z.string(), eventDate: z.string().nullable().optional(),
  provider: z.string().optional(), model: z.string().optional(),
  clientName: z.string().optional(), expiresAt: z.string(), completed: z.array(z.number().int().nonnegative()),
  eventPatch: z.record(z.string(), z.unknown()), clientPatch: z.record(z.string(), z.unknown()).nullable(),
  steps: z.array(z.object({ entity: z.enum(['event', 'client', 'transaction']), operation: z.enum(['create', 'update']),
    description: z.string(), changes: z.array(z.object({ field: z.string(), label: z.string(), before: z.unknown(), after: z.unknown() })) })),
  done: z.boolean().optional(), expired: z.boolean().optional(), conflict: z.boolean().optional(), error: z.string().optional(),
})
export type AiPlan = z.infer<typeof aiPlanSchema>
export const aiReviewError = (reason: unknown) => {
  if (reason instanceof z.ZodError) return 'Сервер вернул неполные предложения. Проверьте данные и повторите действие'
  const message = reason instanceof Error ? reason.message : 'Не удалось проверить изменения'
  return ({ SESSION_CHANGED: 'Сессия изменилась. Откройте помощника заново', EVENT_HAS_LOCAL_CHANGES: 'Есть несинхронизированные изменения этой записи. Проверьте раздел «Синхронизация», затем продолжите сохранение', OPERATION_CHANGED: 'Сохранение не совпадает с подтверждёнными правками. Нужна ручная сверка' } as Record<string, string>)[message] || message
}
export type AiReview = { _id: string; plan: AiPlan; preview: Event; attempt?: {
  operationId: string; manualChanges: Record<string, unknown>; draft: EventDraft;
} }
const collection = '__ai_event_review'
export const readAiReview = (id: string) => getCachedEntity<AiReview>(collection, id)
export const listAiReviews = () => listCachedEntities<AiReview>(collection)

// The caller captures its session before network I/O. The queue also guards
// logout/clear while a SQL write is already dispatched.
const write = async <T>(current: () => boolean, work: () => Promise<T>) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  return withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    if (!current()) throw new Error('SESSION_CHANGED')
    return work()
  })
}
const assertCurrent = (current: () => boolean) => { if (!current()) throw new Error('SESSION_CHANGED') }
const eventResponse = (value: { data?: Event }, id: string) => {
  if (!value.data || value.data._id !== id) throw new Error('Не удалось перечитать работу')
  return value.data
}

export const openAiReview = async (input: unknown, current: () => boolean) => {
  const plan = aiPlanSchema.parse(input)
  const fresh = eventResponse(await api.get<{ data: Event }>(`/mobile/v1/events/${plan.eventId}`), plan.eventId)
  assertCurrent(current)
  await publishEntityReadback<Event>('events', fresh, current, () => {}, { allowMissing: true })
  return write(current, async () => {
    const previous = await readAiReview(plan.planId)
    if (previous) return previous
    const review: AiReview = { _id: plan.planId, plan, preview: { ...fresh, ...plan.eventPatch, _id: fresh._id } }
    await upsertEntities(collection, [review])
    return review
  })
}

export const refreshAiReview = async (id: string, current: () => boolean) => {
  const plan = aiPlanSchema.parse(await api.get(`/events/ai-edit?planId=${encodeURIComponent(id)}`))
  if (plan.planId !== id) throw new Error('Не удалось проверить план')
  return write(current, async () => {
    const previous = await readAiReview(id)
    if (!previous || previous.plan.eventId !== plan.eventId) throw new Error('Проверка изменений уже закрыта')
    const review = { ...previous, plan }
    await upsertEntities(collection, [review]); return review
  })
}

export const discardAiReview = async (id: string, current: () => boolean) => write(current, async () => {
  const previous = await readAiReview(id)
  if (previous?.attempt || previous?.plan.completed.length) throw new Error('Сохранение уже начато. Проверьте выполненные действия')
  await removeCachedEntity(collection, id)
})

const flights = new Map<string, Promise<Event>>()
export const saveAiReview = (id: string, draft: EventDraft, manualChanges: Record<string, unknown>, current: () => boolean): Promise<Event> => {
  const key = `${localDataEpoch()}:${id}`
  const flight = flights.get(key)
  if (flight) return flight
  const work = saveReview(id, draft, manualChanges, current).finally(() => { if (flights.get(key) === work) flights.delete(key) })
  flights.set(key, work); return work
}
const saveReview = async (id: string, draft: EventDraft, manualChanges: Record<string, unknown>, current: () => boolean): Promise<Event> => {
  const review = await write(current, async () => {
    const previous = await readAiReview(id)
    if (!previous) throw new Error('Проверка изменений уже закрыта')
    if (previous.attempt) return previous as AiReview & { attempt: NonNullable<AiReview['attempt']> }
    const frozen = { ...previous, attempt: { operationId: Crypto.randomUUID(), manualChanges, draft } }
    await upsertEntities(collection, [frozen]); return frozen
  })
  assertCurrent(current)
  const attempt = review.attempt
  let saved: Event
  const prior = await getOutboxOperation(attempt.operationId)
  assertCurrent(current)
  if (prior) {
    // A crash after durable enqueue is a readback, never a second mutation.
    if (prior.entityType !== 'events' || prior.entityId !== review.plan.eventId ||
      !await sameOperationPayload(prior.payload, attempt.manualChanges)) throw new Error('OPERATION_CHANGED')
    const cached = await getCachedEntity<Event>('events', prior.entityId)
    if (!cached) throw new Error('Сохранённая работа удалена. Нужна ручная сверка')
    saved = cached
  } else {
    const plan = aiPlanSchema.parse(await api.post('/events/ai-edit', { mode: 'apply', planId: id }))
    if (plan.planId !== id || plan.eventId !== review.plan.eventId) throw new Error('Не удалось подтвердить результат')
    await write(current, async () => { await upsertEntities(collection, [{ ...review, plan }]) })
    if (plan.conflict || !plan.done) throw new Error(plan.error || 'Не все действия выполнены. Проверьте результат и повторите сохранение')
    const fresh = eventResponse(await api.get<{ data: Event }>(`/mobile/v1/events/${plan.eventId}`), plan.eventId)
    assertCurrent(current)
    await publishEntityReadback<Event>('events', fresh, current, () => {}, { allowMissing: true })
    assertCurrent(current)
    saved = Object.keys(attempt.manualChanges).length
      ? await saveLocalEntity({ entityType: 'events', entityId: plan.eventId, values: attempt.manualChanges,
        baseSnapshot: review.preview, operationId: attempt.operationId }) as Event
      : fresh
  }
  await write(current, async () => { await removeCachedEntity(collection, id) })
  assertCurrent(current)
  void runSync().catch(() => undefined)
  return saved
}

export const aiReviewHighlights = (plan: AiPlan) => {
  const fields = new Set(Object.keys(plan.eventPatch))
  const address = plan.eventPatch.address
  if (address && typeof address === 'object') for (const key of Object.keys(address)) fields.add(key === 'comment' ? 'addressComment' : key)
  if (plan.clientPatch) fields.add('clientId')
  return fields
}
