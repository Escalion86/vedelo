const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL
const rawAppScheme = process.env.EXPO_PUBLIC_APP_SCHEME
const rawVkIdAppId = process.env.EXPO_PUBLIC_VK_ID_APP_ID
const isProduction = process.env.NODE_ENV === 'production'

if (!rawApiBaseUrl) {
  if (isProduction) {
    throw new Error('Production API URL is not configured')
  }
  console.warn('EXPO_PUBLIC_API_BASE_URL is not set')
}

if (
  isProduction &&
  (!rawApiBaseUrl?.startsWith('https://') ||
    /localhost|127\.0\.0\.1/i.test(rawApiBaseUrl))
) {
  throw new Error('Production API URL must use public HTTPS')
}

export const env = {
  apiBaseUrl: rawApiBaseUrl || 'http://localhost:3000/api',
  appScheme: rawAppScheme || 'vedelo',
  vkIdAppId: rawVkIdAppId || '',
}
