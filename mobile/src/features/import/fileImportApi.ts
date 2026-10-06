import { api } from '../../shared/api/client'
import { envelope, object, readJob, readJobs, validId, InvalidImportResponse, type Draft } from './contract'
export type ImportAction = 'analyze' | 'quote' | 'start' | 'refresh' | 'stop' | 'release'
const path = '/events/file-import'
const requireId = (id: unknown): string => { if (!validId(id)) throw new InvalidImportResponse(); return id }
export const listJobs = async () => readJobs(await api.get(path))
export const getJob = async (id: string) => readJob(await api.get(`${path}?id=${encodeURIComponent(requireId(id))}`), id)
export const changeJob = async (id: string, action: ImportAction, extra: { quoteId?: string } & Partial<Draft> = {}) =>
  // A paid POST must not be replayed even by the auth refresh helper.
  readJob(await api.post(`${path}/${requireId(id)}`, { action, ...extra }, { skipRefresh: true }), id)
export const uploadJob = async (file: { uri: string; name: string; type: string }, note: string) => {
  const form = new FormData()
  form.append('file', file as unknown as Blob)
  form.append('note', note)
  const response = await api.upload(path, form)
  const job = readJob(response)
  const reused = object(response).reused
  if (reused !== undefined && typeof reused !== 'boolean') throw new InvalidImportResponse()
  return { job, reused: reused === true }
}
export const checkEvent = async (eventId: string) => {
  const id = requireId(eventId)
  const data = object(envelope(await api.get(`/events/${id}`)))
  if (data._id !== id || data.deleted === true || data.deletedAt) throw new InvalidImportResponse()
  return id
}
