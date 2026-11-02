export function ruStorePushConfig(applicationId) {
  const suffix = applicationId === 'ru.escalion.vedelo.dev' ? '_DEV' : ''
  const projectId = process.env[`RUSTORE_PUSH_PROJECT_ID${suffix}`], token = process.env[`RUSTORE_PUSH_SERVICE_TOKEN${suffix}`]
  return projectId && /^[\w-]{1,150}$/.test(projectId) && token ? { projectId, token } : null
}
export function mobilePushData(subscription, payload, messageId) {
  const data = {}
  for (const key of ['url', 'type', 'eventId', 'taskId', 'clientId', 'provider', 'conversationId', 'callId']) {
    const value = payload.data?.[key]
    if (typeof value === 'string' && value.length <= (key === 'url' ? 700 : 100)) data[key] = value
  }
  return { ...data, deliveryId: subscription.deliveryId, messageId,
    title: subscription.showDetails ? String(payload.title || 'Ведело').slice(0, 150) : 'Ведело',
    body: subscription.showDetails ? String(payload.body || '').slice(0, 300) : 'Новое уведомление. Откройте приложение.' }
}
export async function sendRuStorePush(subscription, data, fetcher = fetch) {
  const config = ruStorePushConfig(subscription.applicationId)
  if (!config) return { ok: false, invalid: false }
  try {
    const response = await fetcher(`https://vkpns.rustore.ru/v1/projects/${config.projectId}/messages:send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ message: { token: subscription.pushToken, data, android: { ttl: '3600s' } } }), signal: AbortSignal.timeout(10000),
    })
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, invalid: !response.ok && ['NOT_FOUND', 'UNREGISTERED'].includes(body.error?.status) }
  } catch { return { ok: false, invalid: false } }
}
