import { env } from '../../shared/config/env'

type AndroidPackage = 'ru.escalion.vedelo' | 'ru.escalion.vedelo.dev'
type Release = { versionName: string; downloadUrl: string }

export type AppUpdateResult =
  | { kind: 'unpublished' | 'current' }
  | { kind: 'available'; release: Release }

export const isVedeloAndroidPackage = (value: string | null): value is AndroidPackage =>
  value === 'ru.escalion.vedelo' || value === 'ru.escalion.vedelo.dev'

const isVersionCode = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_100_000_000

export const parseNativeVersionCode = (value: string | null) => {
  const code = value && /^\d+$/.test(value) ? Number(value) : NaN
  return isVersionCode(code) ? code : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// React Native's URL polyfill can append a slash to APK paths without a query.
const isTrustedDownloadUrl = (value: unknown): value is string =>
  typeof value === 'string' && !/[\s\\#]/.test(value) &&
  /^https:\/\/(?:vedelo\.ru|cloud\.escalion\.ru)(?::443)?(?:[/?].*)?$/.test(value)

export const checkAppUpdate = async (
  packageName: AndroidPackage,
  installedVersionCode: number,
  signal: AbortSignal,
  channel?: 'eas-apk'
): Promise<AppUpdateResult> => {
  const baseUrl = env.apiBaseUrl.replace(/\/$/, '')
  const channelParam = channel ? `&channel=${channel}` : ''
  const response = await fetch(`${baseUrl}/mobile/v1/app-update?packageName=${encodeURIComponent(packageName)}${channelParam}`, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal,
  })
  if (!response.ok) throw new Error('App update request failed')

  const payload: unknown = await response.json()
  if (!isRecord(payload) || payload.success !== true) throw new Error('Invalid app update response')
  const release = payload.data
  if (release === null) return { kind: 'unpublished' }
  if (
    !isRecord(release) || release.packageName !== packageName || !isVersionCode(release.versionCode) ||
    typeof release.versionName !== 'string' || !/^[\w.-]{1,48}$/.test(release.versionName)
  ) throw new Error('Invalid app update release')

  if (!isTrustedDownloadUrl(release.downloadUrl)) throw new Error('Invalid app update URL')
  if (release.versionCode <= installedVersionCode) return { kind: 'current' }
  return { kind: 'available', release: { versionName: release.versionName, downloadUrl: release.downloadUrl } }
}
