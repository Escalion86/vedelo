import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../api/client'
import { env } from '../config/env'
import { getAuthSessionEpoch } from './tokenStore'
import type { AuthSession } from './types'

export type YandexProof = { code: string; verifier: string; epoch: number }
export type YandexAccount = { accountExists: boolean; phone: string; referrerId: string }
const anonymous = { skipAuth: true, skipRefresh: true }
const base64url = (value: string) => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = async () => Array.from(await Crypto.getRandomBytesAsync(32), value => value.toString(16).padStart(2, '0')).join('')
const hash = async (value: string) => base64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 }))
const assertCurrent = (epoch: number) => {
  if (epoch !== getAuthSessionEpoch()) throw new Error('Аккаунт изменился. Начните вход через Яндекс заново.')
}
export const isYandexProofCurrent = (proof: YandexProof) => proof.epoch === getAuthSessionEpoch()

export async function beginYandex(link = false, referrerId?: string | null): Promise<YandexProof | null> {
  const epoch = getAuthSessionEpoch()
  const verifier = await random(), state = await hash(await random())
  const redirect = `${env.appScheme}://auth/${link ? 'yandex-link' : 'yandex'}`
  const url = new URL(`${env.apiBaseUrl.replace(/\/$/, '')}/yandex-id/start`)
  url.search = new URLSearchParams({ mobileRedirect: redirect, mobileChallenge: await hash(verifier), mobileState: state }).toString()
  if (referrerId && /^[a-f\d]{24}$/i.test(referrerId)) url.searchParams.set('ref', referrerId)
  assertCurrent(epoch)
  const result = await WebBrowser.openAuthSessionAsync(url.href, redirect)
  assertCurrent(epoch)
  if (result.type !== 'success') return null
  const callback = new URL(result.url)
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== redirect || callback.username || callback.password || callback.hash || callback.searchParams.get('state') !== state)
    throw new Error('Не удалось подтвердить возврат из Яндекс ID. Начните заново.')
  if (callback.searchParams.has('error')) throw new Error(callback.searchParams.get('error') === 'phone_required'
    ? 'Добавьте российский номер телефона в Яндекс ID и разрешите доступ к нему.' : 'Не удалось войти через Яндекс. Попробуйте ещё раз.')
  const code = callback.searchParams.get('code') || ''
  if (!/^[\w-]{43}$/.test(code)) throw new Error('Яндекс не вернул подтверждение входа. Начните заново.')
  // Proof is deliberately memory-only: restarting the process requires a new OAuth flow.
  return { code, verifier, epoch }
}
async function complete<T>(proof: YandexProof, action: 'inspect' | 'login' | 'link', accessToken?: string) {
  assertCurrent(proof.epoch)
  const response = await api.post<{ success: true; data: T }>('/mobile/v1/auth/yandex',
    { action, code: proof.code, verifier: proof.verifier },
    action === 'link' && !accessToken ? {} : { ...anonymous, ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}) })
  assertCurrent(proof.epoch)
  if (!response.success || !response.data) throw new Error('Сервер не подтвердил вход через Яндекс')
  return response.data
}
export const inspectYandex = async (proof: YandexProof) => {
  const data = await complete<YandexAccount>(proof, 'inspect')
  if (typeof data.accountExists !== 'boolean' || !/^7\d{10}$/.test(data.phone)) throw new Error('Сервер не подтвердил номер Яндекс ID')
  return data
}
export const loginYandex = async (proof: YandexProof) => {
  const data = await complete<AuthSession>(proof, 'login')
  if (!data.accessToken || !data.refreshToken || !data.user?._id || !data.user?.tenantId) throw new Error('Сервер не подтвердил вход через Яндекс')
  return data
}
export const linkYandex = async (proof: YandexProof, accessToken?: string) => {
  const data = await complete<{ linked: true }>(proof, 'link', accessToken)
  if (data.linked !== true) throw new Error('Сервер не подтвердил подключение Яндекс ID')
  return data
}
