import { normalizeAiPhone } from './aiEventDraftContacts.mjs'

// A conservative local hint; the model also detects less literal requests.
export const requestsClipboardPhone = (text) =>
  !/(?:не\s+(?:бери|брать|читай|читать|используй|использовать|вставляй|вставлять)|без|не\s+из).{0,50}буфер/i.test(text) &&
  /буфер|(?:скопирован|скопировал|копировал).{0,40}(?:телефон|номер)|(?:телефон|номер).{0,40}(?:скопирован|скопировал|копировал)/i.test(text)

export function parseClipboardPhone(value) {
  if (typeof value !== 'string') return ''
  const source = value.trim()
  // Never send arbitrary clipboard contents (or choose among several numbers).
  // Accept a national number or 7/8 prefix, with conventional grouping only.
  // Parentheses must enclose the area code; a '+' requires country code 7.
  if (!source || source.length > 40 || /[\r\n]/.test(source)) return ''
  if (!/^(?:(?:\+7|7|8)[ \t\u00a0.-]?)?(?:\([3489]\d{2}\)|[3489]\d{2})[ \t\u00a0.-]?\d{3}[ \t\u00a0.-]?\d{2}[ \t\u00a0.-]?\d{2}$/.test(source)) return ''
  const normalized = normalizeAiPhone(source)
  if (/^(\d)\1{9}$/.test(normalized.slice(1))) return ''
  return normalized
}
