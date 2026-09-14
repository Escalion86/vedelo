import { shouldSuppressIncomingMessagePush } from './swPushSuppression.js'

const SERVICE_WORKER_VERSION = 'vedelo-custom-sw-v4'
const MIGRATION_STARTED_AT = String(process.env.BRAND_MIGRATION_STARTED_AT || '')

const SERVICE_WORKER_SCRIPT = `
const SERVICE_WORKER_VERSION = '${SERVICE_WORKER_VERSION}'
const MIGRATION_STARTED_AT = ${JSON.stringify(MIGRATION_STARTED_AT)}
const IS_LEGACY_ORIGIN = /(^|\\.)artistcrm\\.ru$/i.test(self.location.hostname)
const MIGRATION_DAY = MIGRATION_STARTED_AT
  ? Math.floor(Math.max(0, Date.now() - new Date(MIGRATION_STARTED_AT).getTime()) / 86400000) + 1
  : 0
const MIGRATION_LOCKED = IS_LEGACY_ORIGIN && MIGRATION_DAY >= 30
const APP_SHELL_CACHE = MIGRATION_LOCKED ? 'vedelo-migration-shell-v1' : 'vedelo-app-shell-v4'
const RUNTIME_CACHE = MIGRATION_LOCKED ? 'vedelo-migration-runtime-v1' : 'vedelo-runtime-v4'
const ACTIVE_CONVERSATIONS = {}
// Логика живёт в server/swPushSuppression.js (там же тесты);
// сюда функция инжектируется исходником, чтобы SW был самодостаточным.
const shouldSuppressIncomingMessagePush = ${shouldSuppressIncomingMessagePush.toString()}
const APP_SHELL_URLS = [
  MIGRATION_LOCKED ? '/migrate' : '/',
  '/manifest.json',
  '/icons/AppImages/android/android-launchericon-192-192.png',
  '/icons/AppImages/android/android-launchericon-512-512.png',
  '/icons/notification-badge.svg',
]

const isSameOrigin = (requestUrl) => requestUrl.origin === self.location.origin

const isStaticAssetPath = (pathname) =>
  pathname.startsWith('/_next/static/') ||
  pathname.startsWith('/icons/') ||
  pathname.startsWith('/img/') ||
  pathname.startsWith('/fonts/') ||
  pathname === '/manifest.json' ||
  pathname === '/party-manifest.json' ||
  pathname === '/favicon.ico'

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
  if (event.data?.type === 'messenger:active' && event.data.conversationKey) {
    ACTIVE_CONVERSATIONS[String(event.data.conversationKey)] = Date.now()
  }
  if (event.data?.type === 'messenger:inactive' && event.data.conversationKey) {
    delete ACTIVE_CONVERSATIONS[String(event.data.conversationKey)]
  }
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (!isSameOrigin(url)) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/image')) return
  if (url.pathname === '/sw.js') return
  if (url.pathname === '/service-worker.js') return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse
          if (preloadResponse) return preloadResponse

          const navigationRequest = MIGRATION_LOCKED
            ? new Request(new URL('/migrate', self.location.origin).href, request)
            : request
          const networkResponse = await fetch(navigationRequest)
          const runtimeCache = await caches.open(RUNTIME_CACHE)
          runtimeCache.put(navigationRequest, networkResponse.clone())
          return networkResponse
        } catch (error) {
          const cachedResponse = await caches.match(MIGRATION_LOCKED ? '/migrate' : request)
          if (cachedResponse) return cachedResponse

          const appShell = await caches.match(MIGRATION_LOCKED ? '/migrate' : '/')
          if (appShell) return appShell

          return Response.error()
        }
      })()
    )
    return
  }

  if (!isStaticAssetPath(url.pathname)) return

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request)
      const runtimeCache = await caches.open(RUNTIME_CACHE)

      const networkResponsePromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            runtimeCache.put(request, response.clone())
          }
          return response
        })
        .catch(() => null)

      if (cachedResponse) {
        networkResponsePromise.catch(() => null)
        return cachedResponse
      }

      const networkResponse = await networkResponsePromise
      if (networkResponse) return networkResponse

      return Response.error()
    })()
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const registration = self.registration
      if (!registration?.pushManager) return

      let currentSubscription = event.newSubscription || null

      if (!currentSubscription) {
        try {
          const keyResponse = await fetch('/api/push/public-key', {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          const keyPayload = await keyResponse.json().catch(() => ({}))
          const publicKey = keyPayload?.data?.publicKey
          if (!keyResponse.ok || !publicKey) return

          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
          const base64 = (publicKey + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/')
          const rawData = atob(base64)
          const outputArray = new Uint8Array(rawData.length)

          for (let i = 0; i < rawData.length; i += 1) {
            outputArray[i] = rawData.charCodeAt(i)
          }

          currentSubscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray,
          })
        } catch (error) {
          return
        }
      }

      if (!currentSubscription) return

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ subscription: currentSubscription.toJSON() }),
      }).catch(() => null)
    })()
  )
})

self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch (error) {
    payload = {
      title: 'Новое уведомление',
      body: event.data ? String(event.data.text()) : '',
    }
  }

  if (
    shouldSuppressIncomingMessagePush(payload, ACTIVE_CONVERSATIONS, Date.now())
  ) {
    return
  }

  const title = payload?.title || 'Новое уведомление'
  const options = {
    body: payload?.body || '',
    icon:
      payload?.icon ||
      '/icons/AppImages/android/android-launchericon-192-192.png',
    badge: payload?.badge || '/icons/notification-badge.svg',
    tag: payload?.tag || undefined,
    data: payload?.data || {},
    actions: Array.isArray(payload?.actions) ? payload.actions : [],
    renotify: Boolean(payload?.renotify),
    silent: Boolean(payload?.silent),
    requireInteraction: Boolean(payload?.requireInteraction),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event?.notification?.data || {}
  const callId = data?.callId || ''
  let targetUrl = data?.url || '/cabinet/eventsUpcoming'

  if (data?.type === 'novofon_recording' && callId && event.action) {
    const decision =
      event.action === 'create_event'
        ? 'create_event'
        : event.action === 'no_event'
          ? 'no_event'
          : ''

    if (decision) {
      targetUrl =
        decision === 'create_event'
          ? '/cabinet/calls?callId=' + encodeURIComponent(callId)
          : data?.url || '/cabinet/calls'

      event.waitUntil(
        fetch('/api/calls/' + encodeURIComponent(callId) + '/decision', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ decision }),
        })
          .then((response) => response.json().catch(() => null))
          .then((payload) => {
            const url = payload?.data?.url || targetUrl
            return self.clients
              .matchAll({ type: 'window', includeUncontrolled: true })
              .then((clients) => {
                const sameClient = clients.find((client) => {
                  if (!client || !client.url) return false
                  try {
                    const clientUrl = new URL(client.url)
                    const nextUrl = new URL(url, self.location.origin)
                    return clientUrl.origin === nextUrl.origin
                  } catch (error) {
                    return false
                  }
                })

                if (sameClient) {
                  sameClient.focus()
                  if (url) sameClient.navigate(url)
                  return null
                }

                return self.clients.openWindow(url)
              })
          })
      )
      return
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clients) => {
        const sameClient = clients.find((client) => {
          if (!client || !client.url) return false
          try {
            const clientUrl = new URL(client.url)
            const nextUrl = new URL(targetUrl, self.location.origin)
            return clientUrl.origin === nextUrl.origin
          } catch (error) {
            return false
          }
        })

        if (sameClient) {
          sameClient.focus()
          if (targetUrl) sameClient.navigate(targetUrl)
          return null
        }

        return self.clients.openWindow(targetUrl)
      }
    )
  )
})
`.trim()

export { SERVICE_WORKER_SCRIPT, SERVICE_WORKER_VERSION }
