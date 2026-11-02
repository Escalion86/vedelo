import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { api } from '../../shared/api/client'
import type { Client, Event, Service } from '../../shared/domain/types'
import type { EventDraft } from '../../shared/domain/eventForm'
import type { SignificantDateDraft } from '../../shared/domain/clientForm'
import { getCachedEntity, listCachedEntities, publishEntityReadback, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalEntityIdentity, localEntityIdentity, resolveLocalEntityId } from '../../shared/storage/localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'
import { saveLocalEntity } from '../../shared/storage/mutations'
import type { PhotoDraftFields } from './PhotoDraftSection'

const phone = z.union([z.number().finite().nonnegative(), z.string()]).nullable().optional()
const clientDraftSchema = z.object({ firstName: z.string().max(300), phone, whatsapp: phone, viber: phone,
  email: z.string().optional(), telegram: z.string().optional(), instagram: z.string().optional(), vk: z.string().optional(),
  preferredContactChannel: z.enum(['phone', 'whatsapp', 'telegram', 'max', 'vk', 'avito', 'other']).optional() })
const responseSchema = z.object({ fields: z.record(z.string(), z.unknown()), aiFilledFields: z.array(z.string()),
  aiWarnings: z.array(z.string()), clientCreated: z.literal(false), clientDraft: clientDraftSchema.nullable() })
export type AiClientForm = { values: Record<string, unknown>; dates: SignificantDateDraft[] }
type Attempt<F> = { operationId: string; values: Record<string, unknown>; form: F }
export type AiCreateReview = { _id: string; fields: PhotoDraftFields; sourceText: string; aiFilledFields: string[]; aiWarnings: string[];
  clientDraft: z.infer<typeof clientDraftSchema> | null; clientId?: string;
  clientAttempt?: Attempt<AiClientForm>; eventAttempt?: Attempt<EventDraft> }
const collection = '__ai_create_review'
const currentOrThrow = (current: () => boolean) => { if (!current()) throw new Error('SESSION_CHANGED') }
const write = async <T>(current: () => boolean, work: () => Promise<T>) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  return withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity); currentOrThrow(current)
    return work()
  })
}
export const readAiCreateReview = async (id: string): Promise<AiCreateReview | null> => {
  const review = await getCachedEntity<AiCreateReview>(collection, id)
  return review?.clientId ? { ...review, clientId: await resolveLocalEntityId('clients', review.clientId) } : review
}
export const listAiCreateReviews = () => listCachedEntities<AiCreateReview>(collection)
export const openAiCreateReview = async (value: unknown, sourceText: string, current: () => boolean) => {
  currentOrThrow(current)
  const result = responseSchema.parse(value)
  const fields = result.fields as PhotoDraftFields
  if (typeof fields.clientId === 'string') {
    if (!/^[a-f0-9]{24}$/i.test(fields.clientId)) throw new Error('Выбранный клиент недоступен')
    const response = await api.get<{ data: Client }>(`/mobile/v1/clients/${fields.clientId}`)
    if (response.data?._id !== fields.clientId) throw new Error('Выбранный клиент недоступен')
    currentOrThrow(current)
    await publishEntityReadback<Client>('clients', response.data, current, () => {}, { allowMissing: true })
  }
  if (Array.isArray(fields.servicesIds)) {
    for (const id of new Set(fields.servicesIds)) {
      if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new Error('Предложенная услуга недоступна')
      currentOrThrow(current)
      const response = await api.get<{ data: Service }>(`/mobile/v1/services/${id}`)
      if (response.data?._id !== id) throw new Error('Предложенная услуга недоступна')
      currentOrThrow(current)
      await publishEntityReadback<Service>('services', response.data, current, () => {}, { allowMissing: true })
    }
  }
  return write(current, async () => {
    const review: AiCreateReview = { _id: Crypto.randomUUID(), fields, sourceText, aiFilledFields: result.aiFilledFields,
      aiWarnings: result.aiWarnings, clientDraft: result.clientDraft }
    await upsertEntities(collection, [review]); return review
  })
}
const begin = async (id: string, kind: 'clientAttempt' | 'eventAttempt', values: Record<string, unknown>, form: AiClientForm | EventDraft, current: () => boolean) => write(current, async () => {
  const review = await readAiCreateReview(id)
  if (!review) throw new Error('Предложения уже закрыты. Откройте помощника заново')
  if (review[kind]) return review
  if (kind === 'clientAttempt' && review.eventAttempt) throw new Error('Сохранение заявки уже начато')
  const next = { ...review, [kind]: { operationId: Crypto.randomUUID(), values, form } } as AiCreateReview
  currentOrThrow(current); await upsertEntities(collection, [next]); return next
})
export const saveAiSuggestedClient = async (id: string, values: Record<string, unknown>, form: AiClientForm, current: () => boolean) => {
  const review = await begin(id, 'clientAttempt', values, form, current)
  const attempt = review.clientAttempt!
  currentOrThrow(current)
  const client = await saveLocalEntity({ entityType: 'clients', values: attempt.values, operationId: attempt.operationId }) as Client
  await write(current, async () => {
    const latest = await readAiCreateReview(id)
    if (!latest || latest.clientAttempt?.operationId !== attempt.operationId) throw new Error('Предложения уже закрыты')
    currentOrThrow(current); await upsertEntities(collection, [{ ...latest, clientId: client._id }])
  })
  currentOrThrow(current); return client
}
export const saveAiCreatedEvent = async (id: string, values: Record<string, unknown>, form: EventDraft, current: () => boolean) => {
  const review = await begin(id, 'eventAttempt', values, form, current)
  const attempt = review.eventAttempt!
  currentOrThrow(current)
  const event = await saveLocalEntity({ entityType: 'events', values: attempt.values, operationId: attempt.operationId }) as Event
  await write(current, async () => { await removeCachedEntity(collection, id) })
  currentOrThrow(current); return event
}
export const discardAiCreateReview = (id: string, current: () => boolean) => write(current, async () => {
  const review = await readAiCreateReview(id)
  if (review?.eventAttempt) throw new Error('Сохранение заявки уже начато. Проверьте его результат')
  currentOrThrow(current); await removeCachedEntity(collection, id)
})
