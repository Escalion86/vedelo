export type NativeDestination = { href: string; entity?: { kind: 'events' | 'clients'; id: string } }
type PendingIntent = { key: number; destination: NativeDestination; identity: string | null; systemNavigation?: boolean }
const webHosts = new Set(['vedelo.ru', 'www.vedelo.ru', 'artistcrm.ru', 'www.artistcrm.ru'])
const schemes = new Set(['vedelo:', 'artistcrm:', 'vedelo-dev:', 'artistcrm-dev:'])
const userPages = new Set(['calls', 'statistics', 'services', 'referrals', 'integrations', 'import', 'notifications', 'documents', 'settings', 'lists', 'learning', 'news', 'client-reviews', 'review-page'])
const validId = (value: string) => /^[a-f\d]{24}$/i.test(value) || /^local-[a-z\d-]{1,100}$/i.test(value)
export const resolveNativeDestination = (raw: unknown): NativeDestination | null => {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u001f\\]|%2f|%5c/i.test(raw)) return null
  try {
    const url = new URL(raw.startsWith('/') ? `vedelo://app${raw}` : raw)
    if (url.username || url.password) return null
    let path: string
    if (schemes.has(url.protocol)) path = `${url.hostname === 'app' ? '' : `/${url.hostname}`}${url.pathname}`
    else if (url.protocol === 'https:' && webHosts.has(url.hostname) && !url.port) path = url.pathname
    else return null
    const openEvent = url.searchParams.get('openEvent')
    const openMessenger = url.searchParams.get('openMessenger')
    if (path.startsWith('/cabinet/') && openMessenger && validId(openMessenger)) {
      return { href: `/conversations?clientId=${encodeURIComponent(openMessenger)}`, entity: { kind: 'clients', id: openMessenger } }
    }
    if (path.startsWith('/cabinet/') && openEvent && validId(openEvent)) path = `/events/${openEvent}`
    const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
    if (parts.length === 2 && ['events', 'clients'].includes(parts[0]) && validId(parts[1])) {
      return { href: `/${parts[0]}/${parts[1]}`, entity: { kind: parts[0] as 'events' | 'clients', id: parts[1] } }
    }
    if (parts.length === 3 && ['events', 'clients'].includes(parts[0]) && parts[1] === 'edit' && parts[2] === 'new') {
      const query = new URLSearchParams()
      if (parts[0] === 'events') {
        const mode = url.searchParams.get('mode')
        if (mode === 'voice' || mode === 'text') return { href: `/events/assistant?mode=${mode}` }
        query.set('initialStatus', url.searchParams.get('initialStatus') === 'active' ? 'active' : 'draft')
      }
      return { href: `/${parts[0]}/edit/new${query.toString() ? `?${query}` : ''}` }
    }
    if (path === '/events/assistant') {
      const query = new URLSearchParams(), eventId = url.searchParams.get('eventId'), mode = url.searchParams.get('mode')
      if (mode === 'voice' || mode === 'text') query.set('mode', mode)
      if (eventId) {
        if (!/^[a-f\d]{24}$/i.test(eventId)) return null
        query.set('eventId', eventId)
      }
      return { href: `/events/assistant${query.size ? `?${query}` : ''}`, ...(eventId ? { entity: { kind: 'events' as const, id: eventId } } : {}) }
    }
    if (path === '/native/share') {
      const id = url.searchParams.get('shareId') || ''
      return { href: `/native/share${/^[a-f\d-]{36}$/i.test(id) ? `?shareId=${id}` : ''}` }
    }
    if (path === '/native/caller') {
      const number = (url.searchParams.get('number') || '').replace(/[^\d+]/g, '')
      return { href: `/native/caller${/^\+?\d{7,15}$/.test(number) ? `?number=${encodeURIComponent(number)}` : ''}` }
    }
    if (path === '/native/task-action') {
      const eventId = url.searchParams.get('eventId') || '', taskId = url.searchParams.get('taskId') || '', action = url.searchParams.get('action') || ''
      if (!validId(eventId) || !/^[a-f\d]{24}$/i.test(taskId) || !['complete', 'postpone_1', 'postpone_3'].includes(action)) return null
      return { href: `/native/task-action?${new URLSearchParams({ eventId, taskId, action })}`, entity: { kind: 'events', id: eventId } }
    }
    if (path === '/conversations') {
      const clientId = url.searchParams.get('clientId')
      if (clientId && validId(clientId)) return { href: `/conversations?clientId=${encodeURIComponent(clientId)}`, entity: { kind: 'clients', id: clientId } }
      return { href: path }
    }
    if (['/native/settings', '/native/call-results', '/native/contacts', '/billing'].includes(path)) return { href: path }
    if (parts[0] === 'more' && parts.length === 2 && userPages.has(parts[1])) return { href: path }
    if (parts[0] === 'conversations' && parts.length === 3 && ['avito', 'vk', 'telegram'].includes(parts[1]) && /^[a-f\d]{24}$/i.test(parts[2])) return { href: path }
    const aliases: Record<string, string> = { '/cabinet/eventsUpcoming': '/(tabs)/events', '/cabinet/eventsPast': '/(tabs)/events', '/cabinet/clients': '/(tabs)/clients', '/cabinet/attention': '/(tabs)', '/cabinet/notifications': '/more/notifications' }
    if (Object.hasOwn(aliases, path)) return { href: aliases[path] }
    if (['', '/', '/(tabs)', '/(tabs)/events', '/(tabs)/clients', '/(tabs)/more'].includes(path)) return { href: path || '/(tabs)' }
    return null
  } catch { return null }
}

export const resolveNotificationDestination = (data: Record<string, unknown> | undefined) => {
  if (data?.type === 'incoming_messenger_message') {
    if (typeof data.clientId === 'string' && validId(data.clientId)) return `/conversations?clientId=${encodeURIComponent(data.clientId)}`
    if (['avito', 'vk', 'telegram'].includes(String(data.provider)) && typeof data.conversationId === 'string' && /^[a-f\d]{24}$/i.test(data.conversationId)) return `/conversations/${data.provider}/${data.conversationId}`
    return '/conversations'
  }
  return typeof data?.url === 'string' ? data.url : null
}

let pending: PendingIntent | null = null, identity: string | null = null, sequence = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())
export const pendingNativeIntent = () => pending
export const subscribeNativeIntents = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const queueNativeIntent = (raw: unknown, options?: { systemNavigation?: boolean }) => {
  const destination = resolveNativeDestination(raw)
  if (!destination) return null
  pending = { key: ++sequence, destination, identity, ...(options?.systemNavigation ? { systemNavigation: true } : {}) }; notify(); return pending
}
export const clearNativeIntent = (key?: number) => { if (key === undefined || pending?.key === key) { pending = null; notify() } }
export const setNativeIntentIdentity = (next: string | null) => {
  if (identity !== next && identity !== null) clearNativeIntent()
  identity = next
  if (pending && next && pending.identity === null) { pending = { ...pending, identity: next }; notify() }
}
export const resetNativeIntents = () => { identity = null; clearNativeIntent() }
