import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'))

const app = readJson('app.json').expo
const pkg = readJson('package.json')
const profile = process.env.EAS_BUILD_PROFILE || ''
const onlyProduction = process.argv.includes('--if-production')
const isReleaseProfile = profile === 'production' || profile === 'production-apk'

if (onlyProduction && !isReleaseProfile) {
  console.log(`Release validation skipped for profile: ${profile || 'local'}`)
  process.exit(0)
}

const errors = []
const requireValue = (condition, message) => {
  if (!condition) errors.push(message)
}

const buildProperties = app.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
)?.[1]?.android
const notificationConfig = app.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'
)?.[1]
const apiUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || '').trim()
const vkIdAppId = String(process.env.EXPO_PUBLIC_VK_ID_APP_ID || '').trim()
const googleServicesFile = String(process.env.GOOGLE_SERVICES_JSON || '').trim()
const googleServicesPath = resolve(root, googleServicesFile || 'google-services.json')
let googleServices = null
try {
  googleServices = JSON.parse(readFileSync(googleServicesPath, 'utf8'))
} catch {
  googleServices = null
}

requireValue(app.name === 'Ведело', 'expo.name должен быть Ведело')
requireValue(app.slug === 'vedelo', 'Expo slug должен соответствовать EAS project')
requireValue(app.version === pkg.version, 'package и Expo версии должны совпадать')
requireValue(
  app.scheme?.[0] === 'vedelo' && app.scheme?.includes('artistcrm'),
  'Основной scheme должен быть vedelo, legacy scheme artistcrm должен сохраниться'
)
requireValue(
  app.android?.package === 'ru.escalion.vedelo',
  'Некорректный Android package'
)
requireValue(
  Number.isInteger(app.android?.versionCode) && app.android.versionCode >= 2,
  'Android versionCode должен быть не ниже 2'
)
requireValue(app.android?.allowBackup === false, 'Android backup CRM должен быть отключён')
requireValue(
  buildProperties?.compileSdkVersion === 36 &&
    buildProperties?.targetSdkVersion === 36 &&
    buildProperties?.minSdkVersion === 29,
  'Ожидаются Android compileSdk 36, targetSdk 36 и minSdk 29'
)
requireValue(
  buildProperties?.usesCleartextTraffic === false,
  'Cleartext HTTP должен быть отключён'
)
requireValue(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    app.extra?.eas?.projectId || ''
  ),
  'Не задан EAS projectId'
)
requireValue(
  apiUrl.startsWith('https://') && !/localhost|127\.0\.0\.1/i.test(apiUrl),
  'EXPO_PUBLIC_API_BASE_URL должен быть публичным HTTPS URL'
)
requireValue(/\/api\/?$/.test(apiUrl), 'API URL должен заканчиваться на /api')
requireValue(/^\d+$/.test(vkIdAppId), 'Не задан числовой EXPO_PUBLIC_VK_ID_APP_ID')
requireValue(
  notificationConfig?.defaultChannel === 'default',
  'Не настроен default notification channel'
)
requireValue(
  existsSync(googleServicesPath) && statSync(googleServicesPath).size > 0,
  'Не найден google-services.json: добавьте GOOGLE_SERVICES_JSON как EAS file secret'
)
requireValue(
  googleServices?.client?.some(
    (client) =>
      client?.client_info?.android_client_info?.package_name ===
      app.android?.package
  ),
  `google-services.json не содержит Android client ${app.android?.package}`
)

for (const permission of [
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.SYSTEM_ALERT_WINDOW',
]) {
  requireValue(
    app.android?.blockedPermissions?.includes(permission),
    `Разрешение ${permission} должно быть заблокировано`
  )
}

for (const asset of [
  app.icon,
  app.splash?.image,
  app.android?.adaptiveIcon?.foregroundImage,
  notificationConfig?.icon,
]) {
  const path = resolve(root, String(asset || ''))
  requireValue(
    Boolean(asset) && existsSync(path) && statSync(path).size > 0,
    `Отсутствует release asset: ${asset || '<не задан>'}`
  )
}

if (errors.length) {
  console.error('Android release validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `Android release ${app.version} (${app.android.versionCode}) validated for ${apiUrl}`
)
