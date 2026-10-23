export const TELEGRAM_PUSH_AUDIENCES = [
  { value: 'all', label: 'Для всех' },
  { value: 'clients', label: 'Только от клиентов' },
  { value: 'non_clients', label: 'Только от НЕ клиентов' },
]

export const isTelegramPushAudience = (value) =>
  TELEGRAM_PUSH_AUDIENCES.some((option) => option.value === value)

export const normalizeTelegramPushAudience = (value) =>
  isTelegramPushAudience(value) ? value : 'all'

export const allowsTelegramMessagePush = (audience, hasClient) => {
  const normalized = normalizeTelegramPushAudience(audience)
  return (
    normalized === 'all' || (normalized === 'clients' ? hasClient : !hasClient)
  )
}
