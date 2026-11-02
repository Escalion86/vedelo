import * as SecureStore from 'expo-secure-store'
import { clearAuthSession, getAuthSession, getAuthRevision, setAuthSession } from './tokenStore'
import { clearDeviceSession, activateDeviceSession } from '../native/device'
const mockValues = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async key => mockValues.get(key) || null),
  setItemAsync: jest.fn(async (key, value) => { mockValues.set(key, value) }),
  deleteItemAsync: jest.fn(async key => { mockValues.delete(key) }),
}))
jest.mock('../native/device', () => ({ clearDeviceSession: jest.fn(async () => {}), activateDeviceSession: jest.fn(async () => {}) }))
const session = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 900, tokenType: 'Bearer' as const,
  user: { _id: 'user', tenantId: 'tenant', role: 'user', firstName: '', secondName: '', phone: '', email: '', tariffId: null } }
beforeEach(async () => { await clearAuthSession(); jest.clearAllMocks() })
it('clears the native projection before waiting for credential removal', async () => {
  await setAuthSession(session)
  let release!: () => void
  jest.mocked(SecureStore.deleteItemAsync).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const revision = getAuthRevision(), clearing = clearAuthSession()
  expect(clearDeviceSession).toHaveBeenCalledTimes(1)
  expect(getAuthRevision()).toBeGreaterThan(revision)
  expect(await getAuthSession()).toBeNull()
  while (!release) await Promise.resolve()
  release(); await clearing
})
it('serializes in-flight credential writes before logout so restart cannot restore them', async () => {
  let release!: () => void
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce((key, value) => new Promise<void>(resolve => {
    release = () => { mockValues.set(key, value); resolve() }
  }))
  const signIn = setAuthSession(session)
  while (!release) await Promise.resolve()
  const signOut = clearAuthSession()
  release(); await Promise.all([signIn, signOut])
  expect(await getAuthSession()).toBeNull()
  expect(mockValues.size).toBe(0)
})
it('initial startup activates only the authenticated stored user', async () => {
  await setAuthSession(session)
  expect((await getAuthSession())?.user._id).toBe('user')
  expect(activateDeviceSession).toHaveBeenLastCalledWith(session.user)
})
