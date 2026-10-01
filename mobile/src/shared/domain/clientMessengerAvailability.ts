import type { Client } from './types'

// Mirror helpers/clientMessengerAvailability.js so offline presentation agrees
// with the server reset once a phone or Telegram handle has been edited.
export function resetClientMessengerAvailability(existing: Client | null, payload: Partial<Client>): Partial<Client> {
  const update = { ...payload }
  const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
  const handle = (value: unknown) => String(value ?? '').trim().replace(/^@+/, '').toLowerCase()
  const phoneChanged = Object.hasOwn(update, 'phone') && digits(update.phone) !== digits(existing?.phone)
  const telegramChanged = Object.hasOwn(update, 'telegram') && handle(update.telegram) !== handle(existing?.telegram)
  if (phoneChanged) {
    update.telegramPhone = null
    update.maxPhoneUnavailable = false
    if (existing?.max?.startsWith('+') && digits(existing.max) === digits(existing.phone) &&
      (!Object.hasOwn(update, 'max') || digits(update.max) === digits(existing.max))) update.max = ''
  }
  if (phoneChanged || telegramChanged) update.telegramPhoneUnavailable = false
  return update
}
