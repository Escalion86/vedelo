export const MAX_APP_URL = 'max://max.ru/'

const normalizeMaxPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+7${digits}`
  if (digits.length !== 11) return ''
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`
  if (digits.startsWith('7')) return `+${digits}`
  return ''
}

const normalizeMaxUrl = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return ''

  const valueWithProtocol = /^(?:https?:)?\/\//i.test(rawValue)
    ? rawValue.replace(/^\/\//, 'https://')
    : /^(?:www\.)?max\.ru(?:\/|$)/i.test(rawValue)
      ? `https://${rawValue}`
      : rawValue

  try {
    const url = new URL(valueWithProtocol)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (!['http:', 'https:'].includes(url.protocol) || hostname !== 'max.ru')
      return ''
    if (!url.pathname || url.pathname === '/') return ''

    url.protocol = 'https:'
    url.hostname = 'max.ru'
    return url.toString()
  } catch {
    return ''
  }
}

export const normalizeMaxContactInput = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return ''
  return normalizeMaxUrl(rawValue) || normalizeMaxPhone(rawValue)
}

export const isValidMaxContact = (value) =>
  !String(value ?? '').trim() || Boolean(normalizeMaxContactInput(value))

export const getMaxContactAction = (value) => {
  const normalizedValue = normalizeMaxContactInput(value)
  if (!normalizedValue) return null

  if (normalizedValue.startsWith('https://')) {
    return {
      type: 'link',
      url: normalizedValue,
      label: normalizedValue,
    }
  }

  return {
    type: 'phone',
    url: MAX_APP_URL,
    phone: normalizedValue,
    label: normalizedValue,
  }
}
