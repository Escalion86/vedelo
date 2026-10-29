const hasOwn = (value, key) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key)

const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '')

const normalizeTelegram = (value) =>
  String(value ?? '').trim().replace(/^@+/, '').toLowerCase()

export const resetClientMessengerAvailability = (
  existingClient,
  updatePayload
) => {
  const update =
    updatePayload && typeof updatePayload === 'object' && !Array.isArray(updatePayload)
      ? { ...updatePayload }
      : {}
  const phoneChanged =
    hasOwn(update, 'phone') &&
    normalizePhone(update.phone) !== normalizePhone(existingClient?.phone)
  const telegramChanged =
    hasOwn(update, 'telegram') &&
    normalizeTelegram(update.telegram) !==
      normalizeTelegram(existingClient?.telegram)

  if (phoneChanged) {
    // An explicitly supplied Telegram phone is an independent contact.
    if (!hasOwn(update, 'telegramPhone')) update.telegramPhone = null
    update.maxPhoneUnavailable = false
    if (
      String(existingClient?.max ?? '').startsWith('+') &&
      normalizePhone(existingClient.max) === normalizePhone(existingClient?.phone) &&
      (!hasOwn(update, 'max') ||
        normalizePhone(update.max) === normalizePhone(existingClient.max))
    ) {
      update.max = ''
    }
  }
  const telegramPhoneChanged =
    hasOwn(update, 'telegramPhone') &&
    normalizePhone(update.telegramPhone) !== normalizePhone(existingClient?.telegramPhone)
  if (phoneChanged || telegramChanged || telegramPhoneChanged) {
    update.telegramPhoneUnavailable = false
  }

  return update
}
