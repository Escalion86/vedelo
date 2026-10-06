import type { Client } from '../../shared/domain/types'
import { formatPhoneForDisplay } from '../../shared/format/phone'

export const clientDisplayName = (client?: Client) =>
  [client?.firstName, client?.secondName, client?.thirdName].filter(Boolean).join(' ') ||
  formatPhoneForDisplay(client?.phone) ||
  'Клиент'

const digits = (value?: string | number | null) => String(value || '').replace(/\D/g, '')

/** Повторяет поиск PWA: имя, телефон (нормализованные цифры), соцсети и email. */
export const clientMatchesQuery = (client: Client, query: string) => {
  const needle = query.trim().toLocaleLowerCase('ru')
  if (!needle) return true
  const haystack = [
    [client.firstName, client.secondName, client.thirdName].filter(Boolean).join(' '),
    client.phone, client.whatsapp, client.viber, client.telegramPhone,
    client.email, client.telegram, client.instagram, client.vk, client.max,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value).toLocaleLowerCase('ru'))
    .join(' ')
  if (haystack.includes(needle)) return true
  const needleDigits = digits(needle)
  if (needleDigits.length < 3) return false
  return [client.phone, client.whatsapp, client.viber, client.telegramPhone]
    .some((value) => digits(value).includes(needleDigits))
}

export const searchClients = (clients: Client[], query: string) =>
  clients
    .filter((client) => clientMatchesQuery(client, query))
    .sort((left, right) => clientDisplayName(left).localeCompare(clientDisplayName(right), 'ru'))
