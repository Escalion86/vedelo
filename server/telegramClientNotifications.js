import { sendMultiChannelPushToTenant } from '@server/multiChannelPush'

const getClientName = (client) =>
  [client?.firstName, client?.secondName].filter(Boolean).join(' ').trim() ||
  (client?.telegram ? `@${String(client.telegram).replace(/^@/, '')}` : '') ||
  'Новый контакт'

export const notifyTelegramClientCreated = async ({ tenantId, client }) => {
  if (!tenantId || !client?._id) return null

  return sendMultiChannelPushToTenant({
    tenantId,
    source: 'telegram_client_created',
    payload: {
      title: 'Создан клиент из Telegram',
      body: `${getClientName(client)} написал вам. Карточка создана автоматически.`,
      icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
      badge: '/icons/notification-badge.svg',
      tag: `telegram-client-${client._id}`,
      data: {
        url: '/cabinet/clients',
        clientId: String(client._id),
        type: 'telegram_client_created',
      },
    },
  })
}
