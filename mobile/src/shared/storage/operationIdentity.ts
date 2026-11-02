import { resolveLocalEntityId } from './localEntityIds'

// Sync remaps temporary references inside pending payloads. A durable retry
// must compare their resolved meanings, not mistake that remap for a new edit.
export const resolveOperationPayload = async <T>(input: T): Promise<T> => {
  const resolutions = new Map<string, Promise<string>>()
  const resolve = (id: string) => {
    if (!resolutions.has(id)) resolutions.set(id, (async () => {
      for (const type of ['clients', 'events', 'services', 'transactions']) {
        const resolved = await resolveLocalEntityId(type, id)
        if (resolved !== id) return resolved
      }
      return id
    })())
    return resolutions.get(id)!
  }
  const canonical = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string' && value.startsWith('local-')) return resolve(value)
    if (Array.isArray(value)) return Promise.all(value.map(canonical))
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b)).map(async ([key, item]) => [key, await canonical(item)])))
    return value
  }
  return await canonical(input) as T
}
export const sameOperationPayload = async (left: unknown, right: unknown) =>
  JSON.stringify(await resolveOperationPayload(left)) === JSON.stringify(await resolveOperationPayload(right))
