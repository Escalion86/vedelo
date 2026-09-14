const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const baseConfig = require('./app.json').expo

module.exports = ({ config }) => {
  const resolved = { ...baseConfig, ...config }
  const development = process.env.APP_VARIANT === 'development'
  const localGoogleServicesFile = resolve(__dirname, 'google-services.json')
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(localGoogleServicesFile) ? localGoogleServicesFile : '')
  const android = {
    ...resolved.android,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  }

  if (!development) return { ...resolved, android }

  return {
    ...resolved,
    name: 'Ведело Dev',
    scheme: ['vedelo-dev', 'artistcrm-dev'],
    ios: {
      ...resolved.ios,
      bundleIdentifier: 'ru.escalion.artistcrm.dev',
    },
    android: {
      ...android,
      package: 'ru.escalion.artistcrm.dev',
    },
    extra: {
      ...resolved.extra,
      appVariant: 'development',
    },
  }
}
