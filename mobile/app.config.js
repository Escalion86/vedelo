const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const baseConfig = require('./app.json').expo

module.exports = ({ config }) => {
  const resolved = { ...baseConfig, ...config }
  const development = process.env.APP_VARIANT === 'development'
  const configuredUpdateChannel = process.env.VEDELO_ANDROID_UPDATE_CHANNEL
  const androidUpdateChannel = !development && ['play', 'eas-apk'].includes(configuredUpdateChannel)
    ? configuredUpdateChannel
    : 'apk'
  const nativePrototype = development && process.env.VEDELO_NATIVE_PROTOTYPE === '1'
  const localGoogleServicesFile = resolve(__dirname, 'google-services.json')
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(localGoogleServicesFile) ? localGoogleServicesFile : '')
  const android = {
    ...resolved.android,
    ...(googleServicesFile && !nativePrototype ? { googleServicesFile } : {}),
  }
  if (nativePrototype) delete android.googleServicesFile

  const extra = { ...resolved.extra, androidUpdateChannel }
  if (!development) return { ...resolved, android, extra }

  return {
    ...resolved,
    name: 'Ведело Dev',
    scheme: ['vedelo-dev', 'artistcrm-dev'],
    ios: {
      ...resolved.ios,
      bundleIdentifier: 'ru.escalion.vedelo.dev',
    },
    android: {
      ...android,
      package: 'ru.escalion.vedelo.dev',
    },
    extra: {
      ...extra,
      appVariant: 'development',
    },
  }
}
