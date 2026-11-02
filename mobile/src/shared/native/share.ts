import * as Crypto from 'expo-crypto'
import { api } from '../api/client'
import { getAuthSessionEpoch } from '../auth/tokenStore'
import { getCachedEntity } from '../storage/cache'
import { encryptAndQueueFile } from '../storage/encryptedFiles'
import { device, deviceSession } from './device'

export type SharedFile = { id: string; name: string; mimeType: string; size: number; preview?: string }
export type IncomingShare = { id: string; text: string; problem: string; files: SharedFile[] }
const validId = (value: string) => /^[a-f\d-]{36}$/i.test(value)
export async function readIncomingShare(id: string): Promise<IncomingShare> {
  const session = deviceSession(), epoch = getAuthSessionEpoch()
  if (!session || !validId(id) || !device?.readShare) throw new Error('Данные недоступны. Отправьте их через «Поделиться» ещё раз.')
  const data = JSON.parse(await device.readShare(session.generation, id)) as IncomingShare
  if (epoch !== getAuthSessionEpoch() || deviceSession()?.generation !== session.generation || data.id !== id || typeof data.text !== 'string' || !Array.isArray(data.files)) throw new Error('Данные больше недоступны')
  if (data.text.length > 20_000 || data.files.length > 5 || data.files.some(file => !validId(file.id) || typeof file.name !== 'string' || file.size <= 0 || file.size > 5 * 1024 * 1024)) throw new Error('Некорректные вложения')
  return data
}
export async function queueSharedFiles(share: IncomingShare, selected: string[], kind: 'events' | 'clients', entityId: string, alive: () => boolean) {
  const session = deviceSession(), epoch = getAuthSessionEpoch()
  if (!session || !device?.exportSharedFile || !/^[a-f\d]{24}$/i.test(entityId)) throw new Error('Выберите сохранённую запись')
  const current = () => alive() && epoch === getAuthSessionEpoch() && deviceSession()?.generation === session.generation
  const assertCurrent = () => { if (!current()) throw new Error('Сессия изменилась') }
  assertCurrent()
  const cached = await getCachedEntity(kind, entityId)
  try {
    const response = await api.get<{ data: { _id: string } }>(`/mobile/v1/${kind}/${entityId}`)
    if (response.data?._id !== entityId) throw Object.assign(new Error('Запись недоступна'), { status: 409 })
  } catch (reason) {
    const status = (reason as { status?: number }).status
    if (!cached || status && status < 500) throw reason
  }
  assertCurrent()
  const files = share.files.filter(file => selected.includes(file.id))
  if (!files.length) throw new Error('Выберите вложения')
  for (const file of files) {
    assertCurrent()
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${share.id}:${file.id}:${kind}:${entityId}`)
    const requestId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
    assertCurrent()
    const uri = await device.exportSharedFile(session.generation, share.id, file.id)
    try {
      assertCurrent()
      await encryptAndQueueFile({ uri, name: file.name, mimeType: file.mimeType, size: file.size, entityType: kind, entityId, attachmentKind: 'entityDocument', requestId, current })
    } finally { await device.releaseSharedFile?.(file.id) }
  }
  assertCurrent()
}
