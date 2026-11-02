import { queueNativeIntent } from '../src/shared/native/intents'

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // AuthSession receives the original callback through Linking; never put codes in the navigation queue.
    if (/^(?:vedelo|artistcrm)(?:-dev)?:\/\/auth\/yandex-link(?:[?#]|$)/.test(path)) return '/(tabs)/profile'
    if (/^(?:vedelo|artistcrm)(?:-dev)?:\/\/auth\/(?:vk|yandex)(?:[?#]|$)/.test(path)) return '/(auth)/login'
    const url = new URL(path, 'vedelo://app')
    if ((!url.pathname || url.pathname === '/') && /^[a-f\d]{24}$/i.test(url.searchParams.get('ref') || '')) return `/(auth)/login?mode=register&ref=${url.searchParams.get('ref')}`
    if (['vedelo://', 'vedelo:///', 'vedelo-dev://', 'vedelo-dev:///', '/'].includes(path)) return '/'
    // Expo Router navigates to the returned path itself. The root queue listener
    // must not schedule a second replacement while handling this same URL.
    const intent = queueNativeIntent(path, { systemNavigation: true })
    return intent ? `/native/open?intent=${intent.key}` : '/(tabs)'
  } catch { return '/(tabs)' }
}
