import { z } from 'zod'
import NetInfo from '@react-native-community/netinfo'
import { api } from '../../shared/api/client'
import { listCachedEntities, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import type { HistoryFilters, HistoryItem } from './types'
import { filterHistoryItems, normalizeHistoryDates, validEntityId, validHistoryInstant } from './filter'

const itemSchema = z.object({ id: z.string().min(1), entityType: z.enum(['event', 'client', 'transaction']), entityId: z.string(), operation: z.enum(['create', 'update', 'delete', 'merge']), semanticAction: z.string().optional(), entityLabel: z.string(), summary: z.string(), changes: z.array(z.object({ field: z.string(), label: z.string(), oldValue: z.unknown(), newValue: z.unknown() })), actorId: z.string().optional(), actorLabel: z.string().optional(), source: z.string().optional(), occurredAt: z.string().refine(validHistoryInstant), actorType: z.string().optional(), createdAt: z.string().refine(validHistoryInstant).optional(), batchId: z.string().optional(), legacy: z.boolean().optional(), entityExists: z.boolean().optional() })
const responseSchema = z.object({ success: z.literal(true), data: z.array(itemSchema), meta: z.object({ hasMore: z.boolean(), nextCursor: z.string().regex(/^[A-Za-z0-9_-]+$/).nullable().optional() }) })
export class InvalidHistoryResponse extends Error {}
export function readHistoryResponse(response: unknown, cursor?: string | null) {
  const parsed = responseSchema.safeParse(response)
  if (!parsed.success || (parsed.data.meta.hasMore && (!parsed.data.meta.nextCursor || parsed.data.meta.nextCursor === cursor || !parsed.data.data.length)) || (parsed.success && !parsed.data.meta.hasMore && Boolean(parsed.data.meta.nextCursor))) throw new InvalidHistoryResponse('INVALID_HISTORY')
  return parsed.data
}
export const buildHistoryPath = (filters: HistoryFilters, cursor?: string | null) => {
  const query = new URLSearchParams()
  Object.entries(normalizeHistoryDates(filters)).forEach(([key, value]) => { if (value) query.set(key, value) })
  if (cursor) query.set('cursor', cursor)
  query.set('limit', '30')
  return `/histories?${query}`
}
// Serialize only history-cache work. Reads wait for cleanup if a write was
// invalidated while SQLite was awaiting its transaction. No schema/key change.
let cacheQueue: Promise<unknown> = Promise.resolve()
const staleIds = new Set<string>()
const cleanStaleRows = async () => {
  for (const id of staleIds) {
    await removeCachedEntity('activityHistory', id)
    staleIds.delete(id)
  }
}
function cacheWork<T>(work: () => Promise<T>): Promise<T> {
  const result = cacheQueue.catch(() => undefined).then(work)
  cacheQueue = result.catch(() => undefined)
  return result
}
export const loadHistoryPage = async (filters: HistoryFilters, cursor?: string | null, options: { current?: () => boolean; signal?: AbortSignal } = {}) => {
  const response = readHistoryResponse(await api.get(buildHistoryPath(filters, cursor), { signal: options.signal }), cursor)
  if (options.current && !options.current()) return response
  // Keep the existing cache kind, IDs and occurredAt updatedAt contract. A cache
  // failure must not turn a successful server read into an offline success.
  let cacheSaved = true
  try {
    await cacheWork(async () => {
      await cleanStaleRows()
      if (options.current && !options.current()) { cacheSaved = false; return }
      await upsertEntities('activityHistory', response.data.map((item) => ({ ...item, _id: item.id, updatedAt: item.occurredAt })))
      if (options.current && !options.current()) {
        response.data.forEach((item) => staleIds.add(item.id))
        cacheSaved = false
        await cleanStaleRows()
      }
    })
  }
  catch { cacheSaved = false }
  return { ...response, cacheSaved }
}
export const loadCachedHistory = async (filters: HistoryFilters) => {
  const items = await cacheWork(async () => { await cleanStaleRows(); return listCachedEntities<HistoryItem & { _id: string }>('activityHistory') })
  const validated = items.map((item) => itemSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data!)
  return filterHistoryItems(validated, filters)
}
/** Never use cached entityExists as proof; these endpoints resolve tenant from
 * the bearer session. Transactions have no GET detail: use the tenant list. */
export async function availableHistoryRoute(item: Pick<HistoryItem, 'entityType' | 'entityId'>, current: () => boolean) {
  if (!validEntityId(item.entityId) || !['event', 'client', 'transaction'].includes(item.entityType)) return null
  const network = await NetInfo.fetch()
  if (!network.isConnected || network.isInternetReachable === false || !current()) return null
  const response = await api.get<unknown>(item.entityType === 'transaction' ? '/mobile/v1/transactions' : `/mobile/v1/${item.entityType === 'event' ? 'events' : 'clients'}/${item.entityId}`)
  if (!current()) return null
  const envelope = z.object({ success: z.literal(true), data: z.unknown() }).safeParse(response)
  if (!envelope.success) return null
  const data = envelope.data.data
  const found = item.entityType === 'transaction'
    ? Array.isArray(data) && data.some((entry) => entry && typeof entry === 'object' && entry._id === item.entityId)
    : typeof data === 'object' && data !== null && '_id' in data && data._id === item.entityId
  if (!found) return null
  return item.entityType === 'event' ? `/events/${item.entityId}` : item.entityType === 'client' ? `/clients/${item.entityId}` : `/finance/edit/${item.entityId}`
}
