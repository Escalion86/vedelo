import * as WebBrowser from 'expo-web-browser'
import { api } from '../api/client'
import { beginYandex, inspectYandex, linkYandex, loginYandex } from './yandex'
import { redirectSystemPath } from '../../../app/+native-intent'
let mockEpoch = 0, mockRandom = 0
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (size: number) => new Uint8Array(size).fill(++mockRandom),
  digestStringAsync: async (_algorithm: string, value: string) => require('node:crypto').createHash('sha256').update(value).digest('base64'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
}))
jest.mock('./tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../api/client', () => ({ api: { post: jest.fn() } }))
jest.mock('../config/env', () => ({ env: { appScheme: 'vedelo-dev', apiBaseUrl: 'https://mock.test/api' } }))
const code = 'c'.repeat(43)
const browser = WebBrowser.openAuthSessionAsync as jest.Mock
beforeEach(() => {
  jest.clearAllMocks(); mockEpoch = 0; mockRandom = 0
  browser.mockImplementation(async (url: string, redirect: string) => ({ type: 'success', url: `${redirect}?code=${code}&state=${new URL(url).searchParams.get('mobileState')}` }))
  ;(api.post as jest.Mock).mockResolvedValue({ success: true, data: { accountExists: true, phone: '79000000001' } })
})
it('binds the opaque callback to PKCE and local state; only proof, not provider tokens, goes to API', async () => {
  const proof = (await beginYandex(false, 'a'.repeat(24)))!
  const url = new URL(browser.mock.calls[0][0])
  expect(url.origin).toBe('https://mock.test')
  expect(url.pathname).toBe('/api/yandex-id/start')
  expect(url.searchParams.get('ref')).toBe('a'.repeat(24))
  expect(url.searchParams.get('mobileChallenge')).toBe(require('node:crypto').createHash('sha256').update(proof.verifier).digest('base64url'))
  expect(url.searchParams.has('verifier')).toBe(false)
  await inspectYandex(proof)
  expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/yandex', { action: 'inspect', code, verifier: proof.verifier }, { skipAuth: true, skipRefresh: true })
  ;(api.post as jest.Mock).mockResolvedValue({ success: true, data: { linked: true } })
  await linkYandex(proof, 'new-session-token')
  expect(api.post).toHaveBeenLastCalledWith('/mobile/v1/auth/yandex', { action: 'link', code, verifier: proof.verifier }, { skipAuth: true, skipRefresh: true, headers: { Authorization: 'Bearer new-session-token' } })
})
it.each(['state', 'host', 'path', 'code'])('rejects a substituted %s', async (part) => {
  browser.mockImplementation(async (start: string, redirect: string) => {
    const url = new URL(`${redirect}?code=${code}&state=${new URL(start).searchParams.get('mobileState')}`)
    if (part === 'state') url.searchParams.set('state', 'wrong')
    if (part === 'host') url.host = 'evil'
    if (part === 'path') url.pathname = '/yandex/other'
    if (part === 'code') url.searchParams.set('code', 'wrong')
    return { type: 'success', url: url.href }
  })
  await expect(beginYandex()).rejects.toThrow()
  expect(api.post).not.toHaveBeenCalled()
})
it('cancellation makes no request and account changes reject a late browser or API response', async () => {
  browser.mockResolvedValueOnce({ type: 'cancel' })
  expect(await beginYandex()).toBeNull()
  expect(api.post).not.toHaveBeenCalled()
  const proof = (await beginYandex())!
  ;(api.post as jest.Mock).mockImplementation(async () => { mockEpoch++; return { success: true, data: {} } })
  await expect(loginYandex(proof)).rejects.toThrow('Аккаунт изменился')
  await expect(linkYandex(proof)).rejects.toThrow('Аккаунт изменился')
  expect(api.post).toHaveBeenCalledTimes(1)
})
it('returns provider errors without exposing the callback code and routes link callback back to profile', async () => {
  browser.mockImplementation(async (start: string, redirect: string) => ({ type: 'success', url: `${redirect}?error=phone_required&state=${new URL(start).searchParams.get('mobileState')}` }))
  await expect(beginYandex(true)).rejects.toThrow('российский номер')
  expect(redirectSystemPath({ path: `artistcrm://auth/yandex-link?code=${code}`, initial: false })).toBe('/(tabs)/profile')
})
