import { disableMobilePush, registerMobilePush } from './mobileSubscription'
import { device } from '../native/device'

const mockStorage = new Map<string, string>()
const mockPost = jest.fn(), mockDelete = jest.fn()
let mockEpoch = 1, mockSession: { generation: string } | null
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) || null), setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value) }), deleteItemAsync: jest.fn(async (key: string) => { mockStorage.delete(key) }) }))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))
jest.mock('expo-application', () => ({ applicationId: 'ru.escalion.vedelo.dev' }))
jest.mock('../api/client', () => ({ api: { post: (...args: unknown[]) => mockPost(...args), delete: (...args: unknown[]) => mockDelete(...args) } }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../native/device', () => ({ deviceSession: () => mockSession, device: {
  pushCapabilities: jest.fn(), getStatus: jest.fn(async () => ({ showWhileLocked: false })), activatePush: jest.fn(() => true), clearPush: jest.fn(),
} }))
beforeEach(() => {
  mockStorage.clear(); jest.clearAllMocks(); mockEpoch = 1; mockSession = { generation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
  mockDelete.mockResolvedValue({ success: true })
  mockPost.mockImplementation(async (_path, body) => ({ success: true, data: { deliveryId: body.deliveryId, revision: body.revision } }))
})
it('uses one installation with increasing revisions across provider changes', async () => {
  expect(await registerMobilePush('ExpoPushToken[test]', 'expo')).toBe(true)
  expect(await registerMobilePush('rustore-token-for-test', 'rustore')).toBe(true)
  expect(mockPost.mock.calls.map(([, body]) => [body.installationId, body.revision, body.provider, body.showDetails])).toEqual([
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'expo', false], ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 'rustore', false],
  ])
})
it('never activates a response after switching accounts', async () => {
  let resolve!: (value: unknown) => void
  mockPost.mockImplementation((_path, body) => new Promise(done => { resolve = () => done({ success: true, data: body }) }))
  const registration = registerMobilePush('ExpoPushToken[test]', 'expo')
  for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve()
  expect(resolve).toBeDefined(); mockEpoch++; mockSession = { generation: 'new-account' }; resolve({})
  expect(await registration).toBe(false); expect(device!.activatePush).not.toHaveBeenCalled()
})
it('disabling during registration immediately clears native state and closes the server subscription after the pending write', async () => {
  let resolve!: (value: unknown) => void
  mockPost.mockImplementation((_path, body) => new Promise(done => { resolve = () => done({ success: true, data: body }) }))
  const registration = registerMobilePush('ExpoPushToken[test]', 'expo')
  for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve()
  const disabling = disableMobilePush()
  expect(device!.clearPush).toHaveBeenCalled()
  resolve({}); expect(await registration).toBe(false); expect(await disabling).toBe(false)
  expect(device!.activatePush).not.toHaveBeenCalled(); expect(mockDelete).toHaveBeenCalledWith('/mobile/v1/push/subscription')
})
