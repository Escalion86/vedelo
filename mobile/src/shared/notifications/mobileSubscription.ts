import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import * as Application from 'expo-application'
import { api } from '../api/client'
import { device, deviceSession } from '../native/device'
import { getAuthSessionEpoch } from '../auth/tokenStore'

export type MobilePushProvider = 'expo' | 'rustore'
const key = 'vedelo.push.installation', pendingKey = 'vedelo.push.pending-disable'
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
let writes: Promise<unknown> = Promise.resolve()
let pushEpoch = 0
const withWrite = <T,>(operation: () => Promise<T>): Promise<T> => {
  const task = writes.catch(() => undefined).then(operation); writes = task.catch(() => undefined); return task
}
export const hasMobilePushRegistry = () => typeof device?.pushCapabilities === 'function'
export const mobilePushIsCurrent = (deliveryId: unknown) => !deliveryId || deliveryId === deviceSession()?.generation
export async function registerMobilePush(token: string, provider: MobilePushProvider) {
  const session = deviceSession(), epoch = getAuthSessionEpoch(), pushTicket = pushEpoch
  if (!session || !hasMobilePushRegistry()) return false
  return withWrite(async () => {
    const current = () => epoch === getAuthSessionEpoch() && session === deviceSession() && pushTicket === pushEpoch
    if (!current()) return false
    const raw = await SecureStore.getItemAsync(key)
    let installation: { installationId: string; revision: number }
    try { installation = JSON.parse(raw || 'null') } catch { installation = null as never }
    if (!installation || typeof installation.installationId !== 'string' || !Number.isSafeInteger(installation.revision)) installation = { installationId: Crypto.randomUUID(), revision: 0 }
    installation.revision++
    await SecureStore.setItemAsync(key, JSON.stringify(installation), options)
    const status = await device!.getStatus()
    if (!current()) return false
    const response = await api.post<{ success: boolean; data: { deliveryId: string; revision: number } }>('/mobile/v1/push/subscription', {
      ...installation, deliveryId: session.generation, provider, pushToken: token,
      applicationId: Application.applicationId || 'ru.escalion.vedelo', showDetails: status.showWhileLocked,
    })
    if (!current() || !response.success || response.data?.deliveryId !== session.generation || response.data.revision !== installation.revision) return false
    return device!.activatePush(session.generation, provider)
  })
}
export async function flushMobilePushDisable() {
  return withWrite(async () => {
    const pending = await SecureStore.getItemAsync(pendingKey)
    if (!pending) return
    if (pending === deviceSession()?.generation) await api.delete('/mobile/v1/push/subscription')
    if (await SecureStore.getItemAsync(pendingKey) === pending) await SecureStore.deleteItemAsync(pendingKey)
  })
}
export async function disableMobilePush() {
  pushEpoch++
  const session = deviceSession()
  device?.clearPush?.()
  if (!session) return false
  await SecureStore.setItemAsync(pendingKey, session.generation, options)
  try { await flushMobilePushDisable(); return false } catch { return true }
}
