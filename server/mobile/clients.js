const CLIENT_FIELDS = [
  '_id', 'syncVersion', 'firstName', 'secondName', 'thirdName', 'phone',
  'whatsapp', 'viber', 'telegram', 'email', 'instagram', 'vk',
  'max',
  'preferredContactChannel', 'preferredContactChannelOther',
  'messengerPushMuted', 'comment', 'clientType', 'town', 'significantDates',
  'legalName', 'inn', 'kpp', 'ogrn', 'bankName', 'bik', 'checkingAccount',
  'correspondentAccount', 'legalAddress', 'updatedAt',
  'documents',
]

const serializeMobileClient = (client) => {
  if (!client || typeof client !== 'object') return null
  const source = typeof client.toObject === 'function' ? client.toObject() : client
  return Object.fromEntries(CLIENT_FIELDS
    .filter((field) => source[field] !== undefined)
    .map((field) => [field, source[field]]))
}

const countMap = (value = {}) => Object.fromEntries([
  'events', 'eventsOtherContacts', 'eventsColleague', 'transactions',
  'avitoConversations', 'avitoMessages', 'vkConversations', 'vkMessages',
  'calls', 'total',
].map((key) => [key, Math.max(0, Number(value?.[key] || 0))]))

export const sanitizeMobileClientMergePayload = (payload = {}) => {
  if (payload?.success !== true) {
    return {
      success: false,
      error: {
        code: payload?.error?.code || 'client_merge_error',
        type: payload?.error?.type || 'validation',
        message: payload?.error?.message || 'Не удалось объединить клиентов',
      },
    }
  }
  const data = payload.data || {}
  if (data.preview) {
    return {
      success: true,
      data: {
        targetClient: serializeMobileClient(data.targetClient),
        duplicateClient: serializeMobileClient(data.duplicateClient),
        preview: countMap(data.preview),
      },
    }
  }
  return {
    success: true,
    data: {
      client: serializeMobileClient(data.client),
      deletedClientId: String(data.deletedClientId || ''),
      moved: countMap(data.moved),
    },
  }
}

export { serializeMobileClient }
