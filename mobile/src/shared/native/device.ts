import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { clearSharedDraft } from './shareDraft'

export type DeviceStatus = {
  roleAvailable: boolean; roleHeld: boolean; overlayAllowed: boolean; callerEnabled: boolean
  overlayEnabled: boolean; showWhileLocked: boolean; contactsAllowed: boolean; snapshotAvailable: boolean
}
export type PhoneContact = { id: string; name: string; phones: string[] }
export type AppLockStatus = { generation: string | null; requiresAuthentication: boolean; visible: boolean }
export const device = Platform.OS === 'android' ? requireOptionalNativeModule<{
  pushCapabilities(): Promise<{ googleAvailable: boolean; ruStoreConfigured: boolean; ruStoreAvailable: boolean }>
  ruStorePushToken(): Promise<string>
  activatePush(generation: string, provider: 'expo' | 'rustore'): boolean
  clearPush(): void
  addListener(name: 'pushTokenChanged' | 'appLockChanged', listener: () => void): { remove(): void }
  beginSession(identity: string): string
  clearSession(): void
  clearSessionPreservingShare?(): void
  readShare?(generation: string, id: string): Promise<string>
  exportSharedFile?(generation: string, id: string, fileId: string): Promise<string>
  releaseSharedFile?(fileId: string): Promise<void>
  discardShare?(generation: string, id: string): Promise<void>
  setAppLockState(generation: string, locked: boolean): boolean
  getAppLockStatus?(): AppLockStatus
  confirmAppAuthentication?(generation: string): boolean
  reserveProjectionRevision(generation: string): number
  publishProjection(generation: string, revision: number, json: string): Promise<boolean>
  getStatus(): Promise<DeviceStatus>
  setPreference(name: 'callerEnabled' | 'overlayEnabled' | 'showWhileLocked' | 'appLocked' | 'biometricEnabled', enabled: boolean): Promise<void>
  requestCallerRole(): Promise<void>
  openOverlaySettings(): Promise<void>
  lookupNumber(number: string): Promise<string>
  readContacts(): Promise<PhoneContact[]>
  saveContact(name: string, phone: string): Promise<void>
  locateTown(): Promise<{ town: string; region: string }>
  installShortcuts(): Promise<void>
}>('VedeloDevice') : null

let session: { identity: string; generation: string } | null = null
let epoch = 0
export const activateDeviceSession = async (user: { _id: string; tenantId?: string }) => {
  if (!device) return
  const identity = JSON.stringify([user._id, user.tenantId || user._id])
  if (session?.identity === identity) return
  const ticket = ++epoch
  clearSharedDraft()
  session = null
  const generation = await device.beginSession(identity)
  if (ticket === epoch) session = { identity, generation }
}
export const clearDeviceSession = async (preserveAnonymousShare = false) => {
  clearSharedDraft()
  epoch++; session = null
  if (preserveAnonymousShare && device?.clearSessionPreservingShare) await device.clearSessionPreservingShare()
  else await device?.clearSession()
}
export const deviceSession = () => session
