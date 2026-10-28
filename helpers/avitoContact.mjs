export const normalizeAvitoContactUrl = (value) => {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (!raw || raw.length > 2000 || /[\s\\]/.test(raw)) return ''
  try {
    const url = new URL(/^(www\.)?avito\.ru\//i.test(raw) ? `https://${raw}` : raw)
    if (
      url.protocol !== 'https:' ||
      !['avito.ru', 'www.avito.ru'].includes(url.hostname) ||
      url.username || url.password || url.port ||
      !/^\/user\/[a-zA-Z0-9_-]+\/profile\/?$/.test(url.pathname)
    ) return ''
    return url.href
  } catch {
    return ''
  }
}

export const isValidAvitoContactUrl = (value) =>
  value == null || (typeof value === 'string' &&
    (!value.trim() || Boolean(normalizeAvitoContactUrl(value))))
