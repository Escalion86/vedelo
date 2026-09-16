import {
  captureRegistrationReferrer,
  clearRegistrationReferrer,
  getRegistrationReferrer,
  normalizeRegistrationReferrer,
} from './registrationReferral'

let mockStored: string | null = null
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => mockStored),
  setItemAsync: jest.fn(async (_key: string, value: string) => {
    mockStored = value
  }),
  deleteItemAsync: jest.fn(async () => {
    mockStored = null
  }),
}))

describe('registration referral', () => {
  beforeEach(() => {
    mockStored = null
  })
  it('accepts only a single ObjectId from a deep link', () => {
    expect(normalizeRegistrationReferrer(' ABCDEF123456ABCDEF123456 ')).toBe(
      'abcdef123456abcdef123456'
    )
    for (const value of [undefined, ['111111111111111111111111'], {}, 'bad-id'])
      expect(normalizeRegistrationReferrer(value)).toBe('')
  })
  it('survives the VK browser roundtrip without referral query parameters', async () => {
    const id = '111111111111111111111111'
    await captureRegistrationReferrer(id)
    expect(await captureRegistrationReferrer(undefined)).toBe(id)
    expect(await getRegistrationReferrer()).toBe(id)
    await clearRegistrationReferrer()
    expect(await getRegistrationReferrer()).toBe('')
  })
  it('discards expired or corrupt invitations', async () => {
    mockStored = JSON.stringify({
      referrerId: '111111111111111111111111',
      capturedAt: Date.now() - 31 * 86400000,
    })
    expect(await getRegistrationReferrer()).toBe('')
    expect(mockStored).toBeNull()
    mockStored = '{'
    expect(await getRegistrationReferrer()).toBe('')
  })
})
