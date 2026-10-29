const extractHandle = (rawValue, domains = []) => {
  let value = String(rawValue ?? '').trim()
  if (!value) return ''

  // Часто копируют с переносами/пробелами — берем первую "часть".
  value = value.split(/\s+/)[0]
  value = value.replace(/^@+/, '')
  value = value.replace(/^https?:\/\//i, '')
  value = value.replace(/^www\./i, '')
  value = value.replace(/^m\./i, '')

  const lowerValue = value.toLowerCase()
  for (const domain of domains) {
    const normalizedDomain = String(domain).toLowerCase()
    if (lowerValue.startsWith(`${normalizedDomain}/`)) {
      value = value.slice(normalizedDomain.length + 1)
      break
    }
    if (lowerValue === normalizedDomain) {
      value = ''
      break
    }
  }

  value = value.replace(/^@+/, '').replace(/^\/+/, '')
  value = value.split(/[/?#]/)[0]

  return value.trim()
}

export const normalizeTelegramPhoneInput = (value) => {
  const text = String(value ?? '').trim()
  if (!/^\+?[\d\s().\-‐‑‒–—]+$/u.test(text)) return ''
  const digits = text.replace(/\D/g, '')
  if (/^[78]\d{10}$/.test(digits)) return `+7${digits.slice(1)}`
  if (/^[3489]\d{9}$/.test(digits)) return `+7${digits}`
  return ''
}

export const normalizeTelegramInput = (value) =>
  normalizeTelegramPhoneInput(value) || extractHandle(value, ['t.me', 'telegram.me'])

export const normalizeInstagramInput = (value) =>
  extractHandle(value, ['instagram.com'])

export const normalizeVkInput = (value) =>
  extractHandle(value, ['vk.com', 'vk.ru', 'vkontakte.ru'])

export const normalizeEmailInput = (value) => String(value ?? '').trim()

